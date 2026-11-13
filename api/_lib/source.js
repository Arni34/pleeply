// Источник визита: utm_source → иначе домен внешнего referrer → иначе direct. Общий для /api/track и /api/stats.
// Готовый source пишется в site_events, поэтому SQL-отчёту правила разбора повторять не нужно.

const HOSTS = [
  [/(^|\.)reddit\.com$|(^|\.)redd\.it$/, 'reddit'],
  [/(^|\.)news\.ycombinator\.com$/, 'hn'],
  [/(^|\.)(x|twitter)\.com$|^t\.co$/, 'x'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
  [/(^|\.)t\.me$|(^|\.)telegram\.(org|me)$/, 'telegram'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)facebook\.com$|(^|\.)instagram\.com$/, 'meta'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'youtube'],
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)indiehackers\.com$/, 'indiehackers'],
  [/(^|\.)producthunt\.com$/, 'producthunt'],
  [/(^|\.)habr\.com$/, 'habr'],
  [/(^|\.)vc\.ru$/, 'vc'],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/, 'ai_chat'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yandex\.[a-z]+$|(^|\.)ya\.ru$/, 'yandex'],
];
const SEARCH = new Set(['google', 'bing', 'duckduckgo', 'yandex']);

const clean = (v, max = 80) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9._\-:/ ]/g, '').slice(0, max);

export function hostOf(referrer) {
  const r = clean(referrer, 120);
  if (!r) return '';
  try { return new URL(r.includes('://') ? r : `https://${r}`).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// → { source, medium, campaign, referrer }
export function attribute({ utm_source, utm_medium, utm_campaign, referrer } = {}) {
  const host = hostOf(referrer);
  const internal = !host || /^pleeply(-[a-z0-9-]+)?\.vercel\.app$|^localhost$|^127\.0\.0\.1$/.test(host);
  const campaign = clean(utm_campaign) || null;
  const utm = clean(utm_source);
  if (utm) return { source: utm, medium: clean(utm_medium) || 'utm', campaign, referrer: host || null };
  if (!internal) {
    const hit = HOSTS.find(([re]) => re.test(host));
    const source = hit ? hit[1] : host;
    return { source, medium: SEARCH.has(source) ? 'organic' : 'referral', campaign, referrer: host };
  }
  return { source: 'direct', medium: 'none', campaign, referrer: null };
}
