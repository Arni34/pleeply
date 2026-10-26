// pleeply-bot:
//  • еженедельный дайджест — вызывает Vercel Cron (см. vercel.json) с заголовком Authorization: Bearer $CRON_SECRET;
//  • самопроверка /api/bot?task=selftest — только для вошедшего админа форума: прогоняет вопрос и поиск
//    через настоящие промпты бота и показывает ответы, ничего не публикуя.
import { weeklyDigest, generate, relevantDocs, ANSWER_RULES, DIGEST_RULES } from './_lib/bot.js';
import { getUser } from './_lib/forum.js';

const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data, null, 2));
};

async function timed(fn) {
  const started = Date.now();
  const result = await fn();
  return {
    ok: Boolean(result?.text),
    provider: result?.provider || null,
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    links: (result?.text?.match(/https?:\/\//g) || []).length,
    text: result?.text || null,
  };
}

async function selftest() {
  const question = 'How much RAM do I need to run a 7B model at home?';
  const today = new Date().toISOString().slice(0, 10);
  const [answer, digest] = await Promise.all([
    timed(async () => generate({ system: ANSWER_RULES + (await relevantDocs(question)), prompt: question, maxTokens: 4096 })),
    timed(() => generate({ system: DIGEST_RULES, prompt: `Write this week's issue. Today is ${today}.`, search: true, maxTokens: 8192 })),
  ]);
  return {
    keys: { gemini: Boolean(process.env.GEMINI_API_KEY), groq: Boolean(process.env.GROQ_API_KEY) },
    note: 'Nothing was posted to the forum.',
    answer: { question, ...answer },
    digest,
  };
}

export default async function handler(req, res) {
  try {
    if (req.query.task === 'selftest') {
      const user = await getUser(req);
      if (user?.role !== 'admin') return send(res, 403, { error: 'Log in to the forum as an admin first.' });
      return send(res, 200, await selftest());
    }
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'Unauthorized' });
    return send(res, 200, await weeklyDigest());
  } catch (err) {
    console.error('pleeply-bot', err);
    return send(res, 500, { error: 'Error' });
  }
}
