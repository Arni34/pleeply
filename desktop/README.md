# pleeply Desktop

One AI ecosystem on your computer. Run models locally, connect to the cloud only when you choose.

This is the desktop app described on [pleeply.vercel.app](https://pleeply.vercel.app): Electron + llama.cpp (через node-llama-cpp), macOS / Windows / Linux.

## Что внутри (по пунктам сайта)

| На сайте | В приложении |
|---|---|
| **pleeply Chat** — один интерфейс для разных моделей, видно, где посчитан каждый ответ | Чат с выбором модели и режима Local / Cloud / Auto. Под каждым ответом: «Ran on this computer · nothing sent» или «Sent to Anthropic · you approved · N characters», модель, настройка, ток/с. «Answer again with…» — переключить модель в том же чате. |
| **pleeply Models** — найти, скачать, управлять; проверка по железу до скачивания | Каталог из 19 проверенных GGUF (Q4_K_M) с оценкой Fast / Good / Slower / Too large для этого компьютера; Installed (свои + Ollama + LM Studio); Discover — поиск GGUF на Hugging Face; Cloud — модели подключённых провайдеров. |
| **pleeply Control Center** — железо, производительность, приватность, модели | This computer, GPU acceleration, Memory for models, размер контекста, выгрузка модели, режим облачных запросов, журнал сетевой активности, модели для каждой настройки, ключи провайдеров, Ollama/LM Studio, хранилище и удаление данных. |
| **Hybrid AI: Local / Cloud / Auto** | Local — только этот компьютер. Cloud — облачные модели. Auto (по умолчанию) — pleeply сам выбирает модель и место под задачу и железо; облако только предлагается. |
| **Из коробки** | Сразу после установки pleeply сам скачивает две офлайн-модели, которые помещаются в память (на 8 ГБ — Gemma 3 4B и Qwen 3 1.7B, на 16 ГБ — Qwen 2.5 7B и Gemma 3 4B), а облачные модели работают без ключей через pleeply Cloud. |
| **Consent before cloud** | Перед облачным запросом окно: провайдер, модель, политика конфиденциальности и дословно всё, что уйдёт. «Ask me every time» / «Ask once per chat» / «Off». Можно отправить без истории или «Run locally instead». |
| **Model family** | Названия Saturn/Nova/Atlas/Orbit пока скрыты. Внутри остались профили задач: Auto сам берёт маленькую модель для коротких вопросов, большую — для текстов, длинный контекст и ссылки [1] — для документов. |
| **pleeply Agents** (later) | Агенты с шаблонами (Research digest, Folder report, Notes to action items, Web research brief). Работают только в выданной папке; запись файла, веб-страница, черновик письма и запись в Memory ждут подтверждения. |
| **pleeply Memory** (later) | Личный контекст на этом компьютере: добавить, изменить, удалить, «Suggest / Automatic / Off». Учится только локальной моделью; облаку не передаётся без отдельного переключателя. |
| **How it works: Download → hardware → choose a model** | Первый запуск: приветствие → «Let pleeply understand your hardware» → «Choose a model and start». |
| **Privacy: transparent handling** | Окно не ходит в сеть вообще (CSP `connect-src 'none'`); всё сетевое — в главном процессе и попадает в журнал Control Center → Privacy. Ключи шифруются системным хранилищем (Keychain). |

## Эргономика

Как в привычных чат-приложениях для компьютера: чаты по датам (Today, Yesterday, Previous 7 days…) и закреплённые сверху; у каждого чата меню «…» (Pin, Rename, Export, Delete); переименование двойным кликом или кликом по заголовку; правка своего сообщения с повторной отправкой; кнопка «вниз к последнему сообщению»; печать в любом месте чата переводит фокус в поле ввода; окно запоминает размер и положение.

| Действие | macOS | Windows / Linux |
|---|---|---|
| Новый чат | ⌘N | Ctrl+N |
| Поиск по чатам и действиям | ⌘K | Ctrl+K |
| Прикрепить файлы | ⌘O | Ctrl+O |
| Изменить последнее сообщение | ↑ в пустом поле | ↑ в пустом поле |
| Остановить ответ | Esc | Esc |
| Скопировать последний ответ | ⌘⇧C | Ctrl+Shift+C |
| Экспорт чата в Markdown | ⌘⇧E | Ctrl+Shift+E |
| Скрыть/показать боковое меню | ⌘B | Ctrl+B |
| Скрыть/показать «This computer» | ⌘I | Ctrl+I |
| Chat · Models · Agents · Memory · Control Center | ⌘1 … ⌘5 | Ctrl+1 … Ctrl+5 |
| Control Center | ⌘, | Ctrl+, |
| Список сочетаний | ⌘/ | Ctrl+/ |

На macOS те же команды есть в меню приложения (File, View, Go, Help).

## pleeply Cloud

Облачные модели без ключей у пользователя: приложение шлёт запросы на шлюз `https://pleeply.vercel.app/api/ai/v1` (код — `api/ai/` и `api/_lib/ai.js` в корне сайта), шлюз передаёт их провайдеру по ключам из переменных Vercel:

| Переменная | Что включает |
|---|---|
| `GROQ_API_KEY` | бесплатно: GPT-OSS 120B от OpenAI (уже работает) |
| `OPENROUTER_API_KEY` | один ключ на свежие Claude, GPT, Gemini и DeepSeek (платно, баланс в OpenRouter) |
| `ANTHROPIC_API_KEY` | Claude Opus 5.5 напрямую через SDK Anthropic, вместо OpenRouter |
| `GEMINI_API_KEY` | Gemini Flash напрямую, есть бесплатный уровень Google AI Studio |
| `DEEPSEEK_API_KEY` | DeepSeek напрямую |
| `AI_FREE_PER_DAY`, `AI_PAID_PER_DAY`, `AI_PAID_GLOBAL_PER_DAY` | лимиты: 60 бесплатных и 25 премиум-запросов в сутки на установку, 300 премиум на всех |
| `AI_MODEL_GPT`, `AI_MODEL_CLAUDE`, `AI_MODEL_GEMINI`, `AI_MODEL_DEEPSEEK` | зафиксировать конкретную модель OpenRouter вместо самой свежей |

Перед каждым облачным запросом окно согласия показывает, что запрос идёт через сервер pleeply к производителю модели. Шлюз не хранит текст — только счётчики запросов за день (таблица `ai_usage` в Neon). Своё облако можно отключить в Control Center → Cloud providers, свои ключи по-прежнему работают напрямую.

## Запуск

```bash
npm install
npm start
```

`npm install` скачивает Electron и готовую сборку llama.cpp под вашу платформу (Metal на Apple Silicon, CUDA/Vulkan/CPU на Windows и Linux) и копирует библиотеки интерфейса в `renderer/vendor`.

## Проверки

```bash
npm test
```

22 теста ядра: расчёт совместимости (пример с сайта — Apple M2 16 GB → 7–8B), выбор двух стартовых моделей, профили задач, Auto, согласие на облако (отклонённый запрос не уходит, одобренный — ровно то, что показано), pleeply Cloud (настоящий получатель в согласии, дневной лимит), документы, песочница агента и защита от записи по ссылкам и запросов в локальную сеть, поиск, закрепление и правка сообщений, шифрование ключей, Memory.

## Сборка

```bash
npm run pack:mac
```

Собирает `dist/mac-arm64/pleeply.app` без подписи. `npm run dist:mac` — DMG, `dist:win` / `dist:linux` — для других систем (собирать на соответствующей ОС). Для раздачи пользователям нужна подпись Apple Developer ID и нотаризация.

## Устройство

- `electron/main.js` — окно, IPC, системные диалоги; `electron/preload.cjs` — узкий мост в окно.
- `src/core/` — ядро без Electron: `index.js` (Core), `fit.js` (влезет ли модель), `presets.js`, `router.js` (Auto), `consent.js`, `docs.js` (Atlas, BM25), `agents.js`, `memory.js`, `providers.js` (ключи), `engines/` (llama.cpp, Ollama/LM Studio/OpenAI-совместимые, Gemini, Anthropic SDK).
- `renderer/` — интерфейс на Preact + htm без сборки.
- `src/core/catalog.json` — каталог моделей; обновить размеры с Hugging Face: `npm run catalog`.

Данные лежат в папке приложения (на macOS `~/Library/Application Support/pleeply`), модели — в её подпапке `models` (можно сменить в Control Center). Для тестов: `PLEEPLY_DATA_DIR=/путь npm start`.
