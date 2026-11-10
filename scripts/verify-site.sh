#!/usr/bin/env bash
# verify-site.sh — 上线前本地自检（零依赖，可重复跑）
#
# 做四件事：
#   1. 在仓库根目录起 `python3 -m http.server`（HTTP/1.1，严格按部署根 = 仓库根）
#   2. 从 index.html 抽出所有本地引用，递归跟进 ES module / Worker 引用，逐个 curl 断言 200
#   3. 顺带断言：资源路径不以 `/` 开头（GitHub Pages 子路径部署的硬约束）、首屏传输预算 < 80KB
#   4. 打印汇总；任何一项失败 → 非零退出。退出时一定杀掉自己起的服务。
#
# 用法：bash scripts/verify-site.sh
# 可选：PORT=8765 bash scripts/verify-site.sh   （默认自动挑一个空闲端口）

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUDGET_BYTES=$((80 * 1024))
FAILED=0
SERVER_PID=""
TMPDIR_LOCAL="$(mktemp -d)"

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  rm -rf "$TMPDIR_LOCAL"
}
trap 'cleanup' EXIT INT TERM

fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILED=$((FAILED + 1)); }
ok()   { printf '  \033[32m ok \033[0m %s\n' "$1"; }
info() { printf '  ---- %s\n' "$1"; }

pick_port() {
  if [ -n "${PORT:-}" ]; then
    echo "$PORT"
    return
  fi
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

PORT="$(pick_port)"
BASE="http://127.0.0.1:${PORT}"

printf '\n== 图小鱼 · 本地站点自检 ==\n'
printf '根目录: %s\n端口:   %s\n\n' "$ROOT" "$PORT"

# ---------------------------------------------------------------- 1. 起服务
cd "$ROOT" || { echo "cd 失败: $ROOT"; exit 1; }
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >"$TMPDIR_LOCAL/server.log" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 50); do
  if curl -fsS --max-time 2 -o /dev/null "$BASE/" 2>/dev/null; then ready=1; break; fi
  sleep 0.1
done
if [ "$ready" -ne 1 ]; then
  echo "本地服务启动失败（端口 $PORT）。server.log:"
  cat "$TMPDIR_LOCAL/server.log"
  exit 1
fi
info "本地服务已启动 (pid $SERVER_PID) → $BASE/"

# ---------------------------------------------------------------- 2. 抽引用
# 从 index.html 出发，递归跟进 import / new URL(...) / Worker 引用。
# 输出每行 "来源文件<TAB>URL 路径"。
python3 - "$ROOT" >"$TMPDIR_LOCAL/refs.tsv" <<'PY'
import os, re, sys, posixpath
from urllib.parse import urlsplit

root = sys.argv[1]
START = "index.html"
ATTR = re.compile(r'''(?:href|src)\s*=\s*["']([^"']+)["']''', re.I)
IMPORT = re.compile(r'''(?:from\s*|import\s*\(\s*)["']([^"']+)["']''')
URLREF = re.compile(r'''new\s+URL\(\s*["']([^"']+)["']''')

SKIP_SCHEMES = ("http:", "https:", "mailto:", "data:", "javascript:", "tel:")


def norm(spec, base_dir):
    if not spec or spec.startswith("#"):
        return None
    if spec.startswith(SKIP_SCHEMES):
        return None
    path = urlsplit(spec).path
    if not path:
        return None
    if path.startswith("/"):
        return ("ABS", path)
    joined = posixpath.normpath(posixpath.join(base_dir, path))
    if joined.startswith(".."):
        return None
    return ("OK", joined)


