#!/usr/bin/env bash
# =============================================================================
# field-diff.sh — 迁移「字段级双向 diff」机器门(补 migration-gate.sh 的字段维盲区)
#
# 决策:ADR-014 修订 2026-06-23(TPM 设备父子漏迁复盘)。现有迁移轨字段级铁律
#   覆盖链是「老UI→新前端→新DTO」(UI 功能清单 + 前端桩检测);缺一条独立的
#   「老仓后端实体/DTO 字段集 × 新仓 DTO 字段集」机械并集 diff。父子设备恰掉此缝:
#   老 DTO 有 ParentEqptNo(EquipmentDto.cs:270),新 DTO 无 → 19-agent workflow 没抓到。
#   本门把「老有新无」从「靠 agent 想到」变成「集合差一减必出」(北极星:可独立验证事实源)。
#
# 栈中立:铁律层只要求「字段并集 diff + 登记消解 + 退出码」,与栈无关。
#   实现层「查得准」优选 LSP(ADR-035,symbol 级);本脚本是 grep 兜底引擎(POCO 规整够枚举),
#   按文件扩展名选属性提取器(.cs 默认;Java/TS 见 FIELD_REGEX 覆盖点)。LSP 可作上游喂入。
#
# 做什么:
#   1. 枚举 OLD 类型文件并集的字段名(老仓实体/DTO,源选 DTO 为主 + 实体补)
#   2. 枚举 NEW 类型文件并集的字段名(新仓 DTO 含继承链)
#   3. 归一(strip 前缀 Bas_/Fk_ + 大小写折叠)后求 OLD − NEW = 漏迁候选
#   4. 候选过 coverage 登记消解(renamed→X / merged→Y / intentional / backlog#N);未登记=硬红
#
# 用法:
#   field-diff.sh <old_files_csv> <new_files_csv> [field_coverage_file] [strip_prefixes_csv]
# 例(TPM 设备父子回归):
#   field-diff.sh \
#     "_legacy/AL.Extend.TPM/AL.Extend.EAM.TPM.Models/Dtos/EquipmentDto.cs" \
#     "AI.Extend.TPM.ABP/.../EquipmentGetOutputDto.cs,.../EquipmentGetListOutputDto.cs" \
#     .field-coverage "Bas_,Fk_"
#
# field_coverage_file(可选,启用硬 gate):每行 `<老字段名> <处置>`,首 token=字段名,
#   处置 = renamed→X / merged→Y / intentional(老有意不暴露) / backlog#NNN。
#   不传则退化为警告级(打印候选清单,不计退出码)。
#
# 退出码:0 = 无未登记漏迁候选;>0 = 未登记候选数(进迁移矩阵「字段」行 + 对抗投票)。
# 只读、不改码、跨项目通用。
# =============================================================================
set -uo pipefail

OLD_CSV="${1:?用法: field-diff.sh <old_files_csv> <new_files_csv> [field_coverage_file] [strip_prefixes_csv]}"
NEW_CSV="${2:?缺 new_files_csv}"
COVERAGE_FILE="${3:-}"
STRIP_PREFIXES="${4:-Bas_,Fk_}"

# 属性提取器:v1 = C# 自动属性(`Name { get;`)。FIELD_REGEX 环境变量 = 扩展钩子(grep -oE,输出须=纯属性名)。
# C# 兼容 `public T Name { get; set; }` / `public override int Id { get; protected set; }` / 泛型 / 特性同行 / `= new()`。
#   ⚠ 仅自动属性;C# public 字段 `public string X;` / 表达式体 `=> _x` 不抓 → 那类 DTO 用 LSP 或自定义 FIELD_REGEX。
#   ⚠ 栈中立在「铁律层」(概念跨栈);本脚本 v1 落 C#。非 C#/TS 栈:设 FIELD_REGEX 使 grep -oE 输出恰为属性名,
#      首个非 C# 项目落地时本体验准再固化(别假定现成可用)。
extract_props() {
  local f="$1"
  [ -f "$f" ] || { echo "  ⚠ 文件不存在(跳过): $f" >&2; return 0; }
  if [ -n "${FIELD_REGEX:-}" ]; then
    grep -hoE "$FIELD_REGEX" "$f" 2>/dev/null
  else
    # 取紧邻 `{ get;` 前的标识符 = 属性名;排除方法/表达式体属性(无 get;)
    # CRITICAL:用 [[:blank:]](空格+tab,BSD/GNU 通用),禁 [ \t](ERE 里是字符类{空格,\,t}→截尾字母t字段+漏tab缩进)
    grep -hoE '\b[A-Za-z_][A-Za-z0-9_]*[[:blank:]]*\{[[:blank:]]*get;' "$f" 2>/dev/null \
      | sed -E 's/[[:blank:]]*\{[[:blank:]]*get;.*//'
  fi
}

