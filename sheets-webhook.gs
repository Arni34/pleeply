/** @OnlyCurrentDoc */
// ↑ скрипт просит доступ только к этой таблице, а не ко всем таблицам в Drive.

/**
 * pleeply — приём заявок и событий лендинга в Google-таблицу.
 *
 * Установка (≈5 минут, подробно — SHEETS_SETUP.md):
 *  1. sheets.new → назвать таблицу «pleeply — спрос».
 *  2. Расширения → Apps Script → удалить всё и вставить этот файл → Сохранить.
 *  3. Сверху выбрать функцию setup → Выполнить → разрешить доступ к таблице.
 *     Появятся листы funnel, waitlist, events, interviews.
 *  4. Развернуть → Новое развёртывание → тип «Веб-приложение»:
 *     Выполнять как: «Я», Доступ: «Все» → Развернуть → скопировать URL, оканчивающийся на /exec.
 *  5. Вставить URL в pleeply/app.js → CONFIG.endpoint и задеплоить лендинг.
 *
 * После правок этого файла: Развернуть → Управление развёртываниями → карандаш → Версия «Новая».
 * Тогда URL не меняется.
 *
 * Строки с utm_source=test пишутся как обычно, но в сводку funnel не идут —
 * так контрольная заявка не портит цифры.
 */

const SHEETS = {
  // A ts, B email, C tier, D uses, E current, F deposit, G lang, H variant, I source, J medium,
  // K utm_source, L utm_medium, M utm_campaign, N ref, O my_ref, P referrer, Q session.
  waitlist: ['ts', 'email', 'tier', 'uses', 'current', 'deposit', 'lang', 'variant', 'source', 'medium',
    'utm_source', 'utm_medium', 'utm_campaign', 'ref', 'my_ref', 'referrer', 'session'],
  // A ts, B event, C session, D detail, E lang, F variant, G source, H medium,
  // I utm_source, J utm_medium, K utm_campaign, L ref, M referrer.
  events: ['ts', 'event', 'session', 'detail', 'lang', 'variant', 'source', 'medium',
    'utm_source', 'utm_medium', 'utm_campaign', 'ref', 'referrer'],
  interviews: ['date', 'name', 'segment', 'uses_now', 'pain_in_own_words', 'tried_to_solve',
    'spent_time_or_money', 'reaction_to_landing', 'deposit_49', 'notes'],
};
// signup в events приходит не с клиента, а дублируется из заявки — так вся воронка видна на одном листе.
const EVENTS = ['view', 'pricing_view', 'tier_click', 'form_open'];

// Заход без UTM: сводим известные referrer к тем же именам, что в UTM-ссылках из VALIDATION.md.
const REF_SOURCES = [
  [/(^|\.)reddit\.com$|^redd\.it$/, 'reddit'],
  [/(^|\.)ycombinator\.com$/, 'hn'],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
  [/^t\.me$|(^|\.)telegram\.org$/, 'telegram'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
];
const OWN_HOST = 'pleeply.vercel.app';

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_('bad json');
  }
  if (!data || data.company) return out_('ok'); // ловушка для ботов
  channel_(data);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (data.type === 'signup') {
      const email = String(data.email || '').trim().toLowerCase().slice(0, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return out_('bad email');
      data.email = email;
      data.uses = Array.isArray(data.uses) ? data.uses.join(', ') : '';
      append_('waitlist', data);
      append_('events', Object.assign({}, data, { event: 'signup', detail: data.tier }));
    } else if (data.type === 'event' && EVENTS.indexOf(data.event) !== -1) {
      append_('events', data);
    }
  } finally {
    lock.releaseLock();
  }
  return out_('ok');
}

function doGet() {
  return out_('pleeply webhook ok');
}

// source — откуда пришёл (utm_source, иначе сайт-источник, иначе direct),
// medium — тип трафика (utm_medium, иначе referral или direct). H2/H3 считаются по medium.
function channel_(data) {
  const utmSource = String(data.utm_source || '').trim().toLowerCase();
  const utmMedium = String(data.utm_medium || '').trim().toLowerCase();
  let host = String(data.referrer || '').trim().toLowerCase().replace(/^www\./, '');
  if (host === OWN_HOST) host = '';

  let source = utmSource;
  if (!source && host) {
    const known = REF_SOURCES.filter(function (r) { return r[0].test(host); })[0];
    source = known ? known[1] : host;
  }
  data.source = source || 'direct';
  data.medium = utmMedium || (host ? 'referral' : utmSource ? 'other' : 'direct');
}

function append_(name, data) {
  const row = SHEETS[name].map(function (k) {
    return k === 'ts' ? new Date() : clean_(data[k]);
  });
  sheet_(name).appendRow(row);
}

// Режем длину и гасим формулы: ячейка, начинающаяся с = + - @, станет текстом.
function clean_(v) {
  let s = v == null ? '' : String(v).slice(0, 300);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, SHEETS[name].length).setFontWeight('bold');
  }
  return sh;
}

function out_(s) {
  return ContentService.createTextOutput(s);
}

// ---- сводка funnel. Везде отсекаем тестовые строки: events!G / waitlist!I = source.
const EV_REAL = 'events!G2:G,"<>test"';
const WL_REAL = 'waitlist!I2:I,"<>test"';
const evCount_ = (event, extra) => 'COUNTIFS(events!B2:B,"' + event + '",' + EV_REAL + (extra ? ',' + extra : '') + ')';
const evSessions_ = (event) =>
  'IFERROR(ROWS(UNIQUE(FILTER(events!C2:C,events!B2:B="' + event + '",events!G2:G<>"test"))),0)';
