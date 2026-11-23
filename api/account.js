// Аккаунт pleeply — одна функция на все действия (у Vercel Hobby не больше 12 функций). Адреса задают rewrites в vercel.json:
//   GET  /api/auth/desktop?port&state&challenge    начало входа из приложения → Google
//   GET  /api/auth/web                             начало входа из браузерной версии (/chat) → Google → cookie сессии
//   GET  /api/auth/google/callback                 ответ Google → одноразовый код на http://127.0.0.1:<port>/callback
//   POST /api/auth/token {code, verifier, device}  обмен кода на токен сессии приложения (PKCE)
//   GET  /api/account/me                           аккаунт, тариф, лимиты и расход за сегодня
//   POST /api/account/signout                      завершить сессию этого устройства
//   POST /api/account/checkout                     ссылка на оплату Pro (Paddle)
//   POST /api/account/portal                       ссылка на управление подпиской (Paddle)
//   GET  /api/account/config                       публичный клиентский токен Paddle для страницы /pro
//   POST /api/paddle/webhook                       события подписки Paddle (подпись проверяется)
import { sql, json, esc, clientKey, allow, SITE } from './_lib/forum.js';
import {
  ensureAccounts, GOOGLE_REDIRECT, PLANS, PRO_PRICE_TEXT, randomToken, sha256hex, pkceOk, decodeJwtPayload, googleClaimsError,
  effectivePlan, publicAccount, accountFromRequest, verifyPaddleSignature, applySubscription, paddleReady, paddle, paddleCustomer,
  SESSION_COOKIE, OAUTH_COOKIE, readCookie, cookieHeader, sessionToken,
} from './_lib/account.js';

function page(res, status, title, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · pleeply</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#d4d4d4;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:460px;padding:32px}h1{color:#fff;font-weight:500;font-size:26px;letter-spacing:-.02em;margin:0 0 10px}a{color:#6fcf8c}</style>
</head><body><main><h1>${esc(title)}</h1><p>${html}</p></main></body></html>`);
}

const redirect = (res, url) => { res.statusCode = 302; res.setHeader('Location', url); res.setHeader('Cache-Control', 'no-store'); res.end(); };
const loopback = (port, params) => `http://127.0.0.1:${port}/callback?${new URLSearchParams(params)}`;

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function start(req, res) {
  const { port, state, challenge } = req.query;
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1024 || p > 65535 || !/^[A-Za-z0-9_-]{16,128}$/.test(String(state || '')) || !/^[A-Za-z0-9_-]{43}$/.test(String(challenge || ''))) {
    return page(res, 400, 'This sign-in link is broken', 'Start signing in again from the pleeply app.');
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return page(res, 503, 'Sign-in is not set up yet', 'Google sign-in for pleeply is being set up. You can keep using pleeply without an account.');
  }
  if (!(await allow(`auth:${clientKey(req)}`, 30, 3600))) return page(res, 429, 'Too many attempts', 'Try again in an hour.');
  const serverState = randomToken(24);
  await sql`delete from auth_requests where created_at < now() - interval '1 day'`;
  await sql`insert into auth_requests (state, app_state, challenge, port) values (${serverState}, ${String(state)}, ${String(challenge)}, ${p})`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, response_type: 'code',
    scope: 'openid email profile', state: serverState, prompt: 'select_account',
  }).toString();
  return redirect(res, url.toString());
}

const NEXT_COOKIE = '__Host-pleeply_next';
const WEB_NEXT = ['/chat', '/pro'];

/** Вход из браузерной версии (/chat, /pro): та же Google-авторизация, но сессия кладётся в cookie, а не отдаётся приложению. */
async function webstart(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return page(res, 503, 'Sign-in is not set up yet', 'Google sign-in for pleeply is being set up. <a href="/chat">Back to pleeply</a> — you can keep chatting without an account.');
  }
  if (!(await allow(`auth:${clientKey(req)}`, 30, 3600))) return page(res, 429, 'Too many attempts', 'Try again in an hour.');
  const serverState = randomToken(24);
  const browserNonce = randomToken(24); // привязывает ответ Google к этому браузеру: чужую ссылку входа не подсунуть
  await sql`delete from auth_requests where created_at < now() - interval '1 day'`;
  await sql`insert into auth_requests (state, app_state, challenge, port) values (${serverState}, ${browserNonce}, '-', 0)`;
  // куда вернуть после входа: только свои страницы из списка
  const next = WEB_NEXT.includes(String(req.query?.next)) ? String(req.query.next) : '/chat';
  res.setHeader('Set-Cookie', [cookieHeader(OAUTH_COOKIE, browserNonce, 600), cookieHeader(NEXT_COOKIE, next, 600)]);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, response_type: 'code',
    scope: 'openid email profile', state: serverState, prompt: 'select_account',
  }).toString();
  return redirect(res, url.toString());
}

