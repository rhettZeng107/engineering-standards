#!/usr/bin/env bash
# =============================================================================
# migration-gate.sh — 迁移高频坑「机器门」(减法:取代人工记一长串坑库)
#
# 决策:ADR-014 修订 2026-06-22(迁移轨标准瘦身)。把可机器判的高频坑从
#   playbook 文字铁律 → 下沉成一个能跑的门;CI/本体迁移收尾必跑,绿才算迁完。
#   「一个能跑的 gate > 200 行让人记的清单」。只读、不改码、跨项目通用。
#
# 覆盖 4 个根本失效模式中可机器判的部分:
#   ⓪ 完整性盲区 - 枚举漏页:老仓页(Controllers∪Views∪Scripts 三源机器枚举,零黑名单)无新前端同名
#                  且无消解登记 = 漏迁(硬 gate);尤其非CRUD类:看板/统计/报表/拓扑/地图/工作台
#                  —— CRUD/Controller 单源视角天然看不见(MVC dashboard 如 Home 常只有 Controller+Razor)。
#                  注:菜单种子 + 路由 2 源难机器化,由 migration-audit.workflow.js 的 enumeration 维兜(共 5 源)。
#   ① 半迁中间态 - 前端桩 :Edit 页 import 的 service 不含自身模块 = 疑似复制桩(前缀放行=弱判据,真实装以矩阵列为准)
#   ② 半迁中间态 - 后端归属:前端 api 寻址层仍含老后端 marker = 未迁/半迁
#   ③ 入口断链 - 路由孤儿  :路由声明的页无对应 service(弱信号,提示复核)
#
# 用法:
#   migration-gate.sh <frontend_src_dir> [old_backend_markers_csv] [api_addr_glob] [legacy_roots_csv] [coverage_file]
# 例:
#   migration-gate.sh AI.REACT.PROD.TPM/src "CoreTPMWebApi,tpmApi" "src/api/index.js,src/hostMap.js" "_legacy/AL.Extend.TPM,_legacy/AL.Extend.TPM_03" .migration-coverage
#
# coverage_file(可选,启用 Gate0 硬 gate):每行登记一个"无同名新页但已消解"的老仓页,首 token=页名,
#   后跟处置(renamed→X / merged→Y / backlog#NNN / boilerplate)。传入后:已登记=放行,未登记的漏页=硬红(计退出码)。
#   不传则 Gate0 退化为警告级(不计退出码,但打印未消解清单 + 提示完整性未被强制)。
#
# 退出码:0 = 全绿;>0 = 阻断疑点数(Gate1/2 + 传了 coverage_file 时的 Gate0 未消解漏页)。Gate3 恒警告级不计。
# =============================================================================
set -uo pipefail

FE="${1:?用法: migration-gate.sh <frontend_src_dir> [old_markers_csv] [api_glob] [legacy_roots_csv] [coverage_file]}"
OLD_MARKERS="${2:-}"
API_GLOB="${3:-}"
LEGACY_ROOTS="${4:-}"
COVERAGE_FILE="${5:-}"

[ -d "$FE" ] || { echo "❌ 前端目录不存在: $FE"; exit 99; }

fail=0
lc_first() { awk '{print tolower(substr($0,1,1)) substr($0,2)}'; }

echo "════════════════════════════════════════════════════════════"
echo " migration-gate  @ $FE"
echo "════════════════════════════════════════════════════════════"

# ── Gate 0:枚举完整性 critic(老仓页多源枚举 vs 新前端覆盖,零黑名单)──────
# 堵 CRUD-shaped 盲区:枚举不靠 Controller 单源 + 不预过滤 Home/Account 等"样板"
# (Home 可能是 dashboard/个人中心真功能);非CRUD类(看板/统计/报表/拓扑/地图/工作台)一律上册。
echo
echo "── Gate 0 枚举完整性(老仓 Controllers∪Views∪Scripts 三源 vs 新前端,零黑名单)──"
g0=0          # 无同名新页的老仓页(总数)
g0_unres=0    # 其中"未登记消解"的(传 coverage_file 时计入硬红)
if [ -z "$LEGACY_ROOTS" ]; then
  echo "  ⏭  跳过(未传 legacy_roots;强烈建议传,否则整页/非CRUD看板可能漏迁不自知)"
