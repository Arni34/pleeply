// Общее для API и страниц форума: база, сессии, защита от перебора, разметка постов.
// Папка с подчёркиванием — Vercel не делает из неё отдельную функцию.
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);
export const SITE = 'https://pleeply.vercel.app';
const COOKIE = 'pl_session';
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1 };

export const RESERVED = new Set(['admin', 'administrator', 'moderator', 'mod', 'staff', 'system', 'support',
  'official', 'team', 'root', 'null', 'undefined', 'anonymous', 'community']);

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- пароли (scrypt) ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(expected, actual);
}

// Для несуществующего имени тоже считаем scrypt, чтобы по времени ответа нельзя было угадать, есть ли такой участник
export const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

// ---------- сессии ----------
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export async function getUser(req) {
  const token = cookies(req)[COOKIE];
  if (!token || token.length > 100) return null;
  const rows = await sql`
    select u.id, u.username, u.role, u.created_at
    from forum_sessions s join forum_users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  return rows[0] || null;
}

export async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await sql`insert into forum_sessions (token_hash, user_id, expires_at)
            values (${sha256(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  await sql`update forum_users set last_seen_at = now() where id = ${userId}`;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}

export async function endSession(req, res) {
  const token = cookies(req)[COOKIE];
  if (token) await sql`delete from forum_sessions where token_hash = ${sha256(token)}`;
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

// ---------- ограничение частоты ----------
// Ключ сети — хэш IP: сам адрес в базу не попадает
export function clientKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '')
    .split(',')[0].trim();
  return sha256(`pleeply-forum:${ip}`).slice(0, 24);
}

// true — можно: не больше limit событий за windowSec секунд по ключу
export async function allow(key, limit, windowSec) {
  const [row] = await sql`
    insert into forum_rate (key, hits, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      hits = case when forum_rate.window_start < now() - make_interval(secs => ${windowSec}) then 1 else forum_rate.hits + 1 end,
      window_start = case when forum_rate.window_start < now() - make_interval(secs => ${windowSec}) then now() else forum_rate.window_start end
    returning hits`;
  return row.hits <= limit;
}

// ---------- ответы и мелочи ----------
export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export const slugify = (title) => String(title).toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'topic';

// Куда вернуть после входа: только внутрь форума, без «//чужой-сайт»
export const safeNext = (next) => (typeof next === 'string' && /^\/community(\/|$|\?)/.test(next) && !next.startsWith('//') ? next : '/community');

// Буквенный аватар, как у Discourse: цвет из имени
export function avatar(name, size = 'md') {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `<span class="av av-${size}" style="--av-h:${h}" title="${esc(name)}" aria-hidden="true">${esc(String(name).slice(0, 1).toUpperCase())}</span>`;
}

// «5m», «3h», «6d», «Apr 27», «Nov 2025» — как в списках community.n8n.io
export function shortDate(value) {
  const d = new Date(value), now = new Date(), sec = (now - d) / 1000;
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  if (sec < 86400 * 30) return `${Math.round(sec / 86400)}d`;
  return d.toLocaleDateString('en-US', d.getUTCFullYear() === now.getUTCFullYear()
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' } : { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------- текст постов: безопасный Markdown ----------
// Сначала экранируем всё, потом разрешаем только **жирный**, *курсив*, `код`, ```блоки```, ссылки, списки и цитаты.
const link = (href, text) => `<a href="${href}" rel="nofollow ugc noopener" target="_blank">${text}</a>`;

// Код и ссылки сразу уходят в заглушки \0N\0 и возвращаются только в самом конце:
// следующие регулярки не должны проходить по уже собранному HTML (иначе URL внутри href
// превращается во вложенный <a> и рвёт атрибут — так получался XSS).
function inline(escaped) {
  const held = [];
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
  const unhold = (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[i]);
  let s = escaped.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${c}</code>`));
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)\u0000]+)\)/g, (_, text, href) => hold(link(href, unhold(text))));
  s = s.replace(/(^|[^\w])(https?:\/\/[^\s<\u0000]*[^\s<\u0000.,:;!?)\]'])/g, (_, pre, href) => pre + hold(link(href, href)));
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  return unhold(s);
}

const BLOCK_START = /^(```|>|[-*]\s|\d+\.\s)/;

export function renderPost(src, depth = 0) {
  const lines = String(src).replace(/[\r\u0000]/g, '').split('\n'); // \0 занят под заглушки в inline()
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.startsWith('>') && depth < 3) {
      const buf = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) buf.push(lines[i].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderPost(buf.join('\n'), depth + 1)}</blockquote>`);
      continue;
    }
    if (/^([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\d/.test(line);
      const items = [];
      for (; i < lines.length && /^([-*]|\d+\.)\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^([-*]|\d+\.)\s+/, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(esc(t))}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      out.push(`<p><strong>${inline(esc(line.replace(/^#{1,6}\s+/, '')))}</strong></p>`);
      i++;
      continue;
    }
    const buf = [];
    for (; i < lines.length && lines[i].trim() && !(buf.length && BLOCK_START.test(lines[i])); i++) buf.push(lines[i]);
    out.push(`<p>${buf.map((l) => inline(esc(l))).join('<br>')}</p>`);
  }
  return out.join('\n');
}

export const plainText = (src) => String(src).replace(/```[\s\S]*?```/g, ' ').replace(/[*`>#_]/g, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
