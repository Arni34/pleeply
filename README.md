# pleeply

Колонка со встроенным компьютером: открытые ИИ-модели работают на устройстве, личная память хранится дома, облако не нужно. Проект в разработке, сайт — https://pleeply.vercel.app

## Что где лежит

| Путь | Что это |
|---|---|
| `index.html`, `app.js` | Главная: лист ожидания, тексты EN/RU, варианты заголовка, события воронки |
| `assets/` | 3D Pocket (`pocket3d.js`, `pocket.glb`, three.js r170 в `vendor/`) и снимки `stills/` |
| `api/` | Функции Vercel: `community.js` — страницы форума, `forum.js` — действия, `bot.js` — ИИ-помощник и еженедельный дайджест, общее в `_lib/` |
| `forum/` | Схема базы Neon (`schema.sql`), миграция и админ-скрипт |
| `info-src/` | Исходники гайдов; `node info-src/build.mjs` собирает `info/`, `llms.txt`, `llms-full.txt`, `sitemap.xml` |
| `hardware/pocket/` | Корпус Pocket в OpenSCAD, STL, рендеры, смета `BOM.md`, экспорт модели для сайта |
| `archive/` | Прошлые версии главной и страница рендера снимков (`render-stills.html`) |
| `sheets-webhook.gs` | Apps Script для Google-таблицы с заявками |
| `launch/`, `outreach/`, `press/`, `*.md` | Планы запуска, тексты постов, гипотезы, картинки для прессы |

На сайт уходит не всё: что скрыто, перечислено в `.vercelignore`.

## Запуск у себя

Только статика (главная и гайды):

```bash
python3 -m http.server 4194
```

С форумом и ботом нужны переменные окружения из Vercel:

```bash
npx vercel env pull .env.local
npx vercel dev
```

## Выкладка

```bash
npx vercel deploy --prod --yes
```

Проект `pleeply` в `arni34s-projects`. Ключи живут только в Vercel и в репозиторий не попадают: `DATABASE_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`, а также необязательные `GROQ_MODEL`, `GEMINI_MODEL`, `BOT_DAILY_LIMIT`.
