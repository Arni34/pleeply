# pleeply Desktop

One AI ecosystem on your computer. Run models locally, connect to the cloud only when you choose.

This is the desktop app described on [pleeply.vercel.app](https://pleeply.vercel.app): Electron + llama.cpp (через node-llama-cpp), macOS / Windows / Linux.

## Что внутри (по пунктам сайта)

| На сайте | В приложении |
|---|---|
| **pleeply Chat** — один интерфейс для разных моделей, видно, где посчитан каждый ответ | Чат с выбором модели и режима Local / Cloud / Auto. Под каждым ответом: «Ran on this computer · nothing sent» или «Sent to Anthropic · you approved · N characters», модель, настройка, ток/с. «Answer again with…» — переключить модель в том же чате. |
| **pleeply Models** — найти, скачать, управлять; проверка по железу до скачивания | Каталог из 19 проверенных GGUF (Q4_K_M) с оценкой Fast / Good / Slower / Too large для этого компьютера; Installed (свои + Ollama + LM Studio); Discover — поиск GGUF на Hugging Face; Cloud — модели подключённых провайдеров. |
| **pleeply Control Center** — железо, производительность, приватность, модели | This computer, GPU acceleration, Memory for models, размер контекста, выгрузка модели, режим облачных запросов, журнал сетевой активности, модели для каждой настройки, ключи провайдеров, Ollama/LM Studio, хранилище и удаление данных. |
| **Hybrid AI: Local / Cloud / Auto** | Local — только этот компьютер. Cloud — провайдер по вашему ключу. Auto — pleeply сам выбирает настройку и место под задачу и железо; облако только предлагается. |
| **Consent before cloud** | Перед облачным запросом окно: провайдер, модель, политика конфиденциальности и дословно всё, что уйдёт. «Ask me every time» / «Ask once per chat» / «Off». Можно отправить без истории или «Run locally instead». |
| **Model family: Saturn 3.0, Nova, Atlas, Orbit** | Готовые настройки поверх открытых моделей (не обученные с нуля): Saturn — универсальная, Nova — быстрая и короткая, Atlas — документы с цитатами [1], Orbit — планы и агенты. Каждая сама берёт подходящую установленную модель. |
| **pleeply Agents** (later) | Агенты с шаблонами (Research digest, Folder report, Notes to action items, Web research brief). Работают только в выданной папке; запись файла, веб-страница, черновик письма и запись в Memory ждут подтверждения. |
| **pleeply Memory** (later) | Личный контекст на этом компьютере: добавить, изменить, удалить, «Suggest / Automatic / Off». Учится только локальной моделью; облаку не передаётся без отдельного переключателя. |
| **How it works: Download → hardware → choose a model** | Первый запуск: приветствие → «Let pleeply understand your hardware» → «Choose a model and start». |
| **Privacy: transparent handling** | Окно не ходит в сеть вообще (CSP `connect-src 'none'`); всё сетевое — в главном процессе и попадает в журнал Control Center → Privacy. Ключи шифруются системным хранилищем (Keychain). |

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

17 тестов ядра: расчёт совместимости (пример с сайта — Apple M2 16 GB → 7–8B), выбор моделей для Saturn/Nova/Atlas/Orbit, Auto, согласие на облако (отклонённый запрос не уходит, одобренный — ровно то, что показано), Atlas, песочница агента, шифрование ключей, Memory.

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
