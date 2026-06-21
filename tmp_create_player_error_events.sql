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
  page_url text
);

alter table public.player_error_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'player_error_events'
      and policyname = 'Allow anon player error inserts'
  ) then
    create policy "Allow anon player error inserts"
    on public.player_error_events
    for insert
    to anon, authenticated
    with check (true);
  end if;
end $$;

grant insert on public.player_error_events to anon, authenticated;
grant usage, select on sequence public.player_error_events_id_seq to anon, authenticated;

create index if not exists player_error_events_created_at_idx
  on public.player_error_events (created_at desc);

create index if not exists player_error_events_movie_slug_idx
  on public.player_error_events (movie_slug, created_at desc);

create index if not exists player_error_events_event_type_idx
  on public.player_error_events (event_type, created_at desc);