const wlShare_ = (criteria) =>
  'IFERROR((' + criteria.map(function (c) { return 'COUNTIFS(' + c + ',' + WL_REAL + ')'; }).join('+') +
  ')/COUNTIFS(waitlist!B2:B,"<>",' + WL_REAL + '),0)';

/** Один раз: создать листы и сводку воронки. Повторный запуск пересобирает только лист funnel. */
function setup() {
  Object.keys(SHEETS).forEach(sheet_);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const f = ss.getSheetByName('funnel') || ss.insertSheet('funnel', 0);
  f.clear();

  const conv = (extra) => '=IFERROR(' + evCount_('signup', extra) + '/' + evCount_('view', extra) + ',0)';
  const rows = [
    ['Метрика', 'Значение', 'Порог (VALIDATION.md)'],
    ['Визиты (сессии)', '=' + evCount_('view'), 'для выводов 1000+'],
    ['Дошли до цен (сессии)', '=' + evCount_('pricing_view'), ''],
    ['Нажали «Резерв» у цены (сессии)', '=' + evSessions_('tier_click'), ''],
    ['Открыли форму (сессии)', '=' + evSessions_('form_open'), ''],
    ['Отправили форму', '=' + evCount_('signup'), ''],
    ['Заявки (уникальные e-mail)', '=IFERROR(ROWS(UNIQUE(FILTER(waitlist!B2:B,waitlist!B2:B<>"",waitlist!I2:I<>"test"))),0)', 'для выводов 150+'],
    ['Визит → заявка, весь трафик', conv(''), ''],
    ['H2 · тёплый трафик (всё, кроме paid)', conv('events!H2:H,"<>paid"'), 'да ≥15% · нет <5%'],
    ['H3 · холодный трафик (utm_medium=paid)', conv('events!H2:H,"paid"'), 'да ≥4% · нет <1,5%'],
    ['H4 · заявки на устройство (One+Pro)', '=' + wlShare_(['waitlist!C2:C,"one"', 'waitlist!C2:C,"pro"']), 'да ≥50% · нет <30%'],
    ['H5 · «Да» на депозит $49', '=' + wlShare_(['waitlist!F2:F,"yes"']), 'да ≥15% · нет <5%'],
    ['Пришли по реф-ссылке', '=COUNTIFS(waitlist!N2:N,"?*",' + WL_REAL + ')', ''],
    ['Тестовые строки (в счёт не идут)', '=COUNTIF(events!G2:G,"test")+COUNTIF(waitlist!I2:I,"test")', ''],
    ['', '', ''],
    ['H7 — таблица «Заголовок» справа', '', 'лидер ≥1,5× худшего при ≥300 визитах на вариант'],
  ];
  f.getRange(1, 1, rows.length, 3).setValues(rows);
  f.getRange('B8:B12').setNumberFormat('0.0%');

  // Конверсия визит → заявка в разрезе: канал (H2/H3), источник, заголовок (H7).
  convTable_(f, ['E', 'F', 'G', 'H'], 'H', 'Канал (medium)');
  convTable_(f, ['J', 'K', 'L', 'M'], 'G', 'Источник');
  convTable_(f, ['O', 'P', 'Q', 'R'], 'F', 'Заголовок (?v=)');

  // Распределения ответов в заявках.
  const dist = (col, label) => '=IFERROR(QUERY(waitlist!A1:Q,"select ' + col + ', count(B) where B is not null and I <> \'test\' group by ' +
    col + ' label ' + col + ' \'' + label + '\', count(B) \'Заявки\'",1),"нет заявок")';
  f.getRange('T1').setFormula(dist('C', 'Вариант'));
  f.getRange('W1').setFormula(dist('F', 'Депозит $49'));
  f.getRange('Z1').setFormula(dist('E', 'Сейчас'));

  f.getRange(1, 1, 1, 27).setFontWeight('bold');
  f.setFrozenRows(1);
  f.autoResizeColumns(1, 27);
}

// key — колонка листа events, по которой режем: F variant, G source, H medium.
function convTable_(f, cols, key, title) {
  const k = cols[0], v = cols[1], s = cols[2], c = cols[3];
  const keys = k + '2:' + k;
  const by = 'events!' + key + '2:' + key;
  const count = (event) => 'COUNTIFS(events!B2:B,"' + event + '",' + by + ',' + keys + ',' + EV_REAL + ')';
  f.getRange(k + '1:' + c + '1').setValues([[title, 'Визиты', 'Заявки', 'Конверсия']]);
  f.getRange(k + '2').setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + by +
    ',(events!B2:B="view")+(events!B2:B="signup"),events!G2:G<>"test"))),)');
  f.getRange(v + '2').setFormula('=ARRAYFORMULA(IF(' + keys + '="",,' + count('view') + '))');
  f.getRange(s + '2').setFormula('=ARRAYFORMULA(IF(' + keys + '="",,' + count('signup') + '))');
  f.getRange(c + '2').setFormula('=ARRAYFORMULA(IF(' + keys + '="",,IFERROR(' + s + '2:' + s + '/' + v + '2:' + v + ',0)))');
  f.getRange(c + '2:' + c).setNumberFormat('0.0%');
}
