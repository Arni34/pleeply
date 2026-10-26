# Сообщество pleeply — свой форум на сайте, как у n8n

Форум живёт прямо на pleeply.vercel.app/community и устроен как community.n8n.io:
- главная с подборкой «Community highlights»;
- вкладки Latest, Categories и Top;
- таблица тем с аватарами, ответами и датой активности;
- категории;
- темы с ответами, лайками и жалобами;
- значок Team у команды;
- инструменты модератора.

Страницы собираются на сервере, поэтому темы видят Google и ИИ-поиск. Есть отдельная карта сайта: `/community/sitemap.xml`.

## Как устроено

- **Код.** Страницы — `api/community.js`, действия (вход, темы, ответы, лайки, жалобы, модерация) — `api/forum.js`, общее — `api/_lib/forum.js`. Адреса `/community/...` описаны в `vercel.json`.
- **База.** Neon Postgres, бесплатный тариф, Франкфурт, подключена к проекту pleeply в Vercel. Ключи лежат в `.env.local`: на сайт и в git они не попадают.
- **Аккаунты.** Имя и пароль, без почты. Пароли хранятся как scrypt-хэш. Сброса пароля по почте пока нет — так и написано на странице регистрации.
- **Защита.** Регистраций — не больше 5 в час с одной сети, входов — 20 попыток за 15 минут. Есть поле-ловушка для ботов. У новичков в первые сутки — не больше 2 ссылок на пост. Тем — 5 в день, ответов — 30 в час. Ссылки в постах получают `nofollow ugc`, HTML в постах не выполняется.

## Запуск

1. После деплоя ты сам регистрируешься на `/community/signup` под именем, которое увидят все. Имена admin, staff, pleeply* и подобные заняты под систему.
2. Пишешь мне это имя, и я делаю тебя админом:

```bash
node --env-file=.env.local forum/admin.mjs promote <имя>
```

3. Публикуешь первые темы (тексты ниже). Могу опубликовать их за тебя через встроенный браузер, если ты там войдёшь и скажешь «да» на каждую.

## Команды админа

Запускать из папки `pleeply`:

```bash
node --env-file=.env.local forum/admin.mjs users
```

- `users` — участники и число их постов;
- `promote` / `demote <имя>` — дать или снять права админа;
- `ban` / `unban <имя>` — заблокировать или разблокировать;
- `reports` — жалобы без решения;
- `cleanup-test` — удалить тестовые аккаунты `test_*`.

На самом форуме админ видит у постов кнопки «Hide» и «Ban author», а у темы — «Pin», «Close» и «Delete topic».

Схему базы пересоздаёт `forum/migrate.mjs`. Повторный запуск ничего не ломает.

## Категории

Категории уже созданы в базе (`forum/migrate.mjs`). Announcements — только для команды.

| Категория | Описание (вставить как есть) | Кто пишет |
|---|---|---|
| Announcements | News from the pleeply team: progress, test builds, reservations. | только команда |
| Questions | Running AI at home: models, hardware, voice, Home Assistant. | все |
| Ideas | What should pleeply do? One idea per topic — like ❤️ to vote. | все |
| Show & tell | Your local-AI setups: hardware, models, speeds, photos. | все |
| Models & benchmarks | Which model runs how fast on what. Post tokens per second with the model, quantization and runtime. | все |
| Smart home & voice | Wake words, speech-to-text, text-to-speech, Home Assistant, privacy. | все |
| General | Introductions and everything else. | все |

## Правила (раздел FAQ / Guidelines)

```
Be kind and stay on topic. No spam, no affiliate links.
If you work on a competing product, say so.
pleeply is in development: specs and prices on the site are plans, not promises.
Don't post personal data, yours or anyone else's.
```

## Первые темы — черновики

Их публикуешь ты от своего имени. Обещание «апдейт раз в неделю-две» в теме 1 — это твоё обязательство: если не готов, убери.

### 1. Announcements, закрепить — «Welcome to the pleeply Community»

```
Hi, I'm Arnur, the founder of pleeply.

pleeply is a speaker with a computer inside: it runs open AI models on the device, keeps a private memory of you at home and works without the cloud. We're in development and there's nothing to buy yet. This forum is where we'll build it in the open.

What this place is for:
- Questions about running AI at home: models, hardware, voice, Home Assistant. You don't need a pleeply for any of it.
- Ideas for what pleeply should do. The most-liked ideas shape what we build first.
- Show & tell, for your own local-AI setups.
- Models & benchmarks, with real numbers from real hardware.

What you can expect from us:
- an update in Announcements every week or two: progress, what we tested, what didn't work;
- straight answers about what's planned and what isn't. Specs and prices on the site are plans and may change;
- no spam.

Start by introducing yourself in "Introduce yourself" and tell us what you'd use a private home AI for.

Arnur
```

### 2. Ideas — «What should pleeply do first? Vote with ❤️»

```
We're deciding what pleeply should be great at on day one. These are the options from our waitlist form. Reply with the one you'd use every day, and like (❤️) the replies you agree with.

1. Private assistant: questions, timers, reminders, without the cloud
2. Notes & memory: "what did I say about…?"
3. Smart home: voice control of your devices
4. Kids & family: a safe assistant at home
5. Work & documents: summaries and drafts from your own files
6. Running my own models: a quiet box for open models

Something missing? Start a new topic in Ideas, one idea per topic.
```

### 3. Models & benchmarks — «Community benchmark: what runs how fast on your hardware?»

```
How fast do open models run on your hardware? Let's collect real numbers in one place.

Please reply with:
- Hardware (e.g. Raspberry Pi 5 8 GB, Mac mini 16 GB, RTX 3060 12 GB)
- Runtime and version (Ollama, llama.cpp, MLX…)
- Model and quantization (e.g. llama3.2:3b, Q4_K_M)
- Tokens per second for generation (and prompt processing, if you have it)
- Cooling and power notes

For reference, published Ollama results on a Raspberry Pi 5 are about 11 tokens/s for 1B models and about 5 for 3B models at Q4_K_M. Details and sources: https://pleeply.vercel.app/info/raspberry-pi-5-llm/

We'll keep the best numbers in a table in our docs and credit you by name if you want.
```

### 4. Show & tell — «Share your local AI setup»

```
Running a voice assistant, a model server or a private smart home? Show it.

- What hardware?
- Which models and runtime?
- What do you use it for every day?
- What was hardest to get working?
- A photo, if you like.
```

### 5. General — «Introduce yourself 👋»

```
Who are you and where are you from? What do you run at home today: Alexa, Google, Home Assistant, your own setup, or nothing yet? And what would you want a private home AI to do for you?
```

## После запуска

- **Лендинг.** В окно «You're on the list» после заявки — ссылка «Join the community».
- **Лист ожидания.** Письмо-приглашение — в `PROMO.md`. Отправка только после твоего «да».
- **Ритм.** Раз в неделю — апдейт в Announcements. На вопросы отвечаем в течение суток. Раз в неделю — тема-вопрос от команды.
- **Раздел /info.** В конце каждой статьи стоит блок «Join the community», в меню и подвале — ссылка Community. Их включает `communityUrl: "/community"` в `info-src/site.json`.
