// Аккаунты pleeply: вход через Google из приложения, сессии приложения, подписка Pro через Paddle.
// Таблицы создаются при первом запросе (как waitlist_leads). Секреты — только в переменных Vercel:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — OAuth-клиент «Web application» в Google Cloud;
//   PADDLE_ENV (sandbox | production), PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_PRICE_PRO, PADDLE_WEBHOOK_SECRET.
import crypto from 'node:crypto';
import { sql, SITE } from './forum.js';

export const GOOGLE_REDIRECT = `${SITE}/api/auth/google/callback`;
export const PRO_PRICE_TEXT = process.env.PRO_PRICE_TEXT || '$19.99 / month';

const num = (name, d) => (Number.isFinite(Number(process.env[name])) && process.env[name] !== '' && process.env[name] != null ? Number(process.env[name]) : d);

// Суточные лимиты pleeply Cloud: гость (без входа), бесплатный аккаунт, Pro.
export const PLANS = {
  guest: { free: num('AI_GUEST_FREE', 60), paid: num('AI_GUEST_PAID', 10) },
  free: { free: num('AI_ACCOUNT_FREE', 100), paid: num('AI_ACCOUNT_PAID', 25) },
  pro: { free: num('AI_PRO_FREE', 1000), paid: num('AI_PRO_PAID', 150) },
};

let ready;
export const ensureAccounts = () => (ready ??= (async () => {
  await sql.query(`create table if not exists accounts (
    id bigserial primary key,
    google_sub text unique not null,
    email text not null,
    name text,
    plan text not null default 'free',
    plan_status text,
    plan_until timestamptz,
    paddle_customer_id text,
    paddle_subscription_id text,
    created_at timestamptz not null default now(),
    last_seen timestamptz)`);
  await sql.query(`create table if not exists auth_requests (
    state text primary key,
    app_state text not null,
    challenge text not null,
    port integer not null,
    code text unique,
    account_id bigint,
    used boolean not null default false,
    created_at timestamptz not null default now())`);
  await sql.query(`create table if not exists app_sessions (
    id bigserial primary key,
    account_id bigint not null references accounts(id) on delete cascade,
    token_hash text unique not null,
    device text,
    created_at timestamptz not null default now(),
    last_used timestamptz)`);
  await sql.query(`create table if not exists paddle_events (event_id text primary key, received_at timestamptz not null default now())`);
})());

export const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** PKCE: base64url(sha256(verifier)) должен совпасть с challenge, который приложение прислало в начале входа. */
export function pkceOk(verifier, challenge) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
  return typeof challenge === 'string' && expected.length === challenge.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(challenge));
}

export function decodeJwtPayload(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * id_token получен напрямую от токен-эндпоинта Google по TLS с нашим секретом (OpenID Connect 3.1.3.7 допускает
 * не проверять подпись в этом случае), но кому выдан, кем, срок и подтверждённость почты проверяем всегда.
 */
export function googleClaimsError(c, clientId, now = Date.now() / 1000) {
  if (!c) return 'no id_token';
  if (c.aud !== clientId) return 'wrong audience';
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss)) return 'wrong issuer';
  if (!(Number(c.exp) > now)) return 'expired';
  if (!c.sub) return 'no subject';
  if (!c.email || !(c.email_verified === true || c.email_verified === 'true')) return 'email not verified';
  return null;
}

export function effectivePlan(acc, now = new Date()) {
  return acc?.plan === 'pro' && acc.plan_until && new Date(acc.plan_until) > now ? 'pro' : 'free';
}

export function publicAccount(a) {
  const plan = effectivePlan(a);
  return { email: a.email, name: a.name, plan, planUntil: a.plan_until, planStatus: a.plan_status, billing: !!a.paddle_customer_id, limits: PLANS[plan] };
}

/** Аккаунт по заголовку Authorization: Bearer <токен сессии приложения>. */
export async function accountFromRequest(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{30,100})$/.exec(String(req.headers.authorization || ''));
  if (!m) return null;
  await ensureAccounts();
  const [row] = await sql`select a.*, s.id as session_id, s.last_used from app_sessions s join accounts a on a.id = s.account_id where s.token_hash = ${sha256hex(m[1])}`;
  if (!row) return null;
  if (!row.last_used || Date.now() - new Date(row.last_used).getTime() > 3_600_000) {
    await sql`update app_sessions set last_used = now() where id = ${row.session_id}`;
  }
  return row;
}

// ---------- Paddle ----------

/** Подпись вебхука Paddle: заголовок "ts=…;h1=…" (при смене секрета h1 может быть несколько). */
export function verifyPaddleSignature(raw, header, secret, now = Date.now() / 1000) {
  if (!secret || !header) return false;
  let ts = null;
  const hashes = [];
  for (const part of String(header).split(';')) {
    const [k, v] = part.split('=');
    if (k === 'ts') ts = v;
    if (k === 'h1' && v) hashes.push(v);
  }
  if (!ts || !hashes.length || Math.abs(now - Number(ts)) > 300) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${ts}:${raw}`).digest('hex'));
  return hashes.some((h) => h.length === expected.length && crypto.timingSafeEqual(Buffer.from(h), expected));
}

/** Состояние подписки Paddle → тариф в pleeply. День запаса на задержку продления, при просрочке — три. */
export function planFromSubscription(sub, now = Date.now()) {
  const status = sub?.status;
  if (['active', 'trialing', 'past_due'].includes(status)) {
    const end = sub.current_billing_period?.ends_at || sub.next_billed_at;
    const grace = status === 'past_due' ? 3 : 1;
    const until = end ? new Date(new Date(end).getTime() + grace * 86_400_000) : new Date(now + 31 * 86_400_000);
    return { plan: 'pro', plan_until: until.toISOString(), plan_status: status };
  }
  return { plan: 'free', plan_until: new Date(now).toISOString(), plan_status: status || 'canceled' };
}

const paddleBase = () => (process.env.PADDLE_ENV === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com');
export const paddleReady = () => Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_PRO);

export async function paddle(path, method = 'GET', body) {
  const r = await fetch(`${paddleBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j.data, error: j.error };
}

/** Покупатель Paddle для аккаунта: существующий или новый (по почте). */
export async function paddleCustomer(acc) {
  if (acc.paddle_customer_id) return acc.paddle_customer_id;
  let r = await paddle('/customers', 'POST', { email: acc.email, name: acc.name || undefined, custom_data: { account_id: String(acc.id) } });
  let id = r.ok ? r.data?.id : null;
  if (!id && r.status === 409) id = /ctm_[a-z0-9]+/i.exec(r.error?.detail || '')?.[0] || null;
  if (!id) {
    r = await paddle(`/customers?email=${encodeURIComponent(acc.email)}`);
    id = r.ok ? r.data?.[0]?.id : null;
  }
  if (!id) throw new Error('Paddle customer');
  await sql`update accounts set paddle_customer_id = ${id} where id = ${acc.id}`;
  return id;
}
