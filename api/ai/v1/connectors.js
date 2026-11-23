// POST /api/ai/v1/connectors — проверить MCP-коннектор перед подключением: имя сервера, инструменты только на чтение
// и сколько инструментов скрыто (они могут что-то менять). Ни адрес, ни токен не сохраняются на сервере.
import { json, clientKey, allow } from '../../_lib/forum.js';
import { describeConnector, checkUrl } from '../../_lib/mcp.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  if (req.headers['x-pleeply-device'] == null) return json(res, 403, { error: 'This endpoint is for pleeply.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const url = String(b.url || '').trim().slice(0, 300);
  if (!checkUrl(url)) return json(res, 400, { error: 'Use a public https:// address, for example https://mcp.example.com/mcp.' });
  if (!(await allow(`mcp-test:${clientKey(req)}`, 30, 3600))) return json(res, 429, { error: 'Too many checks. Try again in an hour.' });
  const token = typeof b.token === 'string' && b.token.length <= 4000 ? b.token.trim() : '';
  try {
    return json(res, 200, { ok: true, ...(await describeConnector({ url, token })) });
  } catch (e) {
    return json(res, 200, { ok: false, error: String(e.message || "Couldn't connect.").slice(0, 200) });
  }
}
