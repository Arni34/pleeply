/* pleeply — смоук-тест спроса: тексты EN/RU, варианты заголовка, вейтлист и события воронки. */

const CONFIG = {
  // URL веб-приложения Apps Script (…/exec) из sheets-webhook.gs.
  // Пока пусто — заявки и события копятся в localStorage (pleeply.outbox() в консоли).
  endpoint: '',
  // Письмо о каждой заявке. Основной путь — Web3Forms: ключ доступа с web3forms.com
  // (публичный, рассчитан на код страницы, письма идут на почту, к которой он привязан).
  web3formsKey: '975f3c98-d0a3-4f86-a0fc-504125c833b5',
  // Запасной путь — formsubmit.co, работает только после активации формы по письму.
  notify: 'arnibb35@gmail.com',
  variants: ['own', 'privacy', 'offline'],
};

// Варианты заголовка для теста посыла (H7). ?v=privacy закрепляет вариант, без него — случайный.
const HEADLINES = {
  own: { en: 'Your own AI.<br>It lives at home.', ru: 'Свой ИИ.<br>Живёт у тебя дома.' },
  privacy: { en: 'An AI that never leaves your house.', ru: 'ИИ, который не выходит из дома.' },
  offline: { en: 'AI that works when the internet doesn’t.', ru: 'ИИ, который работает без интернета.' },
};

const SHARE_TEXT = {
  en: 'pleeply — a speaker that runs AI at home, no cloud. I joined the waitlist:',
  ru: 'pleeply — колонка, где ИИ работает дома, без облака. Я в листе ожидания:',
};

