/**
 * 前端 i18n 初始化标准模板(React + i18next + HttpApi backend)
 *
 * 适用:SYSV2 所有 React 前端(SYS.3 / BP / AP / MDM / 后续 SRM/MES/WMS)
 * 标准源:engineering-standards/standards/frontend-i18n-standard.md
 *
 * 关键决策(违反 = code-reviewer HIGH):
 * 1. 单 ns 'translation' — 所有页面统一 useTranslation() 默认 ns + t('namespace.key') 全路径
 * 2. zh-CN 强制兜底(navigator.language 在 headless / 英文 Win 报 en-US,首次进入误显英文)
 * 3. Cookie['lng'] 跨子域共享(BP 切语言 reload 后 wujie/iframe 子应用自动同步)
 * 4. useSuspense:false(组件 lazy load 期间显示 key,加载完后 re-render,无 Suspense 包裹要求)
 * 5. BASE_URL 自适应(支持 / 主应用 + /SubApp/ 子应用 部署)
 *
 * 替换占位 {{PROJECT_NAME}} 为项目名(用于 console 日志区分)
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';
import Cookies from 'js-cookie';

function i18nLoadPath() {
    let baseUrl = import.meta.env.BASE_URL ?? '/';
    if (baseUrl === './' || baseUrl === '.') baseUrl = '/';
    const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${root}plugins/i18next/locales/{{lng}}/{{ns}}.json`;
}

function detectInitialLng() {
    const fromCookie = Cookies.get('lng');
    if (fromCookie === 'zh-CN' || fromCookie === 'en-US') return fromCookie;
    return 'zh-CN';
}

const i18nReady = i18n
    .use(initReactI18next)
    .use(HttpApi)
    .init({
        debug: false,
        lng: detectInitialLng(),
        ns: ['translation'],
        defaultNS: 'translation',
        fallbackLng: ['zh-CN'],
        load: 'currentOnly',
        backend: {
            loadPath: i18nLoadPath(),
        },
        react: { useSuspense: false },
    });

if (typeof window !== 'undefined') {
    window.i18next = i18n;
    window.i18nReady = i18nReady;
}

export { i18nReady };
export default i18n;
