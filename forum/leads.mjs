// Анкеты листа ожидания из таблицы waitlist_leads.
// Из папки pleeply:
//   node --env-file=.env.local forum/leads.mjs            — сводка + список заявок
//   node --env-file=.env.local forum/leads.mjs csv > leads.csv   — выгрузка в CSV
//   node --env-file=.env.local forum/leads.mjs daily [30] — число заявок по дням и источникам
//   node --env-file=.env.local forum/leads.mjs calls      — кто согласился на 15-минутное интервью
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('нет DATABASE_URL — запускай с --env-file=.env.local');
const sql = neon(process.env.DATABASE_URL);
const mode = process.argv[2] || 'list';

const [exists] = await sql`select to_regclass('waitlist_leads') is not null as ok`;
if (!exists.ok) { console.log('Таблицы waitlist_leads ещё нет — она появится после первой заявки на проде.'); process.exit(0); }

const COLS = ['created_at', 'email', 'tier', 'local_ai', 'budget', 'deposit', 'call_ok', 'utm_source', 'utm_medium',
  'utm_campaign', 'referrer', 'variant', 'lang', 'ref', 'my_ref', 'submissions'];
const rows = await sql.query(`select ${COLS.join(', ')} from waitlist_leads
  where email not like '%@example.com' order by created_at desc`);

if (mode === 'daily') {
  const days = Math.min(365, Math.max(1, parseInt(process.argv[3], 10) || 30));
  const cut = Date.now() - days * 864e5;
  const agg = {};
  for (const r of rows) {
    if (r.created_at.getTime() < cut || String(r.utm_source).toLowerCase() === 'test') continue;
    const k = `${r.created_at.toISOString().slice(0, 10)}\t${r.utm_source || r.referrer || 'direct'}\t${r.utm_campaign || ''}`;
    agg[k] = (agg[k] || 0) + 1;
  }
  const out = Object.entries(agg).sort(([a], [b]) => b.localeCompare(a))
    .map(([k, leads]) => { const [day, source, campaign] = k.split('\t'); return { day, source, campaign, leads }; });
  console.log(`Заявки по дням за ${days} дн.: всего ${out.reduce((a, r) => a + r.leads, 0)}`);
  console.table(out);
  process.exit(0);
}

if (mode === 'csv') {
  const cell = (v) => {
    const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join('|') : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  console.log(COLS.join(','));
  for (const r of rows) console.log(COLS.map((c) => cell(r[c])).join(','));
  process.exit(0);
}

const list = mode === 'calls' ? rows.filter((r) => r.call_ok) : rows;
const share = (n) => (rows.length ? `${n} (${Math.round((100 * n) / rows.length)}%)` : '0');
const count = (f) => rows.filter(f).length;

console.log(`Заявок: ${rows.length} (без @example.com)`);
console.log(`Модель: Pocket ${count((r) => r.tier === 'pocket')} · One ${count((r) => r.tier === 'one')} · Pro ${count((r) => r.tier === 'pro')}`);
console.log(`Уже запускают локальный ИИ (Ollama/LM Studio/своё железо): ${share(count((r) => r.local_ai.some((v) => ['ollama', 'lmstudio', 'own_hw'].includes(v))))}`);
console.log(`Бюджет ≥ $500: ${share(count((r) => ['500_699', '700p'].includes(r.budget)))}`);
console.log(`Депозит $49 «да» (H5): ${share(count((r) => r.deposit === 'yes'))}`);
console.log(`Готовы на звонок: ${share(count((r) => r.call_ok))}`);
console.log('');
console.table(list.map((r) => ({
  date: r.created_at.toISOString().slice(0, 10), email: r.email, tier: r.tier, local_ai: r.local_ai.join(','),
  budget: r.budget, deposit: r.deposit, call: r.call_ok, source: r.utm_source || r.referrer || 'direct',
})));
