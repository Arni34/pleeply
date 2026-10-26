# pleeply — продвижение по максимуму (волна 3)

Обновлено 24.10.2026. Этот план дополняет [LAUNCH_PLAN.md](LAUNCH_PLAN.md) (волны 1–2: Reddit, HN, каталоги) и [POSTS.md](POSTS.md) (тексты для Reddit, HN, X, LinkedIn, Product Hunt, Telegram, рекламы) и их не повторяет.

## Логика

**Хаб — сайт.** На нём три части: `/info` с пользой и цифрами, `/community` с людьми и лист ожидания, который показывает спрос.

**Каналы — там, где спрашивают про локальный ИИ.** Туда несём то, чего нет у других: таблицы с цифрами, сравнения, настройки. Ссылаемся на страницы `/info` и зовём на форум. Прямой рекламы — один пост из десяти: так требуют правила Reddit, и так это работает.

**Скиллы Claude Code** (подход из гайда edgelab) уже установлены, новые ставить не нужно:

| Скилл | Для чего |
|---|---|
| `copywriting`, `social` | тексты постов (по ним написаны тексты ниже) |
| `seo-audit`, `ai-seo` | сайт и `/info` под Google и ИИ-поиск |
| `community-marketing` | форум |
| `public-relations` | пресса и блогеры |
| `directory-submissions` | каталоги |
| `launch` | Product Hunt, когда будет демо |

**Что уже сделано:**
- Ask HN — 19.10;
- очередь Reddit — в POSTS.md;
- часть каталогов волны 2;
- черновик письма Raspberry Pi;
- раздел `/info` на проде — 24.10.

## Правила, чтобы не сжечь площадки

- Всегда пишем, что ты основатель pleeply. Без фейковых аккаунтов, накруток и «случайных» отзывов.
- Не больше одного поста в одном сабреддите за две недели. Перед постом читаем правила саба.
- На каждый комментарий отвечаем в течение суток. Первые часы решают охват.
- Ссылки — с меткой `utm_source=<площадка>&utm_medium=social|forum|email|pr&utm_campaign=wave3`.
- Платное и все публикации — только после твоего «да» на каждую.

## Автопостинг через Make

Запуск в X, Threads, Bluesky, LinkedIn, Facebook, Instagram и Telegram идёт из таблицы через Make, только после пометки `approved` у каждого поста. Инструкция — [launch/MAKE_SETUP.md](launch/MAKE_SETUP.md), очередь из 35 постов — [launch/launch-queue.csv](launch/launch-queue.csv). Reddit, HN, Хабр и vc.ru — только вручную, по текстам ниже.

## Каналы волны 3

| # | Площадка | Что несём | Метка `utm_source` | Кто |
|---|---|---|---|---|
| 1 | r/LocalLLaMA | Таблица скоростей моделей на Pi 5 | `reddit_localllama` | ты публикуешь, я готовлю |
| 2 | r/homeassistant | Настройки Assist + Ollama | `reddit_ha` | ты |
| 3 | r/selfhosted | Сравнение приватных ассистентов | `reddit_selfhosted` | ты |
| 4 | Форум Home Assistant | Тот же разбор настроек, в разделе про голос | `ha_forum` | ты |
| 5 | X, тред | Alexa и что работает локально | `x` | ты |
| 6 | LinkedIn | Пост основателя | `linkedin` | ты |
| 7 | Хабр (RU) | Длинная статья с цифрами | `habr` | я пишу, ты публикуешь |
| 8 | vc.ru (RU) | Build in public: неделя проверки спроса | `vcru` | я пишу после цифр |
| 9 | Пресса и блогеры | Питч: цифры + комментарий основателя | `pr_<имя>` | я готовлю письма, ты отправляешь |
| 10 | Лист ожидания | Приглашение на форум | `email_waitlist` | ты отправляешь |
| 11 | Telegram-каналы (RU/KZ) | Письмо админам | `tg_<канал>` | ты |
| 12 | Каталоги с входом | Startup Base, LaunchIgniter, Tiny Launch, PitchWall, Awesome Indie | `<slug>` | ты входишь, я заполняю |

Product Hunt, Show HN и AlternativeTo — после демо или прототипа, как и записано в LAUNCH_PLAN.md.

## Готовые тексты

### 1. r/LocalLLaMA

**Title:** Measured tokens/s for 1–3B models on a Raspberry Pi 5 (Ollama, Q4_K_M), and where the time goes in a voice pipeline

