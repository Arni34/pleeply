-- Схема форума pleeply (Neon Postgres). Применяет forum/migrate.mjs, повторный запуск безопасен.

create table if not exists forum_users (
  id serial primary key,
  username text not null,
  password_hash text not null,
  role text not null default 'member' check (role in ('member', 'admin', 'banned', 'bot')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create unique index if not exists forum_users_username_key on forum_users (lower(username));

create table if not exists forum_sessions (
  token_hash text primary key,
  user_id int not null references forum_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists forum_sessions_user on forum_sessions (user_id);

create table if not exists forum_categories (
  id serial primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  color text not null default '75a24c',
  position int not null default 0,
  staff_only boolean not null default false
);

create table if not exists forum_topics (
  id serial primary key,
  category_id int not null references forum_categories(id),
  user_id int not null references forum_users(id) on delete cascade,
  title text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  last_posted_at timestamptz not null default now(),
  last_poster_id int references forum_users(id) on delete set null,
  posts_count int not null default 1,
  likes_count int not null default 0,
  pinned boolean not null default false,
  closed boolean not null default false,
  hidden boolean not null default false
);
create index if not exists forum_topics_last on forum_topics (last_posted_at desc);
create index if not exists forum_topics_category on forum_topics (category_id);

create table if not exists forum_posts (
  id serial primary key,
  topic_id int not null references forum_topics(id) on delete cascade,
  user_id int not null references forum_users(id) on delete cascade,
  post_number int not null,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  hidden boolean not null default false,
  likes_count int not null default 0
);
create index if not exists forum_posts_topic on forum_posts (topic_id, post_number);

create table if not exists forum_likes (
  post_id int not null references forum_posts(id) on delete cascade,
  user_id int not null references forum_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists forum_reports (
  id serial primary key,
  post_id int not null references forum_posts(id) on delete cascade,
  user_id int not null references forum_users(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  unique (post_id, user_id)
);

-- Счётчики для ограничения частоты (вход, регистрация, посты). Ключ содержит хэш IP, сам IP не хранится.
create table if not exists forum_rate (
  key text primary key,
  hits int not null,
  window_start timestamptz not null
);
