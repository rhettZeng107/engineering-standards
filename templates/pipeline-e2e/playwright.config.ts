import { defineConfig } from '@playwright/test';

// 部署验证 E2E 配置 — Pipeline E2E_Verify Stage 跑这套(跨项目模板,参 standards/cicd-e2e-in-pipeline-standard.md)
// E2E_TARGET 由 pipeline 注入部署后的前端 URL:
//   external 独立站点:http://<host>:<port>
//   shared_iis 子应用:http://<host>:<bp-port>/<vdir>(末尾不带 /,spec 内 goto 自带子路径)
const target = process.env.E2E_TARGET || 'http://localhost:5173';

// grep 经 E2E_GREP 环境变量注入(分层定级用);走 env 而非 CLI --grep,避免 PowerShell→npx 传含 `|` 参数泄漏成 shell 管道符 → reporter EPIPE(见 standards/cicd-e2e-in-pipeline-standard.md §2#6)
const grepEnv = (process.env.E2E_GREP || '').trim();

export default defineConfig({
  testDir: './tests',
  grep: grepEnv ? new RegExp(grepEnv) : undefined,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: target,
    headless: process.env.HEADLESS === 'false' ? false : true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1920, height: 1080 },
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  outputDir: 'test-results',
});
