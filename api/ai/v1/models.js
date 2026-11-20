// GET /api/ai/v1/models — какие облачные модели сейчас доступны в pleeply Cloud (формат как у OpenAI).
// Ничего о пользователе не принимает и не записывает.
import { catalog, LIMITS } from '../../_lib/ai.js';
import { json } from '../../_lib/forum.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: { message: 'Method not allowed.' } });
  const list = await catalog();
  json(res, 200, {
    object: 'list',
    data: list.map(({ id, name, vendor, tier, upstreamName, policy, context }) => ({ id, object: 'model', name, vendor, tier, via: upstreamName, policy, context_length: context })),
    limits: { free_per_day: LIMITS.free, premium_per_day: LIMITS.paid },
  });
}
