/* pleeply — главная (Desktop, только EN): запись на ранний доступ Desktop, события воронки, схема режимов.
   Вейтлист на Pocket снят: устройство — на будущее, на странице только информация о нём.
   Прошлая версия (колонка Pocket, A/B заголовков) — archive/app.before-desktop.js */

const CONFIG = {
  // Письмо о каждой заявке через Web3Forms. Ключ публичный, рассчитан на код страницы:
  // письма идут на почту, к которой он привязан. Основное хранилище — Neon через /api/waitlist.
  web3formsKey: '975f3c98-d0a3-4f86-a0fc-504125c833b5',
  // Версия посыла на главной (пишется в заявку, чтобы сравнивать с прошлыми вариантами)
  variant: 'desktop2', // desktop1 — тёмная/светлая версия ноября, desktop2 — раскладка как у openai.com
};

(() => {
  'use strict';

  // ---- хранилища: в приватном режиме и при запрете cookie доступ может бросать исключение
  const safe = (getter) => {
    let s = null;
    try { s = getter(); } catch { /* недоступно */ }
    return {
      get: (k) => { try { return s ? s.getItem(k) : null; } catch { return null; } },
      set: (k, v) => { try { if (s) s.setItem(k, v); } catch { /* переполнено или запрещено */ } },
    };
  };
  const store = safe(() => window.localStorage);
  const sess = safe(() => window.sessionStorage);
  const qs = new URLSearchParams(location.search);
  const rid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const readJSON = (k, fallback) => { try { return JSON.parse(store.get(k)) ?? fallback; } catch { return fallback; } };
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- контекст визита (те же ключи, что в assets/track.js)
  const session = sess.get('pl_session') || rid();
  sess.set('pl_session', session);
  const myRef = store.get('pl_my_ref') || rid();
  store.set('pl_my_ref', myRef);

  const UTM = ['utm_source', 'utm_medium', 'utm_campaign'];
  let attr;
  if (UTM.some((k) => qs.get(k)) || qs.get('ref')) {
    attr = Object.fromEntries(UTM.map((k) => [k, (qs.get(k) || '').slice(0, 80)]));
    attr.ref = (qs.get('ref') || '').slice(0, 20);
    store.set('pl_attr', JSON.stringify(attr));
  } else {
    attr = readJSON('pl_attr', {});
  }
  if (attr.ref === myRef) attr.ref = '';

  let referrer = '';
  try { referrer = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* битый referrer */ }
  // Внешний referrer первой страницы визита (его хранит assets/track.js), иначе referrer текущей страницы
  const firstReferrer = () => { const r = sess.get('pl_first_ref'); return r !== null ? r : referrer; };

  const lang = 'en'; // сайт только на английском

  // ---- события воронки → assets/track.js → /api/track (site_events). Почта туда не попадает.
  const track = (event, detail = '') => { if (window.plTrack) window.plTrack(event, String(detail)); };
  const once = (key, fn) => { if (!sess.get(key)) { sess.set(key, '1'); fn(); } };

  // ---- ссылка «поделиться» с реф-кодом
  const shareUrl = () => `${location.origin}${location.pathname}?ref=${myRef}`;
  const updateShare = () => document.querySelectorAll('[data-share]').forEach((i) => { i.value = shareUrl(); });
  updateShare();

  document.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    const input = btn.parentElement.querySelector('[data-share]');
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    const label = btn.querySelector('span');
    if (label) label.textContent = 'Copied';
  }));

  // ---- шапка: фон при прокрутке и меню на телефоне
  const nav = document.getElementById('nav');
  const menuBtn = document.getElementById('menu-btn');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const setMenu = (open) => { nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open)); };
  menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  document.getElementById('nav-links').addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // ---- клики по кнопкам «Ранний доступ» / «Посмотреть»
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-cta]');
    if (a) track('cta_click', a.dataset.cta);
  });

  // ---- письмо о заявке (запасной канал, если база не ответит)
  const LOCAL_AI = { ollama: 'Ollama', lmstudio: 'LM Studio', own_hw: 'своё железо', cloud: 'только облако', none: 'ничего' };
  const OS = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
  const RAM = { le8: '8 ГБ и меньше', 16: '16 ГБ', 32: '32 ГБ', '64p': '64 ГБ+', unsure: 'не знает' };
  const GPU = { apple: 'Apple Silicon', nvidia: 'NVIDIA', amd: 'AMD', integrated: 'Intel / встроенная', unsure: 'не знает' };
  const USE = { chat: 'чат и тексты', code: 'код', docs: 'поиск и документы', agents: 'агенты', offline: 'приватно без сети' };
  const names = (vals, dict) => vals.map((v) => dict[v] || v).join(', ') || '—';

  function notify(lead) {
    if (!CONFIG.web3formsKey) return;
    const source = [attr.utm_source, attr.utm_medium, attr.utm_campaign].filter(Boolean).join(' / ');
    const call = lead.call === 'yes' ? ' · готов на звонок' : '';
    const common = {
      email: lead.email,
      'Имя': lead.name || '—',
      'Интервью 15 мин': lead.call === 'yes' ? 'да' : '—',
      'Источник': source || firstReferrer() || 'прямой заход',
      'Пришёл по реф-ссылке': attr.ref || '—',
    };
    const body = { subject: `pleeply: ранний доступ Desktop — ${lead.name}${call}`, 'Список': 'Desktop, ранний доступ', ...common,
      'ОС': OS[lead.os] || '—', 'Память': RAM[lead.ram] || '—', 'Видеокарта': GPU[lead.gpu] || '—',
      'Для чего': names(lead.use_cases, USE), 'ИИ сейчас': names(lead.local_ai, LOCAL_AI) };
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: CONFIG.web3formsKey, from_name: 'pleeply', ...body }),
    }).catch(() => {});
  }

  // ---- заявка в базу (Neon, таблица waitlist_leads через /api/waitlist)
  function saveLead(lead) {
    fetch('/api/waitlist', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Pleeply': '1' },
      body: JSON.stringify({
        ...lead, lang, variant: CONFIG.variant, session, referrer: firstReferrer(), my_ref: myRef, ref: attr.ref || '',
        utm_source: attr.utm_source || '', utm_medium: attr.utm_medium || '', utm_campaign: attr.utm_campaign || '',
      }),
    }).then((r) => { if (!r.ok) track('lead_save_failed', `${lead.list}:${r.status}`); })
      .catch(() => track('lead_save_failed', `${lead.list}:network`));
  }

  // ---- форма раннего доступа Desktop (имя обязательно)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function showErr(input, ok) {
    input.classList.toggle('bad', !ok);
    input.setAttribute('aria-invalid', String(!ok));
    const msg = document.getElementById(input.getAttribute('aria-describedby'));
    if (msg) msg.classList.toggle('on', !ok);
  }

  document.querySelectorAll('form[data-list]').forEach((form) => {
    const which = form.dataset.list;
    const card = form.closest('.list-card');
    const done = card.querySelector('.done');
    const el = (n) => form.elements.namedItem(n);
    const value = (n) => { const x = el(n); return x ? String(x.value || '') : ''; };
    const checked = (n) => [...form.querySelectorAll(`[name="${n}"]:checked`)].map((i) => i.value);
    const joinedKey = `pl_joined_${which}`;

    // Уже записан на этом устройстве — сразу показываем «готово»
    if (store.get(joinedKey)) card.classList.add('sent');

    form.addEventListener('focusin', () => once(`pl_fo_${which}`, () => track('form_open', which)));
    form.addEventListener('input', (e) => { if (e.target.classList.contains('bad')) showErr(e.target, true); });

    // «Пока ничем» и «только облако» не сочетаются с остальными вариантами
    const EXCLUSIVE = ['none', 'cloud'];
    form.querySelectorAll('[name=local_ai]').forEach((box) => box.addEventListener('change', () => {
      if (!box.checked) return;
      form.querySelectorAll('[name=local_ai]').forEach((other) => {
        if (other !== box && (EXCLUSIVE.includes(box.value) || EXCLUSIVE.includes(other.value))) other.checked = false;
      });
    }));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = value('email').trim();
      const name = value('name').trim().slice(0, 80);
      const okEmail = EMAIL_RE.test(email);
      const okName = which !== 'desktop' || name.length > 0;
      showErr(el('email'), okEmail);
      if (which === 'desktop') showErr(el('name'), okName);
      if (!okName) { el('name').focus(); return; }
      if (!okEmail) { el('email').focus(); return; }

      if (!value('company')) { // ловушка для ботов пуста — значит человек
        const lead = { list: which, email, name, call: el('call') && el('call').checked ? 'yes' : '' };
        Object.assign(lead, { os: value('os'), ram: value('ram'), gpu: value('gpu'), use_cases: checked('use_cases'), local_ai: checked('local_ai') });
        saveLead(lead);
        notify(lead);
        track('signup', which);
        store.set(joinedKey, '1');
      }
      card.classList.add('sent');
      updateShare();
      done.setAttribute('tabindex', '-1');
      done.focus({ preventScroll: true });
      card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    });
  });

  // Блок записи попал в экран — «увидел списки»
  const join = document.getElementById('join');
  if (join && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) { once('pl_ev_waitlist', () => track('waitlist_view')); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(join);
  }

  // ---- схема гибридного режима: Local → Cloud → Auto, пока пользователь сам не выберет
  const map = document.getElementById('map');
  const modeBtns = [...document.querySelectorAll('.mode')];
  const ORDER = ['local', 'cloud', 'auto'];
  let timer = null;
  let manual = false;
  const setMode = (m) => {
    map.dataset.mode = m;
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  };
  const stopCycle = () => { clearInterval(timer); timer = null; };
  modeBtns.forEach((b) => b.addEventListener('click', () => {
    manual = true;
    stopCycle();
    setMode(b.dataset.mode);
    once(`pl_mp_${b.dataset.mode}`, () => track('mode_pick', b.dataset.mode));
  }));
  if (map && !reduceMotion && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => entries.forEach((x) => {
      if (x.isIntersecting && !manual && !timer) {
        timer = setInterval(() => setMode(ORDER[(ORDER.indexOf(map.dataset.mode) + 1) % ORDER.length]), 3600);
      } else if (!x.isIntersecting) stopCycle();
    }), { threshold: 0.4 }).observe(map);
  }



  // ---- появление блоков при скролле
  const rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => entries.forEach((x) => {
      if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    rv.forEach((n) => io.observe(n));
  } else {
    rv.forEach((n) => n.classList.add('in'));
  }

  // ---- строка «спроси» на первом экране: вопрос уходит в браузерную версию (/chat) и считается на pleeply Cloud.
  // Текст передаётся через sessionStorage этой вкладки (не в адресе — чтобы не попасть в логи и Referer).
  // Режим Local в браузере невозможен: с ним ничего не отправляется, а подсказка ведёт к pleeply для Mac.
  const ask = document.getElementById('ask');
  if (ask) {
    const input = ask.querySelector('textarea');
    const sendBtn = ask.querySelector('.send');
    const sync = () => { sendBtn.disabled = !input.value.trim(); };
    input.addEventListener('input', sync);
    sync();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (input.value.trim()) ask.requestSubmit(); }
    });
    const hero = document.querySelector('.hero');
    const mode = () => ask.querySelector('[data-mini][aria-pressed="true"]')?.dataset.mini || 'auto';
    ask.querySelectorAll('[data-mini]').forEach((b) => b.addEventListener('click', () => {
      ask.querySelectorAll('[data-mini]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (b.dataset.mini !== 'local') hero.classList.remove('asked');
    }));
    ask.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (mode() === 'local') {
        track('cta_click', 'prompt_local');
        hero.classList.add('asked');
        return;
      }
      track('cta_click', 'prompt');
      let handed = false;
      try { sessionStorage.setItem('pleeply.web.pending', JSON.stringify({ text, at: Date.now() })); handed = true; } catch {}
      // без sessionStorage — во фрагменте адреса: он не уходит на сервер и в Referer
      location.href = handed ? '/chat' : `/chat#q=${encodeURIComponent(text)}`;
    });
  }

  window.pleeply = { session, variant: CONFIG.variant };
})();
