alter table public.player_error_events
  add column if not exists playback_session_id text;

create index if not exists idx_player_error_events_session_created
  on public.player_error_events (playback_session_id, created_at desc)
  where playback_session_id is not null;

comment on column public.player_error_events.playback_session_id is
  'Random per-tab playback session identifier used only to deduplicate player health events.';