```
I've been collecting numbers for a local voice assistant and put them in one table with sources, because the Pi 5 figures floating around vary a lot.

Generation speed with Ollama on a Pi 5, Q4_K_M (Stratosphere Linux IPS benchmarks):

| Model | tok/s |
|---|---|
| Gemma 3 1B | 11.5 |
| Llama 3.2 1B | 11.2 |
| Qwen 2.5 1.5B | 10.0 |
| SmolLM2 1.7B | 8.2 |
| Granite 3.1 2B | 5.8 |
| Qwen 2.5 3B | 5.2 |
| Llama 3.2 3B | 4.7 |

7B on the 16 GB board is reported at 1.5 to 2.5 tok/s. Whisper small (int8) takes about 2 to 4 seconds per sentence and Piper runs faster than real time, so for a short spoken answer the LLM step dominates and a full request lands around 5 to 8 seconds.

Two things I didn't expect. Independent tests found the Hailo AI HAT doesn't speed up token generation, and without active cooling the Pi throttles enough to roughly halve throughput.

Write-up with all sources: https://pleeply.vercel.app/info/raspberry-pi-5-llm/?utm_source=reddit_localllama&utm_medium=social&utm_campaign=wave3

Disclosure: I'm building pleeply, a speaker that runs models locally, so these numbers matter to me. If you've measured something different on a Pi 5 (llama.cpp builds, other runtimes, overclocking), I'd like to add it to the table and credit you.
```

### 2. r/homeassistant

**Title:** Summary: what to set when you plug a local Ollama model into Assist

```
I went through the Ollama integration docs and a few build logs and wrote down the settings that keep coming up, in case it saves someone an evening.

If you want the model to control devices, it has to support tool calling. Smaller models make more mistakes, and the docs recommend exposing fewer than 25 entities.

Home Assistant sets the context window to 8k by default, above Ollama's own 2k. Bigger homes need more, which costs RAM. Keep alive keeps the model loaded between requests; unloading it adds seconds to every reply.

Plain commands like "turn off the kitchen lights" can go through Assist's own intent matching, so only open questions hit the LLM. The docs also suggest two Ollama agents on the same model: one for conversation without device control, one with control for commands.

The Voice Preview Edition is a satellite. Speech and the model run on your server, locally or through HA Cloud.

Longer version with sources: https://pleeply.vercel.app/info/home-assistant-local-llm/?utm_source=reddit_ha&utm_medium=social&utm_campaign=wave3

Disclosure: I'm working on pleeply, a local AI speaker. If you run this daily and something here is wrong, tell me and I'll fix the page.
```

### 3. r/selfhosted

**Title:** Comparison: voice assistants that don't send your audio to the cloud (2026)

```
Since March 28, 2025, Echo devices send every request to Amazon's cloud; the "Do Not Send Voice Recordings" option was removed. I put together the private options I could find, with costs.

| Option | Where audio is processed | Upfront | Ongoing |
|---|---|---|---|
| Home Assistant Voice PE + Whisper, Piper, Ollama | your server | $59 + a server | none |
| OpenVoiceOS | your device | Pi + mic + speaker | none |
| DIY Pi 5 (Whisper + Ollama + Piper) | your device | Pi 5 + mic + speaker | none |
| Alexa+ (for reference) | Amazon's cloud | an Echo | $19.99/mo or Prime |

The table and sources: https://pleeply.vercel.app/info/alexa-alternatives/?utm_source=reddit_selfhosted&utm_medium=social&utm_campaign=wave3

Disclosure: I'm building pleeply, a local AI speaker, which is why I went down this hole. Which options did I miss?
```

### 4. Форум Home Assistant

Раздел про голосовых ассистентов (точное название раздела проверить перед публикацией). Текст — как в r/homeassistant. Ссылку ставим одну, с меткой `utm_source=ha_forum`.

### 5. X — тред

Ссылку ставим ответом на последний твит: X режет охват постов с внешними ссылками.

```
1/ Since March 28, 2025, no Echo can keep your voice requests on the device. Amazon removed the last local option ahead of Alexa+. So what can run a voice assistant at home, offline? Numbers below.

2/ A local assistant is four programs on one machine: a wake word model, Whisper for speech-to-text, an open model like Llama, Qwen or Gemma, and Piper to speak the answer.

3/ A Raspberry Pi 5 does about 11 tokens/s on 1B models and about 5 on 3B (Ollama, Q4_K_M). Fine for timers and short answers. Expect 5 to 8 seconds per request.

4/ For models that hold a real conversation (7 to 8B) you need about 16 GB of memory. An Apple Silicon Mac mini or a PC with a 12 GB GPU handles it.

5/ Already on Home Assistant? The Ollama integration plus the $59 Voice Preview Edition is the strongest local setup today. Use a tool-calling model and expose fewer than 25 entities.

6/ I wrote all of this up with sources, and we're building pleeply, a speaker that does it out of the box. Link below.

reply: https://pleeply.vercel.app/info/?utm_source=x&utm_medium=social&utm_campaign=wave3
```

