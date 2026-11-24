// POST /api/ai/v1/chat/completions — запрос из pleeply Desktop к облачной модели через pleeply Cloud.
// Заголовок X-Pleeply-Device — случайный идентификатор установки (не связан с личностью), нужен только для дневного лимита.
// Тело запроса не сохраняется и не логируется.
import { catalog, checkLimits, validate, relay, LIMITS } from '../../../_lib/ai.js';
import { json } from '../../../_lib/forum.js';
import { accountFromRequest } from '../../../_lib/account.js';
import { relayAgent, parseConnectors } from '../../../_lib/connect.js';
import { planProject } from '../../../_lib/plan.js';
import { designSite } from '../../../_lib/site.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: { message: 'Method not allowed.' } });
    const device = String(req.headers['x-pleeply-device'] || '');
    if (!/^[a-f0-9-]{16,64}$/i.test(device)) return json(res, 403, { error: { message: 'This endpoint is for the pleeply Desktop app.' } });
    const v = validate(req.body, LIMITS.maxTokens);
    if (v.error) return json(res, 400, { error: { message: v.error } });
    // План Co-founder (spec FR-05): черновик задач для проекта, лимит бесплатных моделей ×2
    if (req.body?.task === 'plan') {
      const account = await accountFromRequest(req).catch(() => null);
      const denied = await checkLimits(req, device, 'free', account, 2);
      if (denied) return json(res, 429, { error: { message: denied } });
      return await planProject(req.body, res);
    }
    // pleeply Studio: сценарий 3D-сайта (или правка текущего), лимит бесплатных моделей ×2
    if (req.body?.task === 'site') {
      const account = await accountFromRequest(req).catch(() => null);
      const denied = await checkLimits(req, device, 'free', account, 2);
      if (denied) return json(res, 429, { error: { message: denied } });
      return await designSite(req.body, res);
    }
    // Браузерная версия: интернет всегда включён. Агент сам ищет в сети, читает страницы и вызывает коннекторы.
    // Если Groq недоступен ещё до ответа, ниже отвечает обычная модель (без интернета), лимит уже учтён.
    let counted = false;
    const connectors = parseConnectors(req.body?.connectors);
    if (req.body?.web === true || connectors.length) {
      if (!v.value.messages.some((m) => m.role === 'user' && m.content.trim())) return json(res, 400, { error: { message: 'Write a message first.' } });
      const account = await accountFromRequest(req).catch(() => null);
      const denied = await checkLimits(req, device, 'free', account, 1);
      if (denied) return json(res, 429, { error: { message: denied } });
      counted = true;
      const ctrl = new AbortController();
      res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });
      if (await relayAgent(v.value, connectors, res, ctrl.signal)) return;
    }
    const entry = (await catalog()).find((m) => m.id === v.value.model);
    if (!entry) return json(res, 404, { error: { message: 'This model is not available in pleeply Cloud right now.' } });
    if (!(counted && entry.tier === 'free')) {
      const account = await accountFromRequest(req).catch(() => null);
      const denied = await checkLimits(req, device, entry.tier, account, entry.weight || 1);
      if (denied) return json(res, 429, { error: { message: denied } });
    }
    await relay(entry, v.value, res);
  } catch {
    if (!res.headersSent) json(res, 500, { error: { message: 'pleeply Cloud had an error. Try again.' } });
  }
}
