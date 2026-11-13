/* pleeply — своя аналитика без cookie: события уходят в /api/track → Neon (таблица site_events).
   Визит = id в sessionStorage (живёт до закрытия вкладки), IP и user-agent в базу не пишутся.
   Источник: utm_* из ссылки (запоминается в localStorage как в app.js) → иначе внешний referrer первой страницы визита → иначе direct.
   Тестовый визит: ?utm_source=test или ?pl_test=1 — такие строки помечаются is_test и в отчёт не идут.
   API: window.plTrack(event, detail) — его зовёт app.js (tier_click, form_open, pricing_view, signup).
   Почта сюда не попадает: анкета листа ожидания сохраняется отдельно через /api/waitlist (waitlist_leads). */
(function () {
  'use strict';
  function safe(s) {
    return {
      get: function (k) { try { return s.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { s.setItem(k, v); } catch (e) { /* приватный режим */ } },
    };
  }
  var store = safe(window.localStorage);
  var sess = safe(window.sessionStorage);
  var qs = new URLSearchParams(location.search);
  var rid = function () { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); };

  // Тот же ключ, что в app.js: один визит на главной и в гайдах
  var session = sess.get('pl_session') || rid();
  sess.set('pl_session', session);

  // UTM — та же схема хранения, что в app.js (pl_attr)
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign'];
  var attr = {};
  if (UTM.some(function (k) { return qs.get(k); }) || qs.get('ref')) {
    UTM.forEach(function (k) { attr[k] = (qs.get(k) || '').slice(0, 80); });
    attr.ref = (qs.get('ref') || '').slice(0, 20);
    store.set('pl_attr', JSON.stringify(attr));
  } else {
    try { attr = JSON.parse(store.get('pl_attr')) || {}; } catch (e) { attr = {}; }
  }

  // Внешний referrer первой страницы визита: переходы внутри сайта его не затирают
  var firstRef = sess.get('pl_first_ref');
  if (firstRef === null) {
    firstRef = '';
    try {
      var h = document.referrer ? new URL(document.referrer).hostname : '';
      if (h && h !== location.hostname) firstRef = h;
    } catch (e) { /* битый referrer */ }
    sess.set('pl_first_ref', firstRef);
  }

  if (qs.get('pl_test') === '1' || String(attr.utm_source).toLowerCase() === 'test') sess.set('pl_test', '1');
  var isTest = sess.get('pl_test') === '1';

  function post(body) {
    try {
      fetch('/api/track', {
        method: 'POST',
        keepalive: true,
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'X-Pleeply': '1' },
        body: JSON.stringify(body),
      }).catch(function () {});
    } catch (e) { /* старый браузер */ }
  }

  function base() {
    return {
      session: session,
      path: location.pathname.slice(0, 200),
      referrer: firstRef,
      utm_source: attr.utm_source || '',
      utm_medium: attr.utm_medium || '',
      utm_campaign: attr.utm_campaign || '',
      ref: attr.ref || '',
      variant: store.get('pl_variant') || '',
      lang: store.get('pl_lang') || document.documentElement.lang || '',
      test: isTest,
    };
  }

  function track(event, detail) {
    var b = base();
    b.type = 'event';
    b.event = event;
    b.detail = String(detail || '').slice(0, 120);
    post(b);
    // Дублируем в Vercel Web Analytics (кастомные события там есть только на платном плане — на Hobby просто не покажутся)
    try { if (window.va) window.va('event', { name: event, data: { detail: b.detail } }); } catch (e) { /* нет va */ }
  }
  var once = function (key, fn) { if (!sess.get(key)) { sess.set(key, '1'); fn(); } };

  window.plTrack = track;

  // ---- автоматические события
  var path = location.pathname;
  track('pageview', '');

  // Гайд: /info/<slug>/ (оглавление /info/ — не гайд)
  var guide = path.match(/^\/info\/([a-z0-9-]+)\/?$/);
  if (guide) track('guide_view', guide[1]);

  // Страница модели: будущие /pocket, /one, /pro (+ /models/<id>)
  var model = path.match(/^\/(?:models\/)?(pocket|one|pro)\/?$/);
  if (model) track('model_open', model[1] + ':page');

  // Клики по ссылкам и кнопкам с data-model (карточки линейки на главной)
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-model-open]');
    if (a) track('model_open', a.getAttribute('data-model-open'));
  }, true);

  // Карточка модели попала в экран — «увидел модель»
  if ('IntersectionObserver' in window) {
    var cards = document.querySelectorAll('[data-model]');
    if (cards.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var m = en.target.getAttribute('data-model');
          once('pl_mv_' + m, function () { track('model_view', m); });
          io.unobserve(en.target);
        });
      }, { threshold: 0.5 });
      cards.forEach(function (c) { io.observe(c); });
    }
  }
})();
