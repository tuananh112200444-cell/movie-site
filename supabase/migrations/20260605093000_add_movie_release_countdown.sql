alter table public.movies
  add column if not exists release_at timestamptz,
  add column if not exists next_episode_at timestamptz,
  add column if not exists next_episode_name text,
  add column if not exists schedule_note text;

create index if not exists movies_release_at_idx
  on public.movies (release_at)
  where release_at is not null;

create index if not exists movies_next_episode_at_idx
  on public.movies (next_episode_at)
  where next_episode_at is not null;
