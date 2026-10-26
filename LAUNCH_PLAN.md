# pleeply — где публиковать (по списку PlacesToPostYourStartup)

Источник: https://github.com/mmccaff/PlacesToPostYourStartup — 19 сабреддитов и 82 сайта. Проверено 19.10.2026.

## Сначала блокер

**Заявки с лендинга пока никуда не доходят.** FormSubmit отвечает «This form needs Activation». Нажми «Activate Form» в письме от FormSubmit на arnibb35@gmail.com (проверь «Спам» и «Промоакции»). Пока не нажал, любой трафик пропадает.

## Правила, чтобы не сжечь площадки

- **pleeply — предзапуск:** есть лендинг и лист ожидания, продукта ещё нет. Часть площадок такое запрещает, они в волне «Не сейчас».
- **Show HN** только для того, что можно попробовать. Страницы регистрации там явно не по теме, поэтому на HN идём через **Ask HN** (текст в `POSTS.md`).
- **Product Hunt** лучше приберечь до демо или прототипа: запуск там бывает один раз.
- **Reddit:** не больше 2–3 сабреддитов в день, у каждого свой текст. Сразу говори, что ты основатель, и прочитай правила саба. Одинаковые посты пачкой — прямой путь к теневому бану аккаунта.
- **У каждой площадки своя UTM-метка**, тогда в отчёте видно, откуда пришли заявки (`utm_source=<slug>`).

## Волна 1 — фидбек и ранние пользователи (Reddit, HN, Indie Hackers)

| Площадка | Почему подходит | Формат | Метка |
|---|---|---|---|
| r/RoastMyStartup | Просят разнести идею — это прямой фидбек для валидации | «Roast my landing + pricing» | `reddit_roast` |
| r/AlphaandBetausers | Ищем ранних тестеров | «Looking for early testers» | `reddit_alphabeta` |
| r/buildinpublic | Можно показывать процесс | Пост о проверке спроса и цифры | `reddit_bip` |
| r/SideProject | Разрешены проекты на ранней стадии | Короткий пост с картинкой | `reddit_sideproject` |
| r/indiehackers | Обсуждение проверки спроса | Пост про метод fake door | `reddit_ih` |
| r/EntrepreneurRideAlong | Посты о ходе работы | Отчёт о первой неделе | `reddit_era` |
| Indie Hackers (сайт) | Сообщество основателей | Пост в группе | `indiehackers` |
| Ask HN | Техническая аудитория, локальный ИИ в теме | Текст из `POSTS.md` | `hn` |
| r/LocalLLaMA, r/selfhosted, r/homeassistant | **Самая целевая аудитория** (их нет в списке, но они важнее) | Тексты из `POSTS.md` | `reddit_localllama` и т. д. |

Только самопиар: r/plugyourproduct, r/shamelessplug, r/IndieBiz. Трафик там слабый, но и вреда нет: одна строка и ссылка.

## Волна 2 — каталоги, которые принимают предзапуск (бесплатная форма)

Launching Next · Startup Base · Startup Inspire · LaunchIgniter · Tiny Launch · Startups Gallery · Startup Buffer · PitchWall · Getworm · Website Hunt · Awesome Indie · 10words · eBool · All Top Startups · Tech Pluto · SnapMunk · Startup Beat · Startup 88 · Netted · Next Big What · AI Collection (ИИ-тематика).

Метка: `utm_source=<slug>&utm_medium=directory`. Платное размещение отдельно, только с твоего «да» на каждое.

## Не сейчас — с причиной

- **Нужен работающий продукт:** Product Hunt, Show HN, AlternativeTo, Beta Bound, BetaTesting. Вернуться, когда будет прототип для тестеров.
- **Каталоги SaaS и приложений, не наш формат:** Capterra, G2, GetApp, Software Advice, CrozDesk, Discover Cloud, SaaSHub, SaasRow, Micro SaaS Examples, App Rater, Appoid, appPicker, Apps Listo, Apps Mamma, AppsThunder, Appvita, PreApps, Web App Rater, State of Tech, Stack Share, Slant, Postmake, Startup Stash, Saijo's list.
- **Профили компаний, нужно юрлицо или раунд:** Crunchbase, AngelList (Wellfound), Gust, F6S, StartupBlink, Startup Ranking, Startup Tracker, Tech Map, Vator, Startup Tabs.
- **Региональные СМИ и редакции:** BuiltInChicago, GeekWire, Arctic Startup, Inc42, MakeUseOf, The Changelog, Starter Story, Startup Benchmarks.
- **Не открываются:** Loop, Launched.io, Simple Lister, All Startups. Прочее: Side Projectors (продажа проектов), All My Faves, Collaborizm, Tapscape, SimilarSiteSearch, Land-book (галерея дизайна, можно позже), r/Coupons, r/LadyBusiness, r/SaaS, r/microsaas, r/SmallBusiness, r/thesidehustle, r/Design_Critiques (только чтобы попросить разбор дизайна лендинга).

