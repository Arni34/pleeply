// POST /api/ai/v1/browse — computer use: задача в облачном браузере (поток SSE со скриншотами шагов).
// POST {op:'decide', id, token, approve} — решение человека по шагу с последствиями. Токен одобрения получает
// только тот браузер, который запустил задачу; в базе хранится его хэш. Тексты задач не сохраняются.
import crypto from 'node:crypto';
import { json, sql } from '../../_lib/forum.js';
import { checkLimits } from '../../_lib/ai.js';
import { accountFromRequest } from '../../_lib/account.js';
import { runBrowser } from '../../_lib/browser.js';

let ready;
const ensure = () => (ready ??= sql.query(`create table if not exists ai_approvals (
  id text primary key, token_hash text not null, status text not null default 'pending', description text, created timestamptz not null default now())`));
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: { message: 'Method not allowed.' } });
    const device = String(req.headers['x-pleeply-device'] || '');
    if (!/^[a-f0-9-]{16,64}$/i.test(device)) return json(res, 403, { error: { message: 'This endpoint is for pleeply.' } });
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    await ensure();

    if (b.op === 'decide') {
      const id = String(b.id || '');
      const token = String(b.token || '');
      if (!/^[0-9a-f-]{36}$/.test(id) || token.length < 20) return json(res, 400, { error: { message: 'Bad decision.' } });
      const [row] = await sql`update ai_approvals set status = ${b.approve === true ? 'approved' : 'denied'}
        where id = ${id} and token_hash = ${hash(token)} and status = 'pending' and created > now() - interval '10 minutes' returning id`;
      return json(res, row ? 200 : 404, { ok: Boolean(row) });
    }

    if (!process.env.GROQ_API_KEY) return json(res, 503, { error: { message: 'The cloud browser is not set up yet.' } });
    const task = String(b.task || '').trim().slice(0, 800);
    if (!task) return json(res, 400, { error: { message: 'Describe what to do in the browser.' } });
    const startUrl = String(b.start_url || '').trim().slice(0, 500);
    const account = await accountFromRequest(req).catch(() => null);
    const denied = await checkLimits(req, device, 'free', account, 5); // задача в браузере — как 5 сообщений
    if (denied) return json(res, 429, { error: { message: denied } });

    const ctrl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Pleeply-Route': encodeURIComponent('Cloud browser (Groq)') });
    const send = (obj) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

    // Пауза до решения человека (не дольше 2 минут); решение приходит отдельным запросом op:'decide'
    const approval = async ({ description, why, url, shot }) => {
      const id = crypto.randomUUID();
      const token = crypto.randomBytes(24).toString('base64url');
      await sql`insert into ai_approvals (id, token_hash, description) values (${id}, ${hash(token)}, ${String(description).slice(0, 300)})`;
      send({ pleeply_approval: { id, token, description, why: String(why || '').slice(0, 200), url, shot } });
      for (let i = 0; i < 150 && !ctrl.signal.aborted; i++) {
        await sleep(800);
        const [r] = await sql`select status from ai_approvals where id = ${id}`;
        if (r && r.status !== 'pending') { send({ pleeply_approval_done: { id, approved: r.status === 'approved' } }); return r.status === 'approved'; }
      }
      await sql`update ai_approvals set status = 'expired' where id = ${id} and status = 'pending'`.catch(() => {});
      send({ pleeply_approval_done: { id, approved: false } });
      return false;
    };

    try {
      const answer = await runBrowser({ task, startUrl, send, signal: ctrl.signal, approval });
      for (const part of String(answer || '').match(/[\s\S]{1,160}/g) || []) send({ choices: [{ index: 0, delta: { content: part } }] });
      send({ pleeply_route: 'Cloud browser (Groq)', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    } catch (e) {
      console.warn('[browse]', String(e.message).slice(0, 200));
      send({ error: { message: "The cloud browser couldn't finish this task. Try again." } });
    }
    res.end('data: [DONE]\n\n');
  } catch {
    if (!res.headersSent) json(res, 500, { error: { message: 'The cloud browser had an error. Try again.' } });
    else res.end();
  }
}