async function callback(req, res) {
  const { code, state, error } = req.query;
  const [ar] = state ? await sql`select * from auth_requests where state = ${String(state)} and not used and code is null and created_at > now() - interval '10 minutes'` : [];
  if (!ar) return page(res, 400, 'This sign-in has expired', 'Start signing in again from pleeply.');
  const web = ar.port === 0;
  if (web && readCookie(req, OAUTH_COOKIE) !== ar.app_state) {
    await sql`update auth_requests set used = true where state = ${ar.state}`;
    return page(res, 400, "This sign-in didn't start here", 'Open <a href="/chat">pleeply</a> and sign in again from this browser.');
  }
  const back = web
    ? (params) => {
      const next = WEB_NEXT.includes(readCookie(req, NEXT_COOKIE)) ? readCookie(req, NEXT_COOKIE) : '/chat';
      res.setHeader('Set-Cookie', [cookieHeader(OAUTH_COOKIE, '', 0), cookieHeader(NEXT_COOKIE, '', 0), ...(params.session ? [cookieHeader(SESSION_COOKIE, params.session, 30 * 86400)] : [])]);
      return redirect(res, `${next}${params.session ? '' : `?signin=${params.error === 'cancelled' ? 'cancelled' : 'failed'}`}`);
    }
    : (params) => redirect(res, loopback(ar.port, { state: ar.app_state, ...params }));
  const fail = async (reason) => { await sql`update auth_requests set used = true where state = ${ar.state}`; return back({ error: reason }); };
  if (error || !code) return fail(error === 'access_denied' ? 'cancelled' : 'google');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: String(code), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  const claims = decodeJwtPayload(j.id_token);
  if (!r?.ok || googleClaimsError(claims, process.env.GOOGLE_CLIENT_ID)) return fail('google');
  const [acc] = await sql`insert into accounts (google_sub, email, name, last_seen) values (${claims.sub}, ${claims.email}, ${claims.name || null}, now())
    on conflict (google_sub) do update set email = excluded.email, name = coalesce(excluded.name, accounts.name), last_seen = now() returning id`;
  if (web) {
    const session = randomToken(32);
    await sql`update auth_requests set used = true, account_id = ${acc.id} where state = ${ar.state}`;
    await sql`insert into app_sessions (account_id, token_hash, device, last_used) values (${acc.id}, ${sha256hex(session)}, 'Web browser', now())`;
    return back({ session });
  }
  const oneTime = randomToken(32);
  await sql`update auth_requests set code = ${oneTime}, account_id = ${acc.id} where state = ${ar.state}`;
  return back({ code: oneTime });
}

async function token(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const code = String(b.code || '');
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(code)) return json(res, 400, { error: 'Bad sign-in code.' });
  const [ar] = await sql`update auth_requests set used = true where code = ${code} and not used and created_at > now() - interval '10 minutes' returning *`;
  if (!ar?.account_id) return json(res, 400, { error: 'This sign-in has expired. Try again.' });
  if (!pkceOk(b.verifier, ar.challenge)) return json(res, 400, { error: 'Sign-in check failed. Try again.' });
  const value = randomToken(32);
  await sql`insert into app_sessions (account_id, token_hash, device, last_used) values (${ar.account_id}, ${sha256hex(value)}, ${String(b.device || '').slice(0, 80) || null}, now())`;
  const [acc] = await sql`select * from accounts where id = ${ar.account_id}`;
  return json(res, 200, { token: value, account: publicAccount(acc) });
}

async function me(req, res) {
  const acc = await accountFromRequest(req);
  if (!acc) {
    // Гость без токена (браузерная версия до входа) — не ошибка; недействительный токен — 401, а cookie стираем
    if (!sessionToken(req)) return json(res, 200, { account: null, price: PRO_PRICE_TEXT, upgrade: paddleReady(), plans: PLANS });
    if (readCookie(req, SESSION_COOKIE)) res.setHeader('Set-Cookie', cookieHeader(SESSION_COOKIE, '', 0));
    return json(res, 401, { error: 'Signed out.' });
  }
  const key = 'a:' + acc.id;
  const [usage, [month]] = await Promise.all([
    sql`select tier, n from ai_usage where key = ${key} and day = current_date`.catch(() => []),
    // премиум за текущий месяц — у Pro лимит месячный
    sql`select coalesce(sum(n), 0)::int as n from ai_usage where key = ${key} and tier = 'paid' and day >= date_trunc('month', current_date)::date`.catch(() => [{ n: 0 }]),
  ]);
  return json(res, 200, {
    account: publicAccount(acc), usage: { ...Object.fromEntries(usage.map((u) => [u.tier, u.n])), paid_month: month?.n || 0 },
    price: PRO_PRICE_TEXT, upgrade: paddleReady(), plans: PLANS,
  });
}