## Набор для заявок (копировать в формы)

- **Name:** pleeply
- **URL:** `https://pleeply.vercel.app/?utm_source=<slug>&utm_medium=directory`
- **Tagline (≤60):** Your own AI — a speaker that runs AI at home, offline
- **One-liner (≤160):** pleeply is a speaker with a computer inside. It runs open AI models on the device, keeps a private memory of you, and works without the cloud.
- **Description:**

  Voice assistants send what you say to someone else's server. pleeply keeps it at home. It's a speaker with a small computer inside that runs open-weight AI models (Llama, Qwen, Mistral, Gemma) locally, remembers what matters to you in a private on-device memory, and keeps working when the internet doesn't. No big-tech account and no cloud required — connect online services only if you choose to.

  We're in development and testing demand before building hardware. The waitlist is free: pick the version you'd actually buy — pleeply Pocket (a hand-assembled pocket-size device on Raspberry Pi 5, ~$499), pleeply One (~$299, compact models up to ~8B) or pleeply Pro (~$549, larger models up to ~32B). Prices and specs are planned and may change.

- **Categories:** Artificial Intelligence · Hardware · Smart Home · Privacy · Open Source
- **Tags:** local AI, offline AI, private AI, smart speaker, voice assistant, LLM, open models, smart home
- **Stage / pricing:** Pre-launch (waitlist) · free waitlist, expected $499 (Pocket) / $299 (One) / $549 (Pro)
- **Assets:** `press/icon-512.png` (иконка), `press/hero-1270x760.png` (скриншот), `press/og-1200x630.png` (обложка), Reels — `~/Downloads/pleeply-reel-sound.mp4`
- **Founder / contact / country / соцсети:** _заполнить_ — что показывать публично, решаешь ты.

## Короткие тексты для общих стартап-сабов

**r/RoastMyStartup** — *Roast my pre-launch: a speaker that runs AI locally, with a fake-door pricing page*
I'm testing demand for pleeply, a speaker with a computer inside that runs open AI models at home: private memory, no cloud. There's no product yet. The page has three price points and a refundable-deposit question, and I'm measuring who clicks what. Tear apart the landing, the pricing and the idea: LINK

**r/AlphaandBetausers** — *Looking for early testers: private AI speaker that works offline*
Building pleeply: local AI on a speaker, memory stays on the device. Looking for people who'd test early units or the software build on their own Mac mini/PC. Join the waitlist and tell me your setup: LINK

**r/buildinpublic** — *Day 1 of validating a hardware idea before building it*
Instead of building a prototype first, I put up a landing with three price tiers (software $99 / speaker $299 / pro $549) and a "would you put down a refundable $49 deposit?" question. Goal: 150 signups in 14 days, and at least half choosing hardware. I'll post the numbers. LINK

**r/SideProject** — *pleeply — your own AI that lives at home (pre-launch)*
A speaker with a computer inside: open models run locally, private memory, works offline. Waitlist + the version you'd buy: LINK

## Статус волны 2 (обновлено 22.10.2026)

| Каталог | Статус |
|---|---|
| Launching Next | ✅ отправлено (заявка №165600, бесплатно; апгрейд за $99 не брали) |
| Startups Gallery | ✅ отправлено (форма Tally, отбор вручную) |
| Startup Base, LaunchIgniter, Tiny Launch, PitchWall, Awesome Indie | 🔑 нужен вход (Google/GitHub/X) — входит Arnur, заполняет Claude |
| AI Collection | 🔑 нужен аккаунт; берут только работающие ИИ-инструменты — вернуться после демо |
| Netted (Webby Awards) | ✉️ только питч письмом на адрес редакции |
| Next Big What ($39/$79), All Top Startups, eBool ($47), TechPluto (Fast Track) | 💰 только платно — пропущено |
| StartUp Beat | ❌ форма на сайте сломана (виден код шорткода) |
| SnapMunk | ❌ формы для стартапа нет, только рассылка |
| Getworm, Website Hunt, 10words, Startup 88, Startup Buffer | ❌ страница не открывается или пустая |
