# ADR-046 消费前端 consumer-trigger 接入 —— 每个【被触发的前端仓】azure-pipelines.yml 改 5 处

> 作用:后端契约改 REST queue 本前端时传 `e2eOnly=true`(+可选 `affectedModules`)→ 前端**跳过 Build/Deploy**(前端未变)只对**已部署前端 + 新后端**重跑 E2E;`affectedModules` → L1 定向 grep(@module 未到位则降级跑 @floor)。正常 push 行为不变。

## 改点 1 — 文件顶部加 parameters(在 `trigger:` 之前)

```yaml
parameters:
  - name: affectedModules
    type: string
    default: ''
  - name: e2eOnly
    type: boolean
    default: false
```

## 改点 2 — Build stage 加 condition

```yaml
- stage: Build
  displayName: 'Build & Package'
  condition: ne('${{ parameters.e2eOnly }}', 'True')   # consumer-trigger 跳过 Build
  jobs:
```

## 改点 3 — DeployTest stage 改 condition

```yaml
  condition: and(succeeded(), ne('${{ parameters.e2eOnly }}', 'True'))   # consumer-trigger 跳过部署
```

## 改点 4 — E2EVerify stage 改 condition(让 Deploy 跳过时 E2E 仍跑)

```yaml
  condition: not(in(dependencies.DeployTest.result, 'Failed', 'Canceled'))   # 正常 push:Deploy 成功才跑;consumer-trigger:Deploy 跳过仍跑
```

## 改点 5 — 「Run E2E」步:E2E_TARGET/CI 之后、tier-decide 之前,插 consumer-trigger 分支

```powershell
            $affected = '${{ parameters.affectedModules }}'
            if ('${{ parameters.e2eOnly }}' -eq 'True') {
              # ADR-046 consumer-trigger:跳 tier-decide,直接 L1 + affectedModules grep
              # affected 空 / @module 标签未到位 → grep 实跑仅 @floor(L0,无 flaky 全量),@module 到位自动升 L1
              $mods = if ($affected) { (($affected -split ',') | ForEach-Object { "@module:$($_.Trim())" }) -join '|' } else { '' }
              $grep = if ($mods) { "@floor|$mods" } else { '@floor' }
              Write-Host "--- consumer-trigger(后端契约改): grep='$grep' affected='$affected' target=$env:E2E_TARGET ---"
              npx playwright test --grep "$grep" --reporter=line
              if ($LASTEXITCODE -ne 0) { throw "E2E test failed $LASTEXITCODE" }
              exit 0
            }
```

> 注:E2E_TARGET 行保留各仓原值(子路径仓如挂网关 /XXX/ 的保留其 smokePathSuffix 拼接)。改完用 js-yaml 校验 YAML 结构(本地无 pwsh 验不了 PowerShell,靠小步 push 验)。
