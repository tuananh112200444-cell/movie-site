alter table public.streams
  add column if not exists health_status text not null default 'unchecked',
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists response_time_ms integer,
  add column if not exists failure_count integer not null default 0,
  add column if not exists last_error text not null default '';

create index if not exists idx_streams_health_queue
  on public.streams (is_active, last_checked_at nulls first, priority desc)
  where is_active = true;

create index if not exists idx_streams_health_status
  on public.streams (health_status, last_checked_at desc);

create index if not exists idx_streams_episode_best
  on public.streams (movie_id, episode_slug, is_active, priority desc, response_time_ms asc);