else
  newviews=$(ls "$FE/views" 2>/dev/null | tr '[:upper:]' '[:lower:]' | sort -u)
  cov=""
  [ -n "$COVERAGE_FILE" ] && [ -f "$COVERAGE_FILE" ] && cov=$(awk 'NF{print tolower($1)}' "$COVERAGE_FILE" 2>/dev/null | sort -u)
  IFS=',' read -ra roots <<< "$LEGACY_ROOTS"
  legacy_pages=$(for r in "${roots[@]}"; do
    r=$(printf '%s' "$r" | xargs)
    # 源1+2:Views/Scripts 功能区子目录
    find "$r" -type d \( -path '*/Views/*' -o -path '*/Scripts/*' \) ! -ipath '*shared*' 2>/dev/null \
      | grep -v '/obj/' | sed -E 's#.*/(Views|Scripts)/##' | cut -d/ -f1
    # 源3:Controllers(MVC dashboard 如 Home 常只有 Controller+Razor、无 Views 子目录 —— 正是漏 Home 那一源;排除 Base*)
    find "$r" -path '*Controllers*' -name '*Controller.cs' ! -iname 'Base*' 2>/dev/null | grep -v '/obj/' \
      | xargs -n1 basename 2>/dev/null | sed -E 's/Controller\.cs$//; s/\..*//'
  done | grep -vE '^$' | sort -u)
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    plc=$(printf '%s' "$p" | tr '[:upper:]' '[:lower:]')
    printf '%s\n' "$newviews" | grep -qx "$plc" && continue   # 有同名新页 = 已覆盖
    g0=$((g0+1))
    if [ -n "$cov" ] && printf '%s\n' "$cov" | grep -qx "$plc"; then
      echo "  ✓  '$p' 无同名新页,但已登记消解(coverage_file)"
    else
      echo "  🔴 '$p' 无同名新页 且未登记消解 → .migration-coverage 标注(renamed→X/merged→Y/backlog#NNN)或补迁(尤重看板/统计/报表/工作台等非CRUD页)"
      g0_unres=$((g0_unres+1))
    fi
  done <<< "$legacy_pages"
  if [ "$g0" -eq 0 ]; then
    echo "  ✅ 老仓页全部有同名新前端页"
  elif [ -n "$COVERAGE_FILE" ]; then
    if [ "$g0_unres" -eq 0 ]; then
      echo "  ✅ $g0 个无同名页均已登记消解(硬 gate 通过)"
    else
      echo "  🔴 $g0_unres/$g0 个老仓页未登记消解 → 硬红(补迁 或 登记 .migration-coverage)"
    fi
    fail=$((fail+g0_unres))    # 传了 coverage_file = Gate0 升硬 gate(完整性强制)
  else
    echo "  → $g0 个老仓页无同名新页(未传 coverage_file = 仅警告未强制):本体逐一判(改名/合并→登记 coverage;真漏→补迁)。传 coverage_file 启用硬 gate"
  fi
fi

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
  files=()                                    # M2:数组,消除路径含空格时的词分裂
  if [ -n "$API_GLOB" ]; then
    base=$(dirname "$FE")
    IFS=',' read -ra globs <<< "$API_GLOB"
    for g in "${globs[@]}"; do
      [ -f "$base/$g" ] && files+=("$base/$g")
      [ -f "$g" ] && files+=("$g")
    done
  fi
  IFS=',' read -ra marks <<< "$OLD_MARKERS"
  for m in "${marks[@]}"; do
    m=$(printf '%s' "$m" | xargs)
    # M1:marker 是老后端「字面名」,用 -F 定值匹配(防 marker 含正则元字符误报)
    if [ "${#files[@]}" -gt 0 ]; then
      hits=$(grep -rFn "$m" "${files[@]}" 2>/dev/null | head -5)
    else
      hits=$(grep -rFn "$m" "$scope" --include='*.js' --include='*.jsx' 2>/dev/null | head -5)
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
echo " 结果: Gate0 无同名页=$g0(未消解=$g0_unres$([ -n "$COVERAGE_FILE" ] && echo ',计红' || echo ',仅警告·传coverage_file启用硬gate'))  Gate1 桩=$g1  Gate2 归属=$g2  Gate3 孤儿=$g3(不计红)"
[ "$fail" -eq 0 ] && echo " ✅ 机器门全绿" || echo " 🔴 $fail 个阻断疑点 → 本体复核 / 进迁移矩阵"
echo "════════════════════════════════════════════════════════════"
exit "$fail"
