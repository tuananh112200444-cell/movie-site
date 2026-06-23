create table if not exists public.player_error_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  movie_slug text,
  movie_title text,
  episode_slug text,
  episode_name text,
  server_name text,
  event_type text not null,
  player_mode text,
  source_host text,
  playback_time numeric,
  duration numeric,
  buffered_ahead numeric,
  error_message text,
  user_agent text,
  page_url text,
  connection_type text,
  effective_type text,
  downlink numeric,
  device_memory numeric,
  hardware_concurrency integer,
  viewport_width integer,
  viewport_height integer,
  visibility_state text
);

alter table public.player_error_events
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists movie_slug text,
  add column if not exists movie_title text,
  add column if not exists episode_slug text,
  add column if not exists episode_name text,
  add column if not exists server_name text,
  add column if not exists event_type text,
  add column if not exists player_mode text,
  add column if not exists source_host text,
  add column if not exists playback_time numeric,
  add column if not exists duration numeric,
  add column if not exists buffered_ahead numeric,
  add column if not exists error_message text,
  add column if not exists user_agent text,
  add column if not exists page_url text,
  add column if not exists connection_type text,
  add column if not exists effective_type text,
  add column if not exists downlink numeric,
  add column if not exists device_memory numeric,
  add column if not exists hardware_concurrency integer,
  add column if not exists viewport_width integer,
  add column if not exists viewport_height integer,
  add column if not exists visibility_state text;

update public.player_error_events
set event_type = 'legacy_unknown'
where event_type is null;

alter table public.player_error_events
  alter column event_type set not null;

comment on table public.player_error_events is
  'Client-side diagnostics for player stalls, playback failures, stale cache recovery, and app load errors.';

alter table public.player_error_events enable row level security;

drop policy if exists "player_error_events_anon_insert" on public.player_error_events;
create policy "player_error_events_anon_insert"
on public.player_error_events
for insert
to anon, authenticated
with check (
  length(event_type) between 1 and 80
  and coalesce(length(error_message), 0) <= 1000
  and coalesce(length(page_url), 0) <= 1000
  and coalesce(length(user_agent), 0) <= 600
);

drop policy if exists "player_error_events_no_public_select" on public.player_error_events;
create policy "player_error_events_no_public_select"
on public.player_error_events
for select
to anon, authenticated
using (false);

grant insert on table public.player_error_events to anon, authenticated;
grant usage, select on sequence public.player_error_events_id_seq to anon, authenticated;

create index if not exists player_error_events_created_at_idx
  on public.player_error_events (created_at desc);

create index if not exists player_error_events_event_type_created_idx
  on public.player_error_events (event_type, created_at desc);

create index if not exists player_error_events_movie_slug_created_idx
  on public.player_error_events (movie_slug, created_at desc)
  where movie_slug is not null;

create index if not exists player_error_events_source_host_created_idx
  on public.player_error_events (source_host, created_at desc)
  where source_host is not null;
