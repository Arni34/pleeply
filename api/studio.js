// pleeply Studio: публикация сайтов по ссылке.
// POST /api/studio/publish {spec, slug?, owner?} — создать или обновить; ключ владельца хранится только как хэш.
// POST /api/studio/unpublish {slug, owner} — снять с публикации.
// GET /s/:slug — страница сайта. Отдаётся с CSP sandbox: у страницы непрозрачный origin, поэтому она не видит
// cookie и хранилище pleeply; текст из сценария движок вставляет только через textContent.
import crypto from 'node:crypto';
import { sql, json, allow, clientKey, esc } from './_lib/forum.js';
import { normalize } from '../assets/studio/spec.js';

const PAGE_CSP = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox',
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  'img-src https: data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const sha = (s) => crypto.createHash('sha256').update(`pleeply-studio:${s}`).digest('hex');
const SLUG = /^[a-z0-9][a-z0-9-]{3,48}$/;

let ready;
const ensure = () => (ready ??= sql`create table if not exists studio_sites (
  slug text primary key, spec jsonb not null, owner_hash text not null, title text not null default '',
  created timestamptz not null default now(), updated timestamptz not null default now())`.catch((e) => { ready = null; throw e; }));

function newSlug(title) {
  const base = String(title).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '');
  const tail = crypto.randomBytes(8).toString('hex').slice(0, 6);
  return base ? `${base}-${tail}` : `site-${tail}`;
}

async function publish(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (!b.spec || typeof b.spec !== 'object') return json(res, 400, { error: 'Nothing to publish.' });
  if (!(await allow(`studio:${clientKey(req)}`, 30, 3600))) return json(res, 429, { error: 'Too many publishes from this network. Try again in an hour.' });
  const spec = normalize(b.spec);
  const body = JSON.stringify(spec);
  if (body.length > 60_000) return json(res, 413, { error: 'This site is too large to publish.' });
  await ensure();
  const slug = String(b.slug || '');
  const owner = String(b.owner || '');
  if (slug || owner) {
    if (!SLUG.test(slug) || owner.length < 20) return json(res, 400, { error: 'Bad site link.' });
    const rows = await sql`update studio_sites set spec = ${body}::jsonb, title = ${spec.title}, updated = now()
      where slug = ${slug} and owner_hash = ${sha(owner)} returning slug`;
    if (!rows.length) return json(res, 403, { error: 'This link belongs to another copy of the site. Publish it as a new link.' });
    return json(res, 200, { slug, url: `/s/${slug}`, updated: true });
  }
  const key = crypto.randomBytes(24).toString('base64url');
  for (let i = 0; i < 3; i++) {
    const s = newSlug(spec.title);
    const rows = await sql`insert into studio_sites (slug, spec, owner_hash, title) values (${s}, ${body}::jsonb, ${sha(key)}, ${spec.title})
      on conflict (slug) do nothing returning slug`;
    if (rows.length) return json(res, 200, { slug: s, owner: key, url: `/s/${s}` });
  }
  return json(res, 500, { error: 'Could not publish. Try again.' });
}

async function unpublish(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const slug = String(b.slug || '');
  if (!SLUG.test(slug)) return json(res, 400, { error: 'Bad site link.' });
  await ensure();
  const rows = await sql`delete from studio_sites where slug = ${slug} and owner_hash = ${sha(String(b.owner || ''))} returning slug`;
  return rows.length ? json(res, 200, { ok: true }) : json(res, 403, { error: 'Only the copy that published this site can take it down.' });
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found · pleeply Studio</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#d4d4d4;font:16px/1.6 system-ui,sans-serif;text-align:center"><div><h1 style="color:#fff;font-size:28px;margin:0 0 8px">This site is not published</h1><p style="margin:0 0 20px">The link is wrong or its owner took the site down.</p><a href="/studio" style="color:#6fcf8c">Make your own with pleeply Studio</a></div>');
}

async function page(req, res) {
  const slug = String(req.query?.slug || '');
  if (!SLUG.test(slug)) return notFound(res);
  await ensure();
  const [row] = await sql`select spec from studio_sites where slug = ${slug}`;
  if (!row) return notFound(res);
  const spec = normalize(typeof row.spec === 'string' ? JSON.parse(row.spec) : row.spec);
  const data = JSON.stringify(spec).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', PAGE_CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=20');
  res.end(`<!doctype html>
<html lang="${esc(spec.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(spec.title)}</title>
<meta name="description" content="${esc(spec.description)}">
<meta property="og:title" content="${esc(spec.title)}">
<meta property="og:description" content="${esc(spec.description)}">
<meta name="theme-color" content="${esc(spec.theme.bg)}">
<meta name="generator" content="pleeply Studio">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style>html,body{margin:0;background:${esc(spec.theme.bg)};color:${esc(spec.theme.fg)}}</style>
<script type="application/json" id="pp-spec">${data}</script>
<script type="module" src="/assets/studio/boot.js"></script>
</head>
<body><noscript><h1 style="font-family:system-ui;padding:40px">${esc(spec.title)}</h1><p style="font-family:system-ui;padding:0 40px">${esc(spec.description)}</p></noscript></body>
</html>`);
}

export default async function handler(req, res) {
  try {
    const op = String(req.query?.op || '');
    if (op === 'page' && (req.method === 'GET' || req.method === 'HEAD')) return await page(req, res);
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    if (op === 'publish') return await publish(req, res);
    if (op === 'unpublish') return await unpublish(req, res);
    return json(res, 404, { error: 'Unknown action.' });
  } catch {
    if (!res.headersSent) json(res, 500, { error: 'pleeply Studio had an error. Try again.' });
  }
}
