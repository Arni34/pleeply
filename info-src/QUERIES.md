# Какие запросы ИИ обрабатывает по теме pleeply

Карта на 24.10.2026. Машиночитаемая версия — [`queries.json`](queries.json): её будет читать n8n.

## Как ИИ отвечает на вопрос

ChatGPT, Perplexity, Gemini и Google AI Overviews не ищут ровно то, что набрал человек. Модель разбивает вопрос на 3–10 фоновых поисков (fan-out), собирает страницы по каждому и цитирует те, где ответ легко вынуть: первый абзац с прямым ответом, таблица, FAQ, цифры с источником и дата обновления. После обновления ChatGPT 5.6 (август 2026) среди его фоновых запросов стало больше `site:` и «official»: он чаще идёт за первоисточником, а не за подборками «топ-10».

Отсюда два вывода для pleeply:

1. Нужен раздел, который полностью закрывает тему, а не по одной странице на ключевое слово. Именно его и сделали: `/info`.
2. Нужна официальная страница о самом продукте (`/info/pleeply/`) и `llms.txt`, чтобы на запросы «pleeply official» и `site:pleeply.vercel.app` находился честный ответ: продукт в разработке, цены ожидаемые.

## Кластеры

Колонка «Фоновые поиски» — смоделированные запросы. Их собрали из реальных вопросов в обсуждениях, обзорах и документации 24.10.2026. Это гипотеза, её стоит сверить с настоящими поисками ChatGPT (см. ниже).

| Кластер | Как спрашивают | Фоновые поиски ИИ | Стадия | Страница |
|---|---|---|---|---|
| Приватность колонок | «Does Alexa record everything I say?», «Is there a smart speaker that doesn't send my voice to the cloud?» | alexa do not send voice recordings removed march 2025; alexa+ cloud processing; smart speaker local processing offline | знает о проблеме | `/info/smart-speaker-privacy/` |
| Что такое локальный ИИ | «What is a local AI assistant?», «ChatGPT at home without the cloud?» | on-device llm vs cloud; open-weight models run locally; private ai memory stored locally | ищет решение | `/info/local-ai-assistant/` |
| Как устроен голос | «How does an offline voice assistant work?», «Why are local assistants slow?» | openwakeword; whisper raspberry pi; piper tts; local voice assistant latency | ищет решение | `/info/how-local-voice-assistants-work/` |
| Железо | «What hardware do I need to run AI at home?», «Pi vs Jetson vs Mac mini» | jetson orin nano super tokens/s; mac mini 16gb llm; rtx 3060 local llm | ищет решение | `/info/run-ai-at-home/` |
| Raspberry Pi 5 | «Can a Raspberry Pi 5 run an LLM?», «best LLM for Pi 5» | pi 5 ollama tokens per second llama 3.2 3b; active cooler throttling; hailo ai hat llm | ищет решение | `/info/raspberry-pi-5-llm/` |
| Home Assistant | «local LLM with Home Assistant», «HA voice without internet» | home assistant ollama integration; assist pipeline whisper piper; voice preview edition local | ищет решение | `/info/home-assistant-local-llm/` |
| Память (RAM) | «How much RAM for a local LLM?», «Can 8GB run Llama?» | 7b q4 memory gb; q4_k_m explained; context window ram | ищет решение | `/info/local-llm-memory/` |
| Альтернативы Alexa | «private alternative to Alexa», «Alexa alternative without subscription» | alexa+ price without prime; gemini for home price; open source alexa alternative; local ai speaker | сравнивает | `/info/alexa-alternatives/` |
| Open-source ассистенты | «best open-source voice assistant», «Is Mycroft still alive?» | openvoiceos vs mycroft; rhasspy vs assist; wyoming protocol | сравнивает | `/info/open-source-voice-assistants/` |
| Сам pleeply | «What is pleeply?», «pleeply price», «does pleeply work offline» | pleeply official site; site:pleeply.vercel.app; pleeply release date price | знает о продукте | `/info/pleeply/` |

## Кого ИИ цитирует сейчас

Это источники, которые чаще всего находились по этим вопросам. Это кандидаты на упоминание pleeply (без накруток, только настоящее участие):

- home-assistant.io (документация и блог), community.home-assistant.io;
- Reddit: r/homeassistant, r/LocalLLaMA, r/selfhosted;
- блоги с замерами: raspberry.tips, bestllmfor.com, computingforgeeks.com, cnx-software.com, hackster.io;
- новости о приватности: techcrunch.com, androidauthority.com, techradar.com.

## Как увидеть настоящие фоновые поиски ChatGPT

1. Задайте в ChatGPT (с поиском) вопрос из таблицы.
2. Откройте DevTools → Network и обновите страницу диалога.
3. В ответе с данными диалога найдите поле `queries`: там лежат дословные фоновые поиски.
4. Перенесите их в `fanout` нужного кластера в `queries.json`.

Используйте это, чтобы понять, какие темы не закрыты. Не используйте это, чтобы штамповать по статье на каждый запрос: ChatGPT 5.6 и политика Google против массового контента понижают именно такие сайты.

## Как мерить

Ответы ИИ каждый раз разные, поэтому один прогон ничего не доказывает. Каждый вопрос нужно задать 3–5 раз в каждом движке и записать долю, например «pleeply процитирован 2 из 5». Сравнивать нужно доли по неделям.
