import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers/login';
import { setupDiag } from '../helpers/diag';
import { collectMixHits } from '../helpers/i18n-mix';

setupDiag();

// 通用 critical 中英混杂门禁(跨项目模板)— zh-CN 默认模式扫描菜单/标签/列头/按钮渲染文本
// 验:① 原始 i18n key 泄露(menu.org.list)② 未渲染插值 {{}}/${} ③ zh 模式纯英文菜单/标签(白名单豁免)
// 力度=稳健+英文菜单拦(ADR-024 修订 2026-06-18);检测器逻辑见 helpers/i18n-mix.ts
//
// 落地新仓:① 改 loginAs 账号/密码(或子应用换 goto 入口)② 首跑后把误报的合法英文加进 APP_ALLOW
// 豁免:定制双语设计应用(如审计卷宗风,英文是设计而非 bug)整仓不放本 spec —— 见标准 §3.6
// 子应用(需父门户注入 token)standalone 扫不到业务菜单,改由父门户 spec 走查 iframe —— 见标准 §3.6

// 本应用合法英文白名单(首跑后按命中补;COMMON_ALLOW 已含 MDM/SRM/API/KPI/版本号等通用缩写)
const APP_ALLOW: (string | RegExp)[] = [];

test.describe('critical 中英混杂(zh-CN 部署后)', () => {
  test('菜单/标签/列头无原始 key / 未渲染插值 / 纯英文残留', async ({ page, context }) => {
    await context.clearCookies();
    // 改成本应用测试账号;子应用换部署入口 goto(无 token 走查壳子)
    await loginAs(page, '<USER>', '<PASSWORD>');
    await page.waitForTimeout(2_500);

    const { hits, scanned } = await collectMixHits(page, undefined, APP_ALLOW);
    console.log(`[i18n-mix] 扫描 ${scanned} 项 UI 文本,命中 ${hits.length} 项`);
    await page.screenshot({ path: 'test-results/critical-i18n-mix-zh.png', fullPage: false });

    if (hits.length) {
      console.log('--- 中英混杂命中清单 ---\n' + JSON.stringify(hits, null, 2));
    }
    // 哨兵:扫描元素过少 = login/渲染失败,判失败防假绿(反 stub 守门)
    expect(scanned, `扫描 UI 文本 ${scanned} 项过少,疑似 login/渲染失败`).toBeGreaterThanOrEqual(10);
    expect(hits, `zh-CN 模式中英混杂应为空,命中 ${hits.length} 项`).toEqual([]);
  });
});
