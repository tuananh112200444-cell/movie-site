-- BLVietsub labels such as Pilot, 09 Extra and Tập Đặc Biệt were previously
-- collapsed to ordinary positive episode numbers. Reclassify only rows whose
-- source server retained an explicit special suffix. Negative identifiers are
-- the existing provider-neutral convention already used by GLVietsub.
with candidates as (
  select
    episode.id,
    episode.movie_id,
    episode.episode_number as old_episode_number,
    case
      when episode.server_name ~* '\mextra\M\s*$'
        then -(2000 + greatest(1, episode.episode_number))
      when episode.server_name ~* '\mpilot\M(?:\s+pilot)?\s*$'
        then -3001
      else -1001
    end as new_episode_number,
    case
      when episode.server_name ~* '\mextra\M\s*$'
        then format('Tập %s Extra', greatest(1, episode.episode_number))
      when episode.server_name ~* '\mpilot\M(?:\s+pilot)?\s*$'
        then 'Pilot'
      else 'Tập Đặc Biệt'
    end as new_episode_name,
    case
      when episode.server_name ~* '\mextra\M\s*$'
        then format('tap-extra-%s', greatest(1, episode.episode_number))
      when episode.server_name ~* '\mpilot\M(?:\s+pilot)?\s*$'
        then 'pilot'
      else 'tap-dac-biet'
    end as new_slug
  from public.movie_episodes episode
  where episode.source = 'blvietsub'
    and (
      episode.server_name ~* '\mextra\M\s*$'
      or episode.server_name ~* '\mpilot\M(?:\s+pilot)?\s*$'
      or episode.server_name ~* '(?:tập\s+)?đặc\s+biệt\s*$'
    )
), safe_candidates as (
  select candidate.*
  from candidates candidate
  where not exists (
    select 1
    from public.movie_episodes existing
    where existing.movie_id = candidate.movie_id
      and existing.server_name = (
        select source_row.server_name
        from public.movie_episodes source_row
        where source_row.id = candidate.id
      )
      and existing.episode_number = candidate.new_episode_number
      and existing.id <> candidate.id
  )
), repaired as (
  update public.movie_episodes episode
  set episode_number = candidate.new_episode_number,
      episode_name = candidate.new_episode_name,
      slug = candidate.new_slug
  from safe_candidates candidate
  where episode.id = candidate.id
  returning episode.movie_id
)
update public.movie_api_cache cache
set expires_at = now()
where cache.slug in (
  select movie.slug
  from public.movies movie
  where movie.id in (select distinct movie_id from repaired)
);

comment on table public.movie_episodes is
  'Canonical per-server playback rows. Negative episode numbers are reserved for provider specials so Pilot, Extra and Tập Đặc Biệt never collide with numbered episodes.';
