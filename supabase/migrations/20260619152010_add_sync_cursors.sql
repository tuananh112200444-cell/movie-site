create table if not exists public.sync_cursors (
  key text primary key,
  page integer not null default 1 check (page > 0),
  updated_at timestamptz not null default now()
);

alter table public.sync_cursors enable row level security;
