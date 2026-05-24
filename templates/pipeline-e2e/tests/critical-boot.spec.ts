import { test, expect } from '@playwright/test';
import { setupDiag } from '../helpers/diag';

setupDiag();

// 通用 critical boot — SPA 部署壳子健康(跨项目模板)
// 验:bundle 加载 / #root 挂载 / 无关键资源 5xx / 无 MIME 错配(IIS hash 残留)/ 无 ErrorBoundary / 非白屏
// 业务 token 多由父应用注入或登录;本 spec 验部署壳子正确性,401/业务 API 失败豁免
// E2E_ROOT_PATH:子应用子路径(如 /srm/ /MDM/),external 根站点用 '/'(默认)
const ROOT = process.env.E2E_ROOT_PATH || '/';

test.describe('critical boot(部署壳子)', () => {
  test(`${ROOT} 启动 — bundle + #root + 无 MIME 错配 / ErrorBoundary`, async ({ page }) => {
    const pageErrors: string[] = [];
    const resourceErrors: string[] = [];
    page.on('pageerror', (e) => {
      const msg = e.message || '';
      if (/status code 401|AxiosError.*401/i.test(msg)) return; // 无 token 业务 401 豁免
      pageErrors.push(msg);
    });
    page.on('response', (r) => {
      const url = r.url();
      const status = r.status();
      const isBizApi = /\/api\//.test(url);
      if (status >= 500 && !isBizApi) resourceErrors.push(`${status} ${url}`);
      // MIME 错配:.js/.css 返 200 text/html = IIS SPA fallback 把不存在文件重写成 index.html(部署 hash 残留)
      if (status === 200 && /\.(js|css|mjs)(\?.*)?$/.test(url)) {
        const ct = (r.headers()['content-type'] || '').toLowerCase();
        if (ct.includes('text/html')) resourceErrors.push(`MIME 错配: ${url} 期望 js/css 实际 ${ct}`);
      }
    });

    await page.goto(ROOT, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2_000);

    expect(pageErrors, '启动期无 page error(豁免 401)').toEqual([]);
    expect(resourceErrors, '无 5xx / 资源 MIME 错配').toEqual([]);

    const html = await page.content();
    expect(/出错了|Something went wrong|pageLoadFailed|chunk.*error/i.test(html), '不应渲染 ErrorBoundary 兜底页').toBe(false);
    expect(await page.locator('#root, [id="root"]').count(), '#root 节点应存在').toBeGreaterThan(0);

    await page.screenshot({ path: 'test-results/critical-boot.png', fullPage: false });
  });
});
