# ADR-042 — Git 推送前必同步(pull --rebase before push)+ 禁裸 force(团队多人协作)

- **状态 / Status**:Accepted
- **日期 / Date**:2026-06-18
- **决策人**:涛哥(PM)
- **影响范围**:跨项目工程标准 — 所有双推/单推工作区(SYSV2 / SRMV2 / HC / MESV1 / TPMV2 / MES / WMS / EAM 等)
- **参见**:ADR-039 ⑤检查 / ADR-015 事实驱动 / `~/.claude/CLAUDE.md` git 节;配套 hook `core-git-pull-before-push-guard.js`(与 `core-git-push-verify.js` 推后验真互补)

---

## 背景 / Context

SYS / MDM 等仓**从单人开发(涛哥 + Claude)转入团队多人协作**(2026-06-18 涛哥告知)。工作方式由此发生本质变化:远程 `master`/`main` 不再是「只有我一条线」,随时可能有团队成员先行提交。

**[实证] 此前机制的缺口**:

- `<workspace>/CLAUDE.md` 双推流程写的是 `cd <repo> && git push origin <branch> && git push github <branch>` —— **无 fetch / pull 前置**(SYSV2 `CLAUDE.md:85` / SRMV2 `:77` / MESV1 `:66` / TPMV2 `:65` 均同形态)。
- 现存 hook `core-git-push-verify.js` 是 **PostToolUse**,只在 push **之后**用独立 `git status -sb` 校验「本地 == 远程」(防 Claude 谎报已推),**不能防「本地落后于同事」**(它看的是 push 后状态,落后场景 push 已被拒)。
- `sysv2-multi-repo-push-guard.js` 是 PreToolUse,但只按「仓 + 分支白名单」拦推送目标,**不查领先/落后**。

单人时这个缺口无害(永远 fast-forward)。团队场景下风险升级:

| 场景 | 后果 |
|---|---|
| 同事先推,我本地落后 | `git push` 被拒 `! [rejected] (fetch first)` —— 卡流程(不丢代码) |
| 落后后习惯性 `git pull`(默认 merge) | 大量无意义 merge commit,历史变乱 |
| **被诱导 `git push --force`** | **直接覆盖同事提交 = 丢代码**(团队协作最忌) |

**批判前提**:靠「Claude 自觉每次先 pull」不可靠(早晚漏)—— 与 ADR-036 CR 门禁、ADR-015 事实驱动同源结论:**高风险纪律必须机制化硬拦,不能靠自律**。

## 决策 / Decision

### D1. 推送前必同步(pull --rebase before push)

任何 `git push` 前,对目标仓的目标分支:

```bash
git -C <repo> fetch origin
git -C <repo> pull --rebase origin <branch>   # 落后则 rebase 解冲突,保持线性历史
git -C <repo> push origin <branch>
git -C <repo> push github <branch>            # 双推仓:origin(协作真源)先同步,再推镜像
```

- **以内网 ADO `origin` 为协作真源**(团队成员都推那里),GitHub `github` 是个人镜像;先 pull/同步 origin,再双推。
- **用 `--rebase` 不用默认 merge** —— 保持历史线性、干净;rebase 冲突先解再 push。
- **单远程仓**(如 MESV1 仅 origin):同理 pull --rebase origin 后 push。

### D2. 禁裸 `--force` / `-f`

团队协作**禁止裸 `git push --force` / `-f`**(会覆盖远程同事提交)。如确需强推,**只用 `--force-with-lease`**(会先校验远程未被他人改动)且**经涛哥显式确认**(Tier 3)。

### D3. 机制化硬拦 hook `core-git-pull-before-push-guard.js`(PreToolUse,跨工作区)

`git push` 命中时:

1. **强推 → deny**,覆盖三种 git 强推语法:长旗标 `--force`(非 `--force-with-lease`)/ 短旗标簇含 `f`(`-f`/`-uf`/`-fu`)/ refspec 前缀 `+`(`+master`/`+src:dst`);
2. 否则 **fetch 目标 remote/branch**(按 shell 分隔符切段排除 echo 字面量;命令含 `origin` 优先 origin = 真源,否则取第一个 push 段;refspec `src:dst` 取目标端 dst 作远程分支)→ **本地落后 N>0 → deny**,提示先 `pull --rebase`;
3. **fetch 失败 / 无 upstream / 判不出分支 → fail-open 放行**(push 自身会因 non-fast-forward 被拒,无覆盖风险;离线不卡流程)。

