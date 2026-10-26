# Запуск pleeply через Make

Схема:

```
Google Sheets (очередь постов)
  → Make, раз в час
  → Telegram, LinkedIn, Facebook, Instagram, Bluesky — напрямую
  → X и Threads — через Buffer
  → отметка «posted» в таблице
```

**Публикуется только строка со статусом `approved`, у которой наступило время `publish_at`.** Все 35 постов в [launch-queue.csv](launch-queue.csv) сейчас в статусе `draft`. Make их не тронет, пока ты сам не поставишь `approved`.

## Почему так

- **X.** Make закрыл встроенное приложение X в 2025 году. Сообщество Make советует постить в X через Buffer.
- **Threads.** Своего модуля в Make нет, поэтому тоже через Buffer.
- **Buffer.** Бесплатный тариф даёт 3 канала: два займут X и Threads.
- **Bluesky, Telegram, Facebook Pages, Instagram for Business, LinkedIn.** У Make есть свои модули.
- **Бесплатный Make.** 1 000 операций в месяц, интервал запуска не меньше 15 минут. Проверка раз в 15 минут съела бы около 2 900 операций, поэтому проверяем раз в час: около 720 операций плюс 3–4 на каждый пост.

## Что сделать тебе (аккаунты и входы — только ты)

1. **Make.com** — бесплатный аккаунт.
2. **Google Sheets** — новая таблица «pleeply launch»: «Файл → Импорт → launch-queue.csv», лист `queue`. Колонку `publish_at` оставь как есть: это время в UTC.
3. **Telegram:**
   - создай канал, например @pleeply;
   - у @BotFather создай бота и сохрани токен;
   - добавь бота администратором канала с правом публиковать.
4. **LinkedIn** — личный профиль. Для страницы компании модулю Make нужны права администратора страницы.
5. **Facebook и Instagram** — страница pleeply (личные профили Make не поддерживает) и Instagram в режиме Business или Creator, привязанный к этой странице.
6. **Bluesky** — аккаунт. Если включена двухфакторная защита, создай пароль приложения: Settings → Privacy & Security → App Passwords.
7. **Buffer** — бесплатный аккаунт, подключи X и Threads.

## Сценарий «pleeply · launch publisher»

**Расписание:** каждые 60 минут.

1. **Google Sheets → Search Rows.** Таблица «pleeply launch», лист `queue`, фильтр: `status` = `approved`.
2. **Фильтр после поиска:** `{{parseDate(publish_at; "YYYY-MM-DDTHH:mm:ssZ")}}` меньше или равно `{{now}}`.
3. **Router** — семь веток, у каждой фильтр по `platform`:

| platform | Модуль | Поля |
|---|---|---|
| `telegram` | Telegram Bot → Send a Text Message or a Reply | Chat ID: `@pleeply` (или числовой id канала), Text: `text` |
| `linkedin` | LinkedIn → Create a User Text Post | Content: `text` |
| `facebook` | Facebook Pages → Create a Post | Page: pleeply, Message: `text`, Link: `link` |
| `instagram` | Instagram for Business → Create a Photo Post | Photo URL: `image_url`, Caption: `text` |
| `bluesky` | Bluesky → Create a post | Text: `text` |
| `x` | Buffer → Create a Post | Channel: X, Text: `text`, публиковать сразу |
| `threads` | Buffer → Create a Post | Channel: Threads, Text: `text`, публиковать сразу |

4. **После публикации в каждой ветке — Google Sheets → Update a Row:** `status` = `posted`, `posted_at` = `{{now}}`, `post_url` = ссылка из ответа модуля, если она есть.
5. **Обработчик ошибок на модуле публикации:** Update a Row → `status` = `error`, `note` = `{{error.message}}`. Строка с ошибкой не уйдёт повторно, пока ты не вернёшь ей `approved`.

Названия модулей в интерфейсе Make могут немного отличаться — ищи по приложению и действию.

**Bluesky:** в обычном посте ссылка может не стать кликабельной. Проверь на первом посте. Если не стала, в модуле есть настройка facets для ссылки.

## Как запускать

1. **Тест.** Одной строке с `telegram` поставь `approved` и время в прошлом, затем нажми Run once. Проверь пост в канале и строку: там должно стать `posted`. Тестовый пост потом удали из канала.
2. **Включи сценарий** (переключатель ON).
3. **Накануне каждого дня** читаешь строки этого дня и меняешь `draft` на `approved`. Что не одобрено — не уходит.
4. **Время по умолчанию** — 14:00 UTC: это 19:00 в Алматы и 10:00 в Нью-Йорке. Можно сдвигать прямо в таблице.

## Календарь запуска

| День | Дата (UTC) | О чём | Куда ведёт |
|---|---|---|---|
| 1 | 28 окт, 14:00 | Открыли сообщество и гайд | /community |
| 2 | 29 окт, 14:00 | Цифры: языковые модели на Raspberry Pi 5 | /info/raspberry-pi-5-llm/ |
| 3 | 31 окт, 14:00 | Вопрос аудитории и голосование за функции | тема «What should pleeply do first?» |
| 4 | 2 ноя, 14:00 | Первый Local AI weekly от ИИ-помощника | /community/latest |
| 5 | 4 ноя, 14:00 | Founding member для первых 100 | /community/signup |

- **День 4** имеет смысл, только если ИИ-помощник уже работает (нужен ключ Claude API на Vercel), а дайджест вышел в понедельник утром.
- **День 5** обещает значок Founding member — одобряй его, только если согласен с этим бонусом.

Тексты для каждой площадки разные: X и Bluesky — коротко, LinkedIn — от первого лица основателя, Telegram — по-русски, Instagram — с картинкой и «Link in bio».

## Хайп без обмана

- **Каждый день — свой повод.** Не один и тот же текст везде.
- **Первые два часа после поста** отвечай на каждый комментарий: охват решается тогда.
- **Пост дня закрепляй** и в канале, и на форуме.
- **Founding member** — настоящий бонус для первых 100 участников.
- **Local AI weekly** по понедельникам — регулярный повод для поста.
- **Reddit, Hacker News, Хабр, vc.ru — только вручную** по [PROMO.md](../PROMO.md). Автопостинг там нарушает правила и ведёт к бану.
- **Никаких** накруток, фейковых пользователей и купленных подписчиков.

## Что смотреть

- **Заявки по площадкам:** таблица funnel, `utm_source` = x, threads, bluesky и т. д., `utm_campaign=launch`.
- **Переходы:** Vercel Analytics.
- **Форум:** `node --env-file=.env.local forum/admin.mjs users`.