seen = set()
rows = [("OK", START, "(页面)")]
work = [(START, "", None)]
while work:
    rel, base_dir, _ = work.pop()
    if rel in seen:
        continue
    seen.add(rel)
    full = os.path.join(root, rel)
    if not os.path.isfile(full):
        continue
    if not (rel.endswith((".html", ".js", ".mjs", ".css", ".webmanifest"))):
        continue
    text = open(full, encoding="utf-8", errors="replace").read()
    specs = []
    if rel.endswith(".html") or rel.endswith(".css"):
        specs += ATTR.findall(text)
        specs += re.findall(r'''url\(\s*["']?([^"')]+)["']?\s*\)''', text)
    if rel.endswith((".js", ".mjs")):
        specs += IMPORT.findall(text)
        specs += URLREF.findall(text)
    else:
        specs += IMPORT.findall(text)
    for spec in specs:
        got = norm(spec.strip(), posixpath.dirname(rel))
        if not got:
            continue
        kind, path = got
        if kind == "ABS":
            rows.append(("@ABS", path, rel))
            continue
        if path in seen:
            continue
        rows.append(("OK", path, rel))
        if os.path.isdir(os.path.join(root, path)):
            path = posixpath.join(path, "index.html")
            if path in seen:
                continue
        work.append((path, "", None))

# 独立的静态文件必须存在（部署与 SEO 要求）
for extra in ("robots.txt", "sitemap.xml", "404.html", ".nojekyll"):
    if os.path.isfile(os.path.join(root, extra)):
        rows.append(("OK", extra, "(required)"))
    else:
        rows.append(("MISSING", extra, "(required)"))

out = set()
for kind, path, src in rows:
    key = (kind, path)
    if key in out:
        continue
    out.add(key)
    print("\t".join((kind, path, src)))
PY

if [ ! -s "$TMPDIR_LOCAL/refs.tsv" ]; then
  echo "未能从 index.html 抽出任何本地引用 —— 抽取逻辑失效或页面为空"
  exit 1
fi

# ---------------------------------------------------------------- 3. 断言
TOTAL=0
ABS_BAD=0
MISSING_LOCAL=0
while IFS=$'\t' read -r kind path src; do
  case "$kind" in
    ABS)
      ABS_BAD=$((ABS_BAD + 1))
      fail "绝对路径（Pages 子路径部署会 404）: $path  ← $src"
      ;;
    MISSING)
      MISSING_LOCAL=$((MISSING_LOCAL + 1))
      fail "必需文件缺失: $path"
      ;;
    OK)
      TOTAL=$((TOTAL + 1))
      code="$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "$BASE/$path")"
      size="$(curl -s -o /dev/null --max-time 5 -w '%{size_download}' "$BASE/$path" 2>/dev/null || echo 0)"
      if [ "$code" = "200" ]; then
        ok "$code  $(printf '%7s' "$size")B  /$path"
      else
        fail "$code  /$path  ← $src"
      fi
      ;;
  esac
done <"$TMPDIR_LOCAL/refs.tsv"

# 首屏传输预算：index.html + 首屏引用的 css/js（未 gzip）
BUDGET_FILES="index.html styles/main.css assets/js/app.js assets/js/compress.js assets/js/detect.js assets/js/format.js workers/compress.worker.js"
BUDGET_SUM=0
for f in $BUDGET_FILES; do
  if [ -f "$ROOT/$f" ]; then
    BUDGET_SUM=$((BUDGET_SUM + $(wc -c <"$ROOT/$f")))
  fi
done
echo
info "首屏传输（未 gzip）: ${BUDGET_SUM}B / 预算 ${BUDGET_BYTES}B"
if [ "$BUDGET_SUM" -lt "$BUDGET_BYTES" ]; then
  ok "体积预算：${BUDGET_SUM}B < ${BUDGET_BYTES}B"
else
  fail "体积预算超标：${BUDGET_SUM}B ≥ ${BUDGET_BYTES}B"
fi

# ---------------------------------------------------------------- 4. 汇总
echo
echo "== 汇总 =="
echo "  HTTP 200 检查: $TOTAL 个本地引用"
echo "  绝对路径:     $ABS_BAD 个"
echo "  必需文件缺失: $MISSING_LOCAL 个"
if [ "$FAILED" -eq 0 ]; then
  echo "  结果: PASS ✅"
  exit 0
fi
echo "  结果: FAIL ❌  共 $FAILED 项失败"
exit 1
