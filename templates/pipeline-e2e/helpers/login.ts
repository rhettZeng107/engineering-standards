import { type Page, request as pwRequest } from '@playwright/test';

// 登录 + token 注入 helper(跨项目模板 — 按你的鉴权模式二选一,删另一个)
// render-walk spec 在导航前调 loginAndInject(page);若纯壳子验证不需登录,删 render-walk spec 即可(留 critical-boot)。

const API = process.env.E2E_API || 'http://localhost:5063';
const USER = process.env.E2E_USER || 'TODO_USER';
const PWD = process.env.E2E_PWD || 'TODO_PWD';
const PLANT = process.env.E2E_PLANT || '9999';

// ── 模式 A:standalone 登录 API 取 token(供应商端式)──────────────────────
// 经登录 API 拿真 token,addInitScript 在 app 模块加载前写入 localStorage(authSlice init 读 token)
export async function loginAndInject(page: Page): Promise<{ token: string }> {
  const ctx = await pwRequest.newContext();
  const url = `${API}/api/Account/Login?user=${encodeURIComponent(USER)}&password=${encodeURIComponent(PWD)}`;
  const resp = await ctx.get(url);
  const body = await resp.text();
  await ctx.dispose();

  let token = '';
  let loginUser: Record<string, unknown> = { userAccount: USER, relationCode: USER, plantCode: PLANT };
  try {
    const j = JSON.parse(body);
    token = j.token || j.data?.token || '';
    loginUser = j.data?.loginUser || j.loginUser || loginUser;
  } catch {
    const m = body.match(/"token":"([^"]+)"/); // 后端 JSON 含非法转义时回退正则
    token = m ? m[1] : '';
  }
  if (!token) throw new Error('登录失败,未取到 token: ' + body.slice(0, 300));

  // ⚠ localStorage key 按你 app 实际改(下面是 srmc 式;BP 子应用见模式 B)
  await page.addInitScript(({ t, u, p }) => {
    localStorage.setItem('__SRMC_Config_token', JSON.stringify(t));
    localStorage.setItem('__SRMC_Data_user', JSON.stringify(u));
    localStorage.setItem('__current_plant_code', JSON.stringify(p));
  }, { t: token, u: loginUser, p: PLANT });

  return { token };
}

// ── 模式 B:BP 子应用 — 父应用注入 token(采购端式)─────────────────────────
// 用 HMAC 自签 dev/test JWT(key 走 E2E_JWT_KEY env,严禁硬编码进仓),写父应用约定的 localStorage key。
// 用法:把上面 loginAndInject 换成下面这版(需要 import crypto)。
//
// import crypto from 'crypto';
// const KEY = process.env.E2E_JWT_KEY || '';
// const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
// export async function loginAndInject(page: Page) {
//   const now = Math.floor(Date.now() / 1000);
//   const header = b64({ alg: 'HS256', typ: 'JWT' });
//   const payload = b64({ iss: 'JYInfo', aud: 'JYInfo', iat: now, exp: now + 86400,
//     PlantCode: PLANT, plantCode: PLANT, LoginName: USER, UserName: USER, unique_name: USER, sub: USER, UserId: '1' });
//   const sig = crypto.createHmac('sha256', KEY).update(`${header}.${payload}`).digest('base64url');
//   const token = `${header}.${payload}.${sig}`;
//   await page.addInitScript(({ t, p }) => {
//     localStorage.setItem('__bp_sso_token__', t);
//     localStorage.setItem('__current_plant_code', p);
//   }, { t: token, p: PLANT });
//   return { token };
// }