// Английский текст живёт в index.html, здесь только перевод.
const RU = {
  title: 'pleeply – свой ИИ у тебя дома',
  'nav.l1': 'Линейка',
  'nav.l2': 'Как это работает',
  'nav.l3': 'Гайды',
  'nav.l4': 'Сообщество',
  'nav.cta': 'В лист ожидания',
  'hero.sub': 'pleeply — колонка со встроенным компьютером. Она запускает открытые ИИ-модели прямо на устройстве, хранит личную память о тебе и не зависит от облака.',
  'hero.cta1': 'Зарезервировать',
  'hero.note': 'В разработке. Сегодня ничего не платишь. Напишем, когда откроем резервы.',
  'p.scroll': 'Листай вниз, чтобы заглянуть внутрь',
  'p.label': 'pleeply Pocket · дизайн прототипа',
  'p.hint': 'Тяните — поворот · листайте — откроется',
  'p.loading': 'Загружаем 3D',
  'cap1.t': 'Внутри Raspberry Pi 5',
  'cap1.d': 'С активным охлаждением. Открытые языковые модели работают прямо на устройстве.',
  'cap2.t': 'Аккумулятор 3000 мА·ч',
  'cap2.d': 'Заряжается по USB-C, включается ползунком.',
  'cap3.t': 'Динамик и микрофон',
  'cap3.d': 'Динамик 40 мм и I2S-микрофон стоят прямо за нижней панелью.',
  'cap4.t': 'Нажми и говори',
  'cap4.d': 'Кнопка утоплена, чтобы её не нажимал стол. Качелька громкости — на верхнем торце.',
  'cap5.t': 'Звучит через своё имя',
  'cap5.d': 'Динамик играет через точечную надпись «pleeply.» на дне.',
  'runs.h': 'Запускает открытые модели, которые ты уже знаешь.',
  'price.h': 'Выбери то, что купил бы на самом деле.',
  'pocket.tag': 'Прототип',
  'pocket.d': 'Карманный ИИ с аккумулятором и кнопкой «нажми и говори». Первые экземпляры собираем вручную.',
  'pocket.spec': 'Raspberry Pi 5 · компактные модели 1–3B · аккумулятор 3000 мА·ч',
  reserve: 'Зарезервировать бесплатно',
  'pocket.more': 'Смотреть в 3D',
  'one.tag': 'Колонка',
  'one.d': 'Сама колонка. Быстро работает с компактными открытыми моделями: помощь на каждый день, умный дом, память.',
  'one.spec': 'Встроенный компьютер и массив микрофонов · модели до ~8B · работает офлайн',
  more: 'Подробнее',
  'pro.tag': 'Колонка+',
  'pro.d': 'Больше памяти и мощности для крупных и умных моделей.',
  'pro.spec': 'Всё, что в One · модели до ~32B · длиннее память',
  'price.fine': 'Ожидаемые цены. Характеристики предварительные и могут измениться в процессе разработки. Резерв бесплатный и ни к чему не обязывает.',
  'proof.q': '28 марта 2025 года Amazon убрал на Echo настройку, которая <em>не пускала голосовые запросы в облако</em>.',
  'proof.p': 'TechCrunch, 15 марта 2025. pleeply устроен наоборот: модель работает на устройстве, у тебя дома.',
  'proof.link': 'Читать статью',
  'rules.h': 'Приватность встроена, а не прикручена.',
  'built.cta': 'Покажи устройство',
  'bubble.q': 'Что я говорил про день рождения мамы?',
  'art1.a': 'Тюльпаны, 12-го.',
  'art.ondevice': 'На устройстве',
  'feat1.t': 'Голос обрабатывается в комнате, а не на сервере.',
  'art2.r1': 'Слово-активатор',
  'art2.r2': 'Распознавание речи',
  'art2.r3': 'Языковая модель',
  'art2.r4': 'Синтез голоса',
  'feat2.t': 'Каждый шаг идёт на устройстве: слово-активатор, распознавание, модель и голос.',
  'art3.net': 'Интернет',
  'art3.q': 'Поставь таймер на 10 минут',
  'art3.a': 'Таймер на 10 минут запущен.',
  'feat3.t': 'Работает, даже когда пропал интернет.',
  'art4.h': 'Память',
  'art4.r1': 'День рождения мамы: тюльпаны, 12-го',
  'art4.r2': 'Кофе: овсяное молоко, без сахара',
  'art4.r3': 'Дети ложатся в 21:00',
  'feat4.t': 'Память хранится на устройстве, и её можно править.',
  'art5.h': 'Модель',
  'feat5.t': 'Меняй открытые модели, когда выходят лучше.',
  'art6.h': 'Назови колонку',
  'art6.v': 'Кухня',
  'art6.btn': 'Дальше',
  'art6.note': 'Без почты и аккаунта',
  'feat6.t': 'Без аккаунта и регистрации.',
  'how.eyebrow': 'Как это работает',
  'how.h': 'Говоришь. Думает. Помнит.',
  'how.p': 'Ты говоришь. Думает открытая языковая модель на компьютере внутри. Память остаётся на устройстве: её можно посмотреть, исправить или удалить.',
  'how.cta': 'Как устроен локальный ассистент',
  'next.h': 'Твой следующий шаг.',
  'next.cta1': 'Встать в лист ожидания',
  'next.cta2': 'Вступить в сообщество',
  'uses.h': 'Под то, как ты живёшь.',
  'use1.t': 'Личный ассистент',
  'use1.d': 'Спрашивай, ставь таймеры, думай вслух. Ответ считается прямо в комнате.',
  'use2.t': 'Заметки и память',
  'use2.d': 'Расскажи, что важно. Память живёт на устройстве: её можно посмотреть, исправить или удалить.',
  'use3.t': 'Умный дом',
  'use3.d': 'Управляй домом голосом без поездки в облако.',
  'use4.t': 'Дети и семья',
  'use4.d': 'Колонка, которая не отправляет голоса твоей семьи на серверы компаний.',
  'use5.t': 'Работа и документы',
  'use5.d': 'Обдумывай работу вслух и храни заметки на своём устройстве.',
  'use6.t': 'Свои модели',
  'use6.d': 'Запускай Llama, Qwen, Mistral или Gemma и меняй их, когда выходят лучше.',
  'guide.h': 'Гайды по локальному ИИ.',
  'guide.p': 'Бесплатные гайды о том, как запустить ИИ дома: железо, модели, память, приватность и умный дом. У каждого есть источники. Пока на английском.',
  'guide.cta': 'Открыть гайды',
  'doc.hw': 'Железо',
  'doc.privacy': 'Приватность',
  'res.h': 'Что ещё почитать.',
  'res.all': 'Все гайды',
  'res1.type': 'Гайд',
  'res1.t': 'Языковая модель на Raspberry Pi 5',
  'res2.type': 'Сравнение',
  'res2.t': 'Открытые голосовые ассистенты: сравнение',
  'res3.type': 'Разбор',
  'res3.t': 'Приватные альтернативы Alexa',
  'foot.products': 'Устройства',
  'foot.learn': 'Узнать',
  'foot.guides': 'Гайды',
  'foot.faq': 'Что такое pleeply?',
  'foot.hw': 'Выбрать железо',
  'foot.community': 'Сообщество',
  'foot.forum': 'Форум',
  'foot.join': 'Вступить',
  'foot.about': 'Колонка со встроенным компьютером. Открытые модели, личная память, без облака. В разработке.',
  'final.h': 'Твой ИИ должен жить у тебя.',
  'final.cta': 'Встать в лист ожидания',
  'com.cta': 'Открыть сообщество',
  footer: '© 2026 pleeply. В разработке.',
  'foot.top': 'Наверх ↑',
  'f.h': 'Лист ожидания',
  'f.lead': '20 секунд. Без оплаты.',
  'f.email': 'Почта',
  'f.err': 'Проверь адрес почты.',
  'f.tier': 'Что бы ты купил?',
  'f.uses': 'Для чего он тебе?',
  'u.assistant': 'Личный ассистент',
  'u.memory': 'Заметки и память',
  'u.home': 'Умный дом',
  'u.family': 'Дети и семья',
  'u.work': 'Работа и документы',
  'u.models': 'Свои модели',
  'f.current': 'Чем пользуешься сейчас?',
  'c.pick': 'Выбери',
  'c.ai': 'ChatGPT или другое ИИ-приложение',
  'c.local': 'Своя локальная сборка',
  'c.none': 'Пока ничем',
  'f.deposit': 'Внёс бы возвратный депозит $49, чтобы получить одно из первых устройств?',
  'd.yes': 'Да',
  'd.maybe': 'Возможно',
  'd.no': 'Нет',
  'f.submit': 'Встать в лист',
  'f.small': 'Пишем только про pleeply.',
  's.h': 'Ты в списке.',
  's.p': 'Знаешь, кому он нужен? Поделись ссылкой.',
  's.copy': 'Копировать',
  's.x': 'Поделиться в X',
  's.community': 'Вступить в сообщество',
  's.copied': 'Скопировано',
};