`core-` 前缀 = 机器级,**所有工作区自动生效**,无需各仓单独配置;通用实现(`<branch>..<remote>/<branch>` 落后计数),不绑定具体仓名/分支。

### D4. clone 默认行为(团队新成员)

`git clone <url>` 默认抓取**远程所有分支**为 remote-tracking 引用(`refs/remotes/origin/*`),但**只检出默认分支**(master/main)为本地工作分支;**不**用 `--single-branch`。SYSV2 等仓已在本机,日常不重新 clone。

### D5. 克隆/初始化必做「分支侦察」—— 禁默认在 master 闷头干(踩坑修订)

**[踩坑实证]** clone 后默认检出 `master`,但团队实际在 `develop`(或其他分支)开发并积累最新提交 —— 在 master 闷头干 = 基于旧代码 = 白干。`git remote show origin` 报的 HEAD 分支常年仍是 master,**不可靠**;最可靠信号是「哪个分支最近有提交 / 领先最多」。

**触发场景**(任一):① 新工作区 bootstrap;② 某仓首次接触;③ 该仓双推分支尚未写进 CLAUDE.md 双推表 + push-guard `REPO_REGISTRY`。

**动作**(任何 work/commit 前先跑一次,只读):

```bash
git fetch --all --prune
# 各远程分支按最近提交时间排名(最顶 = 疑似活跃分支)
git for-each-ref --sort=-committerdate refs/remotes/origin \
  --format='%(refname:short)  last=%(committerdate:short)  by=%(authorname)'
# 当前检出 vs 头部候选 的 落后/领先(left=本地领先 right=远程领先)
git rev-list --left-right --count HEAD...origin/<候选分支>
```

**规则**:**不自动 checkout**,把「当前检出 X vs 疑似活跃分支 Y(领先 N、最近 date、作者)」摆给涛哥确认工作分支;确认后才 `git checkout <Y>` + 写进 CLAUDE.md 双推表 + `REPO_REGISTRY` 锁定,之后才进 pull-before-push 常规流程。**站对分支(D5)是 D1 同步的前提** —— D1 只管「同一分支落后多少」,管不了「站错分支」,二者互补。落点:本 ADR + `workspace-bootstrap` skill §3。

## 影响 / Consequences

- ✅ 团队协作下杜绝「强推覆盖同事代码」「盲 push 撞 non-fast-forward 卡死」;rebase 保线性历史。
- ✅ 与 `core-git-push-verify`(推后验真)互补成「推前防撞 + 推后验真」双门。
- ⚠️ 每次 push 前 hook 多一次 fetch(只读,~1-3s);离线时 fetch 超时后 fail-open(push 本就会失败)。
- ⚠️ rebase 若改写已镜像到 github 的提交,github 推可能需 `--force-with-lease`(边界,经确认)。
- 📌 各工作区 `CLAUDE.md` git 节同步加「pull --rebase before push + 禁裸 force」;全局 `~/.claude/CLAUDE.md` git 段加同条铁律。
- 📌 D5 分支侦察纳入 `workspace-bootstrap` skill §3 + CLAUDE.md `<git 双推表>` 填空前置 —— 双推分支禁默认 master,必先侦察 + 涛哥确认再锁。

## 替代方案 / Alternatives

- **A. 只改文档靠自觉(不加 hook)**:轻量,但靠自律早晚漏,丢代码不可逆 —— 否决(同 ADR-036 结论)。
- **B. hook 不 fetch,只比对已有 remote-tracking**:无网络开销,但 remote-tracking 陈旧时漏判同事新提交(假阴性)—— 否决,fetch 才是 ground truth。
- **C. 维持现状**:团队已进场,撞车/丢代码风险真实存在 —— 否决。
- **D(采纳)**:pull --rebase before push + 禁裸 force + PreToolUse fetch-落后即拦 hook + 文档同步。