### 6. LinkedIn — пост основателя

Ссылку ставим в первый комментарий.

```
In March 2025 Amazon switched off the last setting that let an Echo handle your voice inside your home. Every request now goes to its cloud, ahead of the paid Alexa+.

I'm building pleeply, a speaker with a small computer inside that runs open AI models on the device and keeps its memory at home. Before soldering anything, we wanted to know what home hardware can really do, so we wrote it down with sources.

A few numbers changed how we think about the product. A Raspberry Pi 5 generates about 11 tokens per second with a 1B model and about 5 with a 3B model, which means 5 to 8 seconds for a spoken answer. Models that hold a real conversation start around 7 to 8 billion parameters and need about 16 GB of memory. The software for a private assistant already exists; the hard part is fitting enough memory and cooling into a speaker at a fair price.

We published everything as an open guide (link in the first comment) and opened a forum for people running AI at home.

If you've replaced a cloud assistant with something local, what made you switch, and what still annoys you?
```

### 7. Хабр — статья (RU)

**Заголовок:** «Голосовой ассистент без облака в 2026: что реально тянут Raspberry Pi 5, Mac mini и Jetson»

**Хабы:** Умный дом, Искусственный интеллект, DIY или Сделай сам. Если о продукте больше абзаца — добавить хаб «Я пиарюсь». Первую статью нового аккаунта проверяют модераторы (песочница), поэтому заложи 1–3 дня.

**План:**
1. Что случилось 28 марта 2025: Echo больше не обрабатывает голос локально.
2. Из чего состоит локальный ассистент: wake word → Whisper → модель → Piper.
3. Таблица скоростей на Pi 5 (из `/info/raspberry-pi-5-llm`).
4. Где теряется время: шаг за шагом, 5–8 секунд на запрос.
5. Сколько памяти нужно: 8 / 16 / 24+ ГБ.
6. Home Assistant + Ollama: настройки, которые важны.
7. Что выбрать: таблица железа.
8. Что строим мы и зачем — один абзац, ссылка на форум.

**Лид:**

```
28 марта 2025 года Amazon отключил последнюю настройку, которая позволяла колонкам Echo обрабатывать голос дома. Теперь каждая просьба уходит в облако. Мы собираем колонку, которая работает наоборот, и прежде чем паять, выяснили, что на самом деле тянет домашнее железо. В статье — замеры из открытых источников, узкие места голосового конвейера и таблица: какое железо под какую модель.
```

### 8. vc.ru — build in public (RU)

Пишем, когда в таблице будут цифры за неделю. Без цифр пост пустой.

**Заголовок:** «Проверяю спрос на ИИ-колонку до того, как паять плату: что показала неделя»

**Скелет:**
- зачем fake door;
- три цены и вопрос про залог $49;
- [цифры из таблицы funnel: визиты, заявки, доля «железо», ответы про залог];
- что удивило;
- что дальше.

Гипотезы и пороги берём из VALIDATION.md, задним числом их не двигаем.

### 9. Пресса и блогеры

Сейчас мы питчим не продукт (его ещё нет), а цифры и комментарий основателя на тему «Alexa больше не работает локально». Предложение прислать прототип — когда он будет.

**Кому.** Контакты нужно проверить на их сайтах. Адреса я не выдумываю.

| Кто | Почему | Контакт |
|---|---|---|
| Hackster.io | Новости про Pi и edge AI | форма News tips на сайте |
| CNX Software | Пишут про Voice PE, Pi, edge AI | форма Contact на сайте |
| Liliputing | Мини-ПК и железо | форма Tips |
| Jeff Geerling (YouTube) | Pi 5 и замеры локальных LLM | контакт на jeffgeerling.com |
| Digital Spaceport (YouTube) | Железо под локальный ИИ | описание канала |
| Everything Smart Home (YouTube) | Home Assistant и голос | описание канала |
| Digital Business, Profit.kz, Kursiv (KZ) | Казахстанский стартап в железе и ИИ | почта редакций на сайтах |

**Письмо (EN):**

