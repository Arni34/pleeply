// Коннекторы pleeply: клиент удалённых MCP-серверов (Streamable HTTP). По спецификации в MVP ИИ только читает:
// наружу отдаём лишь инструменты с пометкой annotations.readOnlyHint === true, остальные скрываем и считаем.
// Запросы идут только на публичные https-адреса: DNS проверяется, соединение — ровно на проверенный IP (без SSRF).
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

const PROTOCOL = '2025-06-18';
const MAX_BYTES = 2 * 1024 * 1024;

const BLOCKED = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]]) BLOCKED.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]]) BLOCKED.addSubnet(a, p, 'ipv6');

export function isBlockedAddress(ip) {
  const fam = net.isIP(ip);
  if (!fam) return true;
  if (fam === 6) {
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (m) return BLOCKED.check(m[1], 'ipv4');
    return BLOCKED.check(ip, 'ipv6');
  }
  return BLOCKED.check(ip, 'ipv4');
}

export function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) return cb(new Error('This connector address is not public.'));
    if (options?.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

/** Адрес коннектора: только https, без логина в адресе, обычный порт. */
export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || net.isIP(u.hostname.replace(/^\[|\]$/g, ''))) return null;
  return u;
}

/** POST по https на проверенный IP; ответ JSON или SSE. Для SSE возвращаемся, как только пришёл ответ с нашим id. */
function post(u, headers, body, { timeout = 15000, wantId } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(u, { method: 'POST', lookup: safeLookup, timeout, headers: { ...headers, 'content-length': Buffer.byteLength(body) } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return reject(new Error('The connector redirected; use its final address.')); }
      const ct = String(res.headers['content-type'] || '');
      let buf = '';
      let size = 0;
      let settled = false;
      const finish = (msg) => { if (settled) return; settled = true; resolve({ status: res.statusCode, headers: res.headers, msg }); };
      const fromSse = () => {
        for (const line of buf.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try { const j = JSON.parse(line.slice(5)); if (j.id === wantId) return j; } catch {}
        }
        return null;
      };
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BYTES) { settled = true; req.destroy(); return reject(new Error('The connector sent too much data.')); }
        buf += chunk;
        if (ct.includes('event-stream') && wantId != null) {
          const j = fromSse();
          if (j) { finish(j); req.destroy(); }
        }
      });
      res.on('end', () => {
        if (ct.includes('event-stream')) return finish(fromSse());
        let msg = null;
        try { msg = buf ? JSON.parse(buf) : null; } catch {}
        finish(msg);
      });
      res.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('The connector took too long to answer.')));
    req.on('error', (e) => reject(e.code === 'ENOTFOUND' ? new Error('The connector address was not found.') : e));
    req.end(body);
  });
}

/** Сессия с MCP-сервером: initialize → notifications/initialized → вызовы. */
export async function openSession(conn) {
  const u = checkUrl(conn.url);
  if (!u) throw new Error('Use a public https:// address for the connector.');
  let id = 0;
  let session = null;
  const base = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': 'pleeply-connectors/1.0', ...(conn.token ? { authorization: `Bearer ${conn.token}` } : {}) };
  const call = async (method, params, timeout) => {
    const myId = ++id;
    const r = await post(u, { ...base, 'mcp-protocol-version': PROTOCOL, ...(session ? { 'mcp-session-id': session } : {}) }, JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }), { timeout, wantId: myId });
    if (r.status === 401 || r.status === 403) throw new Error(conn.token ? 'The connector rejected the token.' : 'This connector needs a sign-in or token.');
    if (r.status >= 400) throw new Error(`The connector answered ${r.status}.`);
    if (r.msg?.error) throw new Error(String(r.msg.error.message || 'The connector returned an error.').slice(0, 200));
    if (!r.msg) throw new Error("The connector's answer was not understood.");
    return { result: r.msg.result, headers: r.headers };
  };
  const init = await call('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'pleeply', version: '1.0' } }, 10000);
  session = init.headers['mcp-session-id'] || null;
  await post(u, { ...base, 'mcp-protocol-version': PROTOCOL, ...(session ? { 'mcp-session-id': session } : {}) }, JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), { timeout: 5000 }).catch(() => {});
  return { server: init.result?.serverInfo?.name || u.hostname, call };
}

/** Инструменты сервера: только чтение — наружу, остальные — счётчик скрытых. */
export async function listTools(s) {
  const tools = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const { result } = await s.call('tools/list', cursor ? { cursor } : {}, 10000);
    tools.push(...(result?.tools || []));
    cursor = result?.nextCursor;
    if (!cursor) break;
  }
  const readOnly = tools.filter((t) => t?.annotations?.readOnlyHint === true && typeof t.name === 'string');
  return { tools: readOnly, hidden: tools.length - readOnly.length };
}

/** Вызов инструмента: текст ответа (для не-текстовых частей — их тип), не длиннее limit. */
export async function callTool(s, name, args, limit = 8000) {
  const { result } = await s.call('tools/call', { name, arguments: args && typeof args === 'object' ? args : {} }, 25000);
  const parts = (result?.content || []).map((c) => (c.type === 'text' ? c.text : c.type === 'resource' ? (c.resource?.text || `[resource ${c.resource?.uri || ''}]`) : `[${c.type}]`));
  let text = parts.join('\n').trim() || (result?.structuredContent ? JSON.stringify(result.structuredContent) : '');
  if (text.length > limit) text = `${text.slice(0, limit)}\n…[truncated]`;
  return { text, isError: Boolean(result?.isError) };
}

/** Проверка коннектора из настроек: имя сервера и инструменты (только чтение + сколько скрыто). */
export async function describeConnector(conn) {
  const s = await openSession(conn);
  const { tools, hidden } = await listTools(s);
  return { server: s.server, tools: tools.map((t) => ({ name: t.name, description: String(t.description || '').slice(0, 200) })), hidden };
}