(() => {
  const qs = new URLSearchParams(location.search);
  const safe = (s) => ({
    get(k) { try { return s.getItem(k); } catch { return null; } },
    set(k, v) { try { s.setItem(k, v); } catch { /* приватный режим */ } },
  });
  const store = safe(window.localStorage);
  const sess = safe(window.sessionStorage);
  const rid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const readJSON = (k, fallback) => { try { return JSON.parse(store.get(k)) ?? fallback; } catch { return fallback; } };

  // ---- контекст визита
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

  let variant = qs.get('v');
  if (!CONFIG.variants.includes(variant)) variant = store.get('pl_variant');
  if (!CONFIG.variants.includes(variant)) variant = CONFIG.variants[Math.floor(Math.random() * CONFIG.variants.length)];
  store.set('pl_variant', variant);

  const navLang = (navigator.language || 'en').toLowerCase();
  let lang = qs.get('lang') || store.get('pl_lang') || (/^(ru|kk|uk|be)/.test(navLang) ? 'ru' : 'en');
  if (!['en', 'ru'].includes(lang)) lang = 'en';

  // ---- отправка в таблицу
  function send(payload) {
    const data = { ts: new Date().toISOString(), session, lang, variant, referrer, ...attr, ...payload };
    if (!CONFIG.endpoint) {
      const box = readJSON('pl_outbox', []);
      box.push(data);
      store.set('pl_outbox', JSON.stringify(box.slice(-200)));
      console.info('[pleeply] endpoint не задан — сохранено локально:', data);
      return;
    }
    fetch(CONFIG.endpoint, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
    }).catch(() => {});
  }
  const track = (event, detail = '') => send({ type: 'event', event, detail });
  const once = (key, fn) => { if (!sess.get(key)) { sess.set(key, '1'); fn(); } };

  // ---- письмо о заявке
  const TIERS = { pocket: 'Pocket · $499', one: 'One · $299', pro: 'Pro · $549' };
  function notify(s) {
    const source = [attr.utm_source, attr.utm_medium, attr.utm_campaign].filter(Boolean).join(' / ');
    const subject = `pleeply: заявка — ${TIERS[s.tier] || s.tier}`;
    const fields = {
      email: s.email,
      'Вариант': TIERS[s.tier] || s.tier,
      'Депозит $49': s.deposit || '—',
      'Для чего': s.uses.join(', ') || '—',
      'Сейчас пользуется': s.current || '—',
      'Источник': source || referrer || 'прямой заход',
      'Заголовок': variant,
      'Язык': lang,
      'Пришёл по реф-ссылке': attr.ref || '—',
      'Реф-код': myRef,
    };
    const post = (url, body) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});

    if (CONFIG.web3formsKey) {
      post('https://api.web3forms.com/submit', {
        access_key: CONFIG.web3formsKey, subject, from_name: 'pleeply waitlist', ...fields,
      });
    } else if (CONFIG.notify) {
      post(`https://formsubmit.co/ajax/${CONFIG.notify}`, {
        _subject: subject, _template: 'table', _captcha: 'false', ...fields,
      });
    }
  }

  // ---- язык
  const nodes = [...document.querySelectorAll('[data-i]')];
  const EN = { title: document.title, 's.copied': 'Copied' };
  nodes.forEach((n) => { EN[n.dataset.i] = n.innerHTML; });
  const headline = document.getElementById('headline');

  const form = document.getElementById('form');
  const shareInput = document.getElementById('share-url');
  const shareX = document.getElementById('share-x');
  const copyBtn = document.getElementById('copy');

  function shareUrl() {
    return `${location.origin}${location.pathname}?ref=${myRef}${lang === 'ru' ? '&lang=ru' : ''}`;
  }
  function updateShare() {
    const url = shareUrl();
    shareInput.value = url;
    shareX.href = `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT[lang])}&url=${encodeURIComponent(url)}`;
  }

  function applyLang(l) {
    lang = l;
    store.set('pl_lang', l);
    document.documentElement.lang = l;
    const dict = l === 'ru' ? RU : EN;
    nodes.forEach((n) => {
      const v = dict[n.dataset.i] ?? EN[n.dataset.i];
      if (v != null) n.innerHTML = v;
    });
    headline.innerHTML = HEADLINES[variant][l];
    document.title = dict.title || EN.title;
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    updateShare();
  }
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));
  applyLang(lang);

  // ---- воронка: визит → увидел цены → клик по цене → открыл форму → заявка
  once('pl_ev_view', () => track('view'));

  const tiers = document.getElementById('tiers');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        once('pl_ev_pricing', () => track('pricing_view'));
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(tiers);
  }

  // ---- форма
  const dlg = document.getElementById('dlg');
  const err = document.getElementById('email-err');

  function openForm(tier, source) {
    if (tier) form.tier.value = tier;
    track('form_open', tier ? `${source}:${tier}` : source);
    if (store.get('pl_joined')) form.classList.add('sent');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (!form.classList.contains('sent')) setTimeout(() => form.email.focus(), 60);
  }

  document.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => {
    track('tier_click', b.dataset.tier);
    openForm(b.dataset.tier, 'tier');
  }));
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openForm(null, b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  // Прямая ссылка на регистрацию: pleeply.vercel.app/#join сразу открывает форму.
  const openFromHash = () => { if (location.hash === '#join' && !dlg.open) openForm(null, 'link'); };
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    err.classList.toggle('on', !ok);
    if (!ok) { form.email.focus(); return; }
    if (!form.company.value) {
      const signup = {
        type: 'signup',
        email,
        tier: form.tier.value,
        uses: [...form.querySelectorAll('[name=uses]:checked')].map((i) => i.value),
        current: form.current.value,
        deposit: form.deposit.value || '',
        my_ref: myRef,
      };
      send(signup);
      notify(signup);
      store.set('pl_joined', '1');
    }
    form.classList.add('sent');
    updateShare();
  });

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareInput.value); } catch { shareInput.select(); document.execCommand('copy'); }
    copyBtn.textContent = (lang === 'ru' ? RU : EN)['s.copied'];
  });

  // ---- появление блоков при скролле
  const rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    rv.forEach((n) => io.observe(n));
  } else {
    rv.forEach((n) => n.classList.add('in'));
  }

  window.pleeply = { outbox: () => readJSON('pl_outbox', []), variant, session };
})();
