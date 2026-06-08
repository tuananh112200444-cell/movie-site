create table if not exists public.sync_logs (
  id bigserial primary key,
  function_name text not null,
  run_at timestamptz not null default now(),
  scanned integer not null default 0,
  added integer not null default 0,
  skipped integer not null default 0,
  errors integer not null default 0,
  details jsonb not null default '[]'::jsonb,
  elapsed_ms integer not null default 0,
  success boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists sync_logs_function_run_idx
  on public.sync_logs (function_name, run_at desc);

alter table public.sync_logs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.sync_logs enable row level security;

drop policy if exists "Public can read sync logs" on public.sync_logs;

create table if not exists public.home_page_cache (
  id text primary key,
  sections jsonb not null default '{}'::jsonb,
  source text not null default 'unknown',
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()
);

create index if not exists home_page_cache_expires_idx
  on public.home_page_cache (expires_at);

alter table public.home_page_cache enable row level security;

drop policy if exists "Public can read homepage cache" on public.home_page_cache;
create policy "Public can read homepage cache"
  on public.home_page_cache
  for select
  using (true);

create table if not exists public.movie_api_cache (
  slug text primary key,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'unknown',
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists movie_api_cache_expires_idx
  on public.movie_api_cache (expires_at);

alter table public.movie_api_cache enable row level security;

drop policy if exists "Public can read movie api cache" on public.movie_api_cache;
create policy "Public can read movie api cache"
  on public.movie_api_cache
  for select
  using (true);

alter table public.movies
  add column if not exists last_synced_at timestamptz;

create index if not exists movies_last_synced_idx
  on public.movies (last_synced_at desc)
  where last_synced_at is not null;

create index if not exists movie_episodes_movie_source_number_idx
  on public.movie_episodes (movie_id, source, episode_number);