async function signout(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const acc = await accountFromRequest(req);
  if (acc) await sql`delete from app_sessions where id = ${acc.session_id}`;
  if (readCookie(req, SESSION_COOKIE)) res.setHeader('Set-Cookie', cookieHeader(SESSION_COOKIE, '', 0));
  return json(res, 200, { ok: true });
}

async function checkout(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const acc = await accountFromRequest(req);
  if (!acc) return json(res, 401, { error: 'Sign in first.' });
  if (!paddleReady()) return json(res, 503, { error: 'Payments are being set up. pleeply Pro will be available soon.' });
  if (effectivePlan(acc) === 'pro') return json(res, 409, { error: 'You already have pleeply Pro.' });
  const customer = await paddleCustomer(acc);
  const r = await paddle('/transactions', 'POST', {
    items: [{ price_id: process.env.PADDLE_PRICE_PRO, quantity: 1 }],
    customer_id: customer,
    custom_data: { account_id: String(acc.id) },
    collection_mode: 'automatic',
  });
  if (!r.ok || !r.data?.id) return json(res, 502, { error: 'Paddle could not start the checkout. Try again.' });
  await sql`insert into paddle_checkouts (txn_id, account_id) values (${r.data.id}, ${acc.id}) on conflict do nothing`;
  return json(res, 200, { url: r.data.checkout?.url || `${SITE}/pro?_ptxn=${r.data.id}` });
}

async function portal(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const acc = await accountFromRequest(req);
  if (!acc) return json(res, 401, { error: 'Sign in first.' });
  if (!acc.paddle_customer_id || !paddleReady()) return json(res, 404, { error: 'There is no subscription to manage yet.' });
  const r = await paddle(`/customers/${acc.paddle_customer_id}/portal-sessions`, 'POST', acc.paddle_subscription_id ? { subscription_ids: [acc.paddle_subscription_id] } : {});
  const url = r.data?.urls?.general?.overview;
  if (!r.ok || !url) return json(res, 502, { error: 'Paddle could not open the subscription page. Try again.' });
  return json(res, 200, { url });
}

async function webhook(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const raw = await readRaw(req);
  if (!verifyPaddleSignature(raw, req.headers['paddle-signature'], process.env.PADDLE_WEBHOOK_SECRET)) return json(res, 401, { error: 'Bad signature.' });
  const ev = JSON.parse(raw);
  await ensureAccounts();
  const eventId = String(ev.event_id || '');
  const [seen] = await sql`select 1 as x from paddle_events where event_id = ${eventId}`;
  if (seen) return json(res, 200, { ok: true, duplicate: true });
  const type = String(ev.event_type || '');
  const d = ev.data || {};
  // Аккаунт и состояние подписки определяет applySubscription по своим данным, тело события — только подсказка, что смотреть.
  // subscription.created несёт transaction_id, transaction.completed — subscription_id: привязка сработает при любом порядке.
  if (type.startsWith('subscription.')) await applySubscription(d.id, d.transaction_id);
  else if (type === 'transaction.completed' || type === 'transaction.paid') await applySubscription(d.subscription_id, d.id);
  // Событие отмечаем обработанным только после успеха: при ошибке Paddle повторит его
  await sql`insert into paddle_events (event_id) values (${eventId}) on conflict do nothing`;
  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  const op = String(req.query?.op || '');
  try {
    if (op === 'webhook') return await webhook(req, res);
    await ensureAccounts();
    switch (op) {
      case 'start': return await start(req, res);
      case 'webstart': return await webstart(req, res);
      case 'callback': return await callback(req, res);
      case 'token': return await token(req, res);
      case 'me': return await me(req, res);
      case 'signout': return await signout(req, res);
      case 'checkout': return await checkout(req, res);
      case 'portal': return await portal(req, res);
      case 'config':
        return json(res, 200, { clientToken: process.env.PADDLE_CLIENT_TOKEN || null, environment: process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox', price: PRO_PRICE_TEXT, plans: PLANS, upgrade: paddleReady() });
      default:
        return json(res, 404, { error: 'Not found.' });
    }
  } catch {
    if (!res.headersSent) json(res, 500, { error: 'The account service had an error. Try again.' });
  }
}
