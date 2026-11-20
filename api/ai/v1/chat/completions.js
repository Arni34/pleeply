// POST /api/ai/v1/chat/completions — запрос из pleeply Desktop к облачной модели через pleeply Cloud.
// Заголовок X-Pleeply-Device — случайный идентификатор установки (не связан с личностью), нужен только для дневного лимита.
// Тело запроса не сохраняется и не логируется.
import { catalog, checkLimits, validate, relay, LIMITS } from '../../../_lib/ai.js';
import { json } from '../../../_lib/forum.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: { message: 'Method not allowed.' } });
    const device = String(req.headers['x-pleeply-device'] || '');
    if (!/^[a-f0-9-]{16,64}$/i.test(device)) return json(res, 403, { error: { message: 'This endpoint is for the pleeply Desktop app.' } });
    const v = validate(req.body, LIMITS.maxTokens);
    if (v.error) return json(res, 400, { error: { message: v.error } });
    const entry = (await catalog()).find((m) => m.id === v.value.model);
    if (!entry) return json(res, 404, { error: { message: 'This model is not available in pleeply Cloud right now.' } });
    const denied = await checkLimits(req, device, entry.tier);
    if (denied) return json(res, 429, { error: { message: denied } });
    await relay(entry, v.value, res);
  } catch {
    if (!res.headersSent) json(res, 500, { error: { message: 'pleeply Cloud had an error. Try again.' } });
  }
}
