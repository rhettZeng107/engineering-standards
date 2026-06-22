#!/usr/bin/env bash
# =============================================================================
# migration-gate.sh — 迁移高频坑「机器门」(减法:取代人工记 12 条坑库)
#
# 决策:ADR-014 修订 2026-06-22(迁移轨标准瘦身)。把可机器判的高频坑从
#   playbook 文字铁律 → 下沉成一个能跑的门;CI/本体迁移收尾必跑,绿才算迁完。
#   「一个能跑的 gate > 200 行让人记的清单」。只读、不改码、跨项目通用。
#
# 覆盖 3 个根本失效模式中可机器判的部分:
#   ① 半迁中间态 - 前端桩 :Edit 页 import 的 service 不含自身模块 = 疑似复制桩
#   ② 半迁中间态 - 后端归属:前端 api 寻址层仍含老后端 marker = 未迁/半迁
#   ③ 入口断链 - 路由孤儿  :路由声明的页无对应 service(弱信号,提示复核)
#
# 用法:
#   migration-gate.sh <frontend_src_dir> [old_backend_markers_csv] [api_addr_glob]
# 例:
#   migration-gate.sh AI.REACT.PROD.TPM/src "CoreTPMWebApi,TPMWebApi,tpmApi" "src/api/index.js,src/hostMap.js"
#
# 退出码:0 = 全绿;>0 = 疑似坑总数(供 CI 判红)。
# =============================================================================
set -uo pipefail

FE="${1:?用法: migration-gate.sh <frontend_src_dir> [old_markers_csv] [api_glob]}"
OLD_MARKERS="${2:-}"
API_GLOB="${3:-}"

[ -d "$FE" ] || { echo "❌ 前端目录不存在: $FE"; exit 99; }

fail=0
lc_first() { awk '{print tolower(substr($0,1,1)) substr($0,2)}'; }

echo "════════════════════════════════════════════════════════════"
echo " migration-gate  @ $FE"
echo "════════════════════════════════════════════════════════════"

# ── Gate 1:前端桩(Edit 页 service import vs 自身模块)────────────────
echo
echo "── Gate 1 前端桩检测(Edit 页 import 的 service 是否含自身模块)──"
g1=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  mod=$(printf '%s' "$f" | sed -E 's#.*/views/([^/]+)/.*#\1#')
  modlc=$(printf '%s' "$mod" | tr '[:upper:]' '[:lower:]')   # 全小写,与 implc 同规则比较
  imports=$(grep -oE '@/service/[A-Za-z0-9]+' "$f" 2>/dev/null | sed 's#.*/##')
  [ -n "$imports" ] || continue
  # 匹配 = import 含自身 service,或模块名以某 service 名为前缀(多页共用聚合 service,如 InspectionRoute←inspection)
  matched=0
  for imp in $imports; do
    implc=$(printf '%s' "$imp" | tr '[:upper:]' '[:lower:]')
    case "$modlc" in "$implc"|"$implc"*) matched=1; break;; esac
  done
  if [ "$matched" -eq 0 ]; then
    echo "  🔴 疑似桩  $f"
    echo "      模块=$mod  import=[$(printf '%s' "$imports" | tr '\n' ',' | sed 's/,$//')]  无自身/聚合 service($modlc)"
    g1=$((g1+1))
  fi
done < <(find "$FE" -ipath '*components/Edit*' -name '*.jsx' 2>/dev/null | sort)
[ "$g1" -eq 0 ] && echo "  ✅ 无前端桩疑点" || echo "  → $g1 个疑似桩(需本体复核:字段数 vs DTO / 子表树)"
fail=$((fail+g1))

# ── Gate 2:后端归属(前端 api 寻址层是否仍指老后端)──────────────────
echo
echo "── Gate 2 后端归属(前端 api 寻址层是否含老后端 marker)──"
g2=0
if [ -z "$OLD_MARKERS" ]; then
  echo "  ⏭  跳过(未传 old_backend_markers)"
else
  scope="$FE"
  files=""
  if [ -n "$API_GLOB" ]; then
    base=$(dirname "$FE")
    IFS=',' read -ra globs <<< "$API_GLOB"
    for g in "${globs[@]}"; do
      [ -f "$base/$g" ] && files="$files $base/$g"
      [ -f "$g" ] && files="$files $g"
    done
  fi
  IFS=',' read -ra marks <<< "$OLD_MARKERS"
  for m in "${marks[@]}"; do
    m=$(printf '%s' "$m" | xargs)
    if [ -n "$files" ]; then
      hits=$(grep -rEn "$m" $files 2>/dev/null | head -5)
    else
      hits=$(grep -rEn "$m" "$scope" --include='*.js' --include='*.jsx' 2>/dev/null | head -5)
    fi
    if [ -n "$hits" ]; then
      cnt=$(printf '%s\n' "$hits" | grep -c .)
      echo "  🔴 老后端 marker '$m' 仍被引用(前 $cnt 行):"
      printf '%s\n' "$hits" | sed 's/^/      /'
      g2=$((g2+1))
    fi
  done
  [ "$g2" -eq 0 ] && echo "  ✅ 无老后端残留引用"
fi
fail=$((fail+g2))

# ── Gate 3:路由孤儿(routes 声明页无对应 service,弱信号)──────────────
echo
echo "── Gate 3 路由孤儿(声明的页是否有对应 service,弱信号提示)──"
g3=0
routes=$(find "$FE" -ipath '*router*' -name '*.js' 2>/dev/null | head -1)
if [ -z "$routes" ]; then
  echo "  ⏭  跳过(未找到 router 文件)"
else
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    plc=$(printf '%s' "$p" | lc_first)
    if [ ! -f "$FE/service/$plc.js" ] && ! ls "$FE"/service/ 2>/dev/null | grep -qi "^$plc\.js$"; then
      echo "  ⚠  路由 '$p' 无 service/$plc.js(可能复用/孤儿,提示复核)"
      g3=$((g3+1))
    fi
  done < <(grep -oE 'path: *"[a-zA-Z]+"' "$routes" 2>/dev/null | sed -E 's/.*"([a-zA-Z]+)".*/\1/' | sort -u)
  [ "$g3" -eq 0 ] && echo "  ✅ 路由均有对应 service"
fi
# Gate 3 仅警告,不计入 fail(弱信号)

echo
echo "════════════════════════════════════════════════════════════"
echo " 结果: Gate1 桩=$g1  Gate2 归属=$g2  Gate3 孤儿警告=$g3(不计红)"
[ "$fail" -eq 0 ] && echo " ✅ 机器门全绿" || echo " 🔴 $fail 个阻断疑点 → 本体复核 / 进迁移矩阵"
echo "════════════════════════════════════════════════════════════"
exit "$fail"
