import { test, type Page, type TestInfo } from '@playwright/test';

// E2E 失败结构化诊断 helper(跨项目模板)— ADO/CI log 直接看 console/network/DOM,不用下载 trace.zip
export type DiagState = {
  pageErrors: string[];
  consoleErrors: string[];
  network4xx5xx: string[];
};

export function attachDiag(page: Page): DiagState {
  const state: DiagState = { pageErrors: [], consoleErrors: [], network4xx5xx: [] };

  page.on('pageerror', (e) => { state.pageErrors.push(e.message); });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (/Failed to load resource: the server responded with a status of 404/.test(text)) return;
      state.consoleErrors.push(text.slice(0, 300));
    }
  });

  page.on('response', async (r) => {
    const url = r.url();
    const status = r.status();
    if (status >= 500) {
      const body = (await r.text().catch(() => '')).slice(0, 200);
      state.network4xx5xx.push(`${status} ${r.request().method()} ${url} | ${body}`);
      return;
    }
    if (status >= 400 && status !== 401) {
      if (/\.(js|css|json|woff2?|ttf)$/.test(url) || /\/api\//i.test(url)) {
        state.network4xx5xx.push(`${status} ${r.request().method()} ${url}`);
      }
    }
  });

  return state;
}

export async function dumpDiagOnFailure(page: Page, state: DiagState, testInfo: TestInfo): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;

  const pageState = await page.evaluate(() => ({
    url: window.location.href,
    hash: window.location.hash,
    title: document.title,
    bodyTextSnippet: (document.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    rootChildren: document.getElementById('root')?.childElementCount ?? 0,
  })).catch(() => ({ error: 'page evaluate failed' }));

  console.log('=== [E2E FAILURE DIAG] ===');
  console.log(JSON.stringify({
    test: testInfo.title,
    status: testInfo.status,
    pageState,
    pageErrors: state.pageErrors,
    consoleErrors: state.consoleErrors.slice(0, 10),
    network4xx5xx: state.network4xx5xx.slice(0, 15),
  }, null, 2));
  console.log('=== END DIAG ===');
}

export function setupDiag(): { getState: () => DiagState } {
  let state: DiagState = { pageErrors: [], consoleErrors: [], network4xx5xx: [] };
  test.beforeEach(async ({ page }) => { state = attachDiag(page); });
  test.afterEach(async ({ page }, testInfo) => { await dumpDiagOnFailure(page, state, testInfo); });
  return { getState: () => state };
}
