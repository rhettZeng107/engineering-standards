import { type Page } from '@playwright/test';

// 部署后中英混杂检测器(zh-CN 默认模式)— 标准:engineering-standards 前端部署后 E2E 标准
// 三类判定:① 原始 i18n key 泄露 ② 未渲染插值 {{}}/${}/__KEY__ ③ zh 模式纯英文菜单/标签(白名单豁免)
// 力度:稳健 + 英文菜单拦(涛哥 2026-06-18 拍板)

// 扫描的关键 UI 区域(antd5 + pro-components 全工作区通用)
export const DEFAULT_SELECTORS = [
  '.ant-menu-item',
  '.ant-menu-submenu-title',
  '.ant-pro-table-list-toolbar-title',
  '.ant-table-thead th',
  'thead th',
  '.ant-form-item-label label',
  '.ant-tabs-tab',
  '.ant-page-header-heading-title',
  '.ant-btn:not(.ant-btn-icon-only):not(.ant-btn-loading)',
];

// 原始 key:点/下划线/中划线分隔(menu.org.list / common_save_btn),首段字母开头、无空格
const RAW_KEY = /^[a-zA-Z][a-zA-Z0-9]*([._-][a-zA-Z0-9]+){1,}$/;
// 未渲染插值
const INTERP = /\{\{.*?\}\}|\$\{.*?\}|__[A-Z0-9_]+__/;
// 含中日韩表意字符?
const hasCJK = (t: string) => /[㐀-鿿豈-﫿]/.test(t);
// 含拉丁字母?
const hasLatin = (t: string) => /[a-zA-Z]/.test(t);

// 通用白名单(全工作区共享的合法英文:缩写/技术词/产品线名)
export const COMMON_ALLOW: (string | RegExp)[] = [
  /^[A-Z0-9][A-Z0-9./+#-]{0,7}$/, // 短全大写码/缩写(MDM/SRM/MES/EAM/TPM/WMS/API/KPI/SSO/PDF/V2...)
  /^[\d\s.,:：%¥$/+\-—()（）#&]+$/, // 纯数字/符号
  /^v?\d+(\.\d+)*$/i, // 版本号
  'Logo', 'App', 'Token', 'Excel', 'Cookie', 'ERP', 'OA', 'IT', 'OK',
];

export type MixReason = 'raw-key' | 'interp' | 'pure-en';
export type MixHit = { text: string; reason: MixReason };
// scanned = 实际扫到的去重文本数;调用方应断言其 ≥ 下限,防 login/渲染失败扫 0 元素假绿
export type MixResult = { hits: MixHit[]; scanned: number };

// 收集 zh-CN 模式下关键 UI 文本并判定中英混杂命中
export async function collectMixHits(
  page: Page,
  selectors: string[] = DEFAULT_SELECTORS,
  appAllow: (string | RegExp)[] = [],
): Promise<MixResult> {
  // 展开所有折叠子菜单(藏起来的菜单项也要扫)
  for (let r = 0; r < 6; r++) {
    const clicked = await page
      .evaluate(() => {
        const closed = Array.from(
          document.querySelectorAll(
            '.ant-menu-submenu:not(.ant-menu-submenu-open) > .ant-menu-submenu-title',
          ),
        ) as HTMLElement[];
        closed.forEach((el) => el.click());
        return closed.length;
      })
      .catch(() => 0);
    if (!clicked) break;
    await page.waitForTimeout(250);
  }

  const texts: string[] = await page.evaluate((sels: string[]) => {
    const out: string[] = [];
    sels.forEach((sel: string) => {
      document.querySelectorAll(sel).forEach((el: Element) => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      });
    });
    return Array.from(new Set(out));
  }, selectors);

  const allowList = [...COMMON_ALLOW, ...appAllow];
  const isAllowed = (t: string) =>
    allowList.some((a) => (a instanceof RegExp ? a.test(t) : t === a));

  const hits: MixHit[] = [];
  for (const t of texts) {
    if (INTERP.test(t)) {
      hits.push({ text: t, reason: 'interp' });
      continue;
    }
    if (RAW_KEY.test(t) && !hasCJK(t)) {
      hits.push({ text: t, reason: 'raw-key' });
      continue;
    }
    // 纯英文(无 CJK + 含拉丁字母)且不在白名单 → 疑似菜单/标签未翻译
    if (!hasCJK(t) && hasLatin(t) && !isAllowed(t)) {
      hits.push({ text: t, reason: 'pure-en' });
    }
  }
  return { hits, scanned: texts.length };
}