# 归一:strip 前缀(逗号分隔)+ 小写
normalize() {
  local s="$1" p
  IFS=',' read -ra PFX <<< "$STRIP_PREFIXES"
  for p in "${PFX[@]}"; do
    [ -n "$p" ] && s="${s#"$p"}"
  done
  printf '%s\n' "$s" | tr '[:upper:]' '[:lower:]'
}

collect() {  # CSV → 去重原始属性名(每行一个)
  local csv="$1" f
  IFS=',' read -ra FILES <<< "$csv"
  for f in "${FILES[@]}"; do
    [ -n "$f" ] && extract_props "$f"
  done | sort -u
}

echo "════════ field-diff(字段级双向 diff)════════"
echo " OLD: $OLD_CSV"
echo " NEW: $NEW_CSV"
echo " strip 前缀: $STRIP_PREFIXES   coverage: ${COVERAGE_FILE:-（未传·仅警告）}"
echo "──────────────────────────────────────────"

OLD_RAW="$(collect "$OLD_CSV")"
NEW_RAW="$(collect "$NEW_CSV")"

# 新侧归一集合(用于查表)
NEW_NORM="$(while IFS= read -r n; do [ -n "$n" ] && normalize "$n"; done <<< "$NEW_RAW" | sort -u)"

old_cnt=$(printf '%s\n' "$OLD_RAW" | grep -c . || true)
new_cnt=$(printf '%s\n' "$NEW_RAW" | grep -c . || true)
echo " 老侧字段 $old_cnt 个 / 新侧字段 $new_cnt 个"
echo ""

# I-1 fail-safe:老侧抽不到字段(路径错/非属性文件/提取器不匹配该栈)= 拒绝假绿灯,而非「全有对应」
if [ -z "$OLD_RAW" ]; then
  echo " 🔴 老侧字段集为空(OLD 文件路径错 / 非属性文件 / 提取器不匹配该栈?)→ 拒绝绿灯"
  exit 90
fi

fail=0
cand=0
registered=0
echo "── 漏迁候选(老有·新无)──"
while IFS= read -r o; do
  [ -n "$o" ] || continue
  on="$(normalize "$o")"
  if grep -qxF "$on" <<< "$NEW_NORM"; then
    continue   # 新侧有(归一后)→ 已迁
  fi
  cand=$((cand+1))
  disp=""
  if [ -n "$COVERAGE_FILE" ] && [ -f "$COVERAGE_FILE" ]; then
    # 登记按原始字段名首 token 匹配(大小写不敏感)
    # 首列定值比对(大小写不敏感):避免把字段名插进正则(防注入/误配,对齐 migration-gate M1)
    disp="$(awk -v k="$o" 'tolower($1)==tolower(k){ $1=""; sub(/^[[:space:]]+/,""); print; exit }' "$COVERAGE_FILE" 2>/dev/null)"
  fi
  if [ -n "$disp" ]; then
    registered=$((registered+1))
    echo "  ✓ $o  →  已登记消解($disp)"
  else
    fail=$((fail+1))
    echo "  🔴 $o  →  未登记漏迁候选(改名/合并→登记 .field-coverage;真漏→补迁)"
  fi
done <<< "$OLD_RAW"

[ "$cand" -eq 0 ] && echo "  ✅ 老侧字段在新侧全有对应(归一后)"
echo ""
echo "── 结果 ──"
echo " 候选 $cand(已登记 $registered / 未登记 $fail)"
if [ -z "$COVERAGE_FILE" ]; then
  echo " ⚠ 未传 coverage_file = 仅警告(不计退出码);传 .field-coverage 启用硬 gate"
  exit 0
fi
[ "$fail" -eq 0 ] && echo " ✅ 字段门全绿" || echo " 🔴 $fail 个未登记漏迁候选 → 进迁移矩阵「字段」行 + 对抗投票"
exit "$fail"
