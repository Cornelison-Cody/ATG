-- Proposed ATG production schema.
-- This is a starting point for the database + object-storage migration.

create table if not exists projects (
  id text primary key,
  name text not null,
  slug text not null unique,
  codex_thread_id text,
  status text not null check (status in ('active', 'deleted')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists chat_messages (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  status text not null check (status in ('done', 'error', 'running')),
  created_at timestamptz not null
);

create table if not exists game_files (
  project_id text not null references projects(id) on delete cascade,
  path text not null,
  storage_key text not null,
  content_type text not null default 'text/plain',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (project_id, path)
);

create index if not exists chat_messages_project_created_idx
  on chat_messages(project_id, created_at);