```
Subject: Local voice assistant numbers: Pi 5, Mac mini, Jetson (sources inside)

Hi [name],

Since March 28, 2025, no Echo can keep voice requests on the device. I've spent the last weeks measuring what home hardware can do instead, for a speaker we're building that runs AI models locally.

A few numbers from public benchmarks we compiled: a Raspberry Pi 5 generates about 11 tokens/s with 1B models and about 5 with 3B, which puts a spoken answer at 5 to 8 seconds. Models good enough for conversation need about 16 GB of memory. Everything is written up with sources here: https://pleeply.vercel.app/info/?utm_source=pr_[name]&utm_medium=pr&utm_campaign=wave3

If you're covering voice assistant privacy or local AI, I'm happy to comment or share our data as we go. When we have prototypes, I'd be glad to send one.

Arnur
Founder, pleeply
```

**Для казахстанских СМИ (RU):**

```
Тема: Казахстанский стартап собирает ИИ-колонку, которая работает без облака

Здравствуйте, [имя]!

Меня зовут Арнур, я основатель pleeply. Мы делаем колонку со встроенным компьютером: открытые ИИ-модели работают прямо на устройстве, память о владельце хранится дома, интернет не обязателен. Сейчас мы проверяем спрос до производства: сайт с листом ожидания запущен в октябре.

Могу рассказать, как проверять спрос на «железо» без прототипа, и поделиться цифрами, когда закончится тест. Подробнее: https://pleeply.vercel.app/?utm_source=pr_[издание]&utm_medium=pr&utm_campaign=wave3

Арнур, pleeply
```

### 10. Письмо листу ожидания

Отправляем после запуска форума. Список — в таблице waitlist.

```
Subject: You're on the pleeply list. Come help us build it

Hi,

Thanks for joining the pleeply waitlist. We're still in development, and we'd rather build this with the people who'll use it.

We just opened the pleeply Community: [forum link]. It's a forum for running AI at home, whether that's local models, voice assistants or a private smart home. The first thing we're asking there is which use matters most to you, and the answers will decide what pleeply does first.

We also published an open guide on running a private assistant at home: https://pleeply.vercel.app/info/?utm_source=email_waitlist&utm_medium=email&utm_campaign=wave3

Arnur
Founder, pleeply
```

### 11. Админам Telegram-каналов (RU/KZ)

Выбираем 5 каналов про ИИ, умный дом или технологии в Казахстане и СНГ: у которых живые комментарии и посты не одной рекламой. Платное размещение — только с твоего «да».

```
Здравствуйте! Я Арнур, основатель pleeply. Мы делаем колонку, в которой ИИ работает прямо на устройстве, без облака. Собрали открытый гайд с цифрами: что тянут Raspberry Pi 5, Mac mini и Home Assistant для голосового ассистента без интернета (https://pleeply.vercel.app/info/). Если тема подходит вашим читателям, буду рад, если упомянете. Могу написать короткий пост под ваш формат или ответить на вопросы в комментариях.
```

## Календарь на 14 дней (Д0 — день запуска форума)

| День | Что | Кто |
|---|---|---|
| Д0 | Форум создан, категории и 5 первых тем; /community на прод | ты создаёшь, я настраиваю |
| Д1 | Письмо листу ожидания; тред в X | ты отправляешь |
| Д2 | r/LocalLLaMA | ты |
| Д3 | LinkedIn; 5 каталогов с входом | ты входишь, я заполняю |
| Д4 | r/homeassistant + форум HA | ты |
| Д5 | Хабр: финальный текст | я |
| Д6 | r/selfhosted | ты |
| Д7 | Апдейт №1 в Announcements; сверка цифр | ты пишешь, я свожу цифры |
| Д8 | Хабр: публикация | ты |
| Д9 | Ответы в темах форума; бенчмарки участников → таблица в /info | я |
| Д10 | vc.ru (если есть цифры) | ты |
| Д11 | Питчи: 5 СМИ и блогеров | ты отправляешь |
| Д12 | 5 Telegram-каналов | ты |
| Д13 | Повторная проверка, как ИИ-поиск отвечает на запросы из `info-src/queries.json` | я |
| Д14 | Итоги против порогов VALIDATION.md, решение по следующей волне | вместе |

## Что мерить и где

| Что | Где |
|---|---|
| Заявки по источникам | таблица Google Sheets, лист funnel (по `utm_source`) |
| Визиты /info и /community, рефереры (reddit.com, chatgpt.com, perplexity.ai) | Vercel Analytics (работает после Enable в дашборде) |
| Участники и темы форума | Admin форума, `/about.json` |
| Цитирует ли ИИ pleeply | вопросы из `info-src/queries.json` по 3 раза в ChatGPT, Perplexity, Gemini; позже — n8n |

Цели не придумываю: решение принимаем по порогам H1–H7 из VALIDATION.md.
