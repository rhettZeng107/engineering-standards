import { test, expect } from '@playwright/test';
import { loginAndInject } from '../helpers/login';
import { setupDiag } from '../helpers/diag';

setupDiag();

// 通用 critical render-walk — 登录后逐路由验渲染健康(跨项目模板)
// 防回归:共享 Table dataSource 收非数组 → dataSource.map is not a function → ErrorBoundary 崩整页
//   (一个共享组件崩可连带崩多个菜单;dev render OK 但 prod build 崩 → 必须打部署 prod 环境验)
// 路由由 E2E_ROUTES 注入(逗号分隔,优先放"曾崩溃 + 关键业务"路由);HashRouter 用 /#<route>,BrowserRouter 用 <route>
const ROUTES = (process.env.E2E_ROUTES || '').split(',').map((s) => s.trim()).filter(Boolean);
const HASH = process.env.E2E_HASH_ROUTER !== 'false'; // 默认 HashRouter
const FATAL = /is not a function|Cannot read propert|undefined is not an object/i; // 数组守卫缺失典型签名
const ERRBOUNDARY = /出错了|Something went wrong|ErrorBoundary|chunk.*error/i;

test.describe('critical render-walk(部署后渲染防回归)', () => {
  test.skip(ROUTES.length === 0, '未配 E2E_ROUTES,跳过 render-walk(至少 critical-boot 兜底)');
  for (const route of ROUTES) {
    test(`渲染健康 ${route}`, async ({ page }) => {
      await loginAndInject(page);
      const fatal: string[] = [];
      page.on('pageerror', (e) => { if (FATAL.test(e.message)) fatal.push(e.message); });
      page.on('console', (m) => { if (m.type() === 'error' && FATAL.test(m.text())) fatal.push(m.text().slice(0, 200)); });

      const url = HASH ? `/#${route}` : route;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }); // 防 ErrorBoundary latch:全新 mount
      await page.waitForTimeout(2_600);

      const snap = await page.evaluate(() => {
        const root = document.getElementById('root');
        const txt = (document.body?.textContent || '').replace(/\s+/g, ' ').trim();
        return { rootChildren: root?.childElementCount ?? 0, bodyLen: txt.length, txt: txt.slice(0, 200) };
      });

      expect(fatal, `${route} 不应有致命 JS 错误(数组守卫缺失)`).toEqual([]);
      expect(ERRBOUNDARY.test(snap.txt), `${route} 不应渲染 ErrorBoundary`).toBe(false);
      expect(snap.rootChildren, `${route} #root 应有子节点`).toBeGreaterThan(0);
      expect(snap.bodyLen, `${route} body 非白屏(>20)`).toBeGreaterThan(20);
    });
  }
});
