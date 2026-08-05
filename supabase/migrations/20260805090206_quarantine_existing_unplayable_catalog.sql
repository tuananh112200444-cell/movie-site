-- One-time cleanup for legacy rows created before the strict publication gate.
-- Preserve all metadata and episode rows; only remove provably unplayable
-- movies from public listings while the existing bounded repair queue works.

create temporary table legacy_unplayable_catalog on commit drop as
select movie.id, movie.slug, movie.source_site, movie.episode_current,
       movie.current_episode
from public.movies movie
where movie.is_published is true
  and lower(coalesce(movie.status, '')) not in ('upcoming', 'trailer')
  and lower(coalesce(movie.episode_current, '')) !~ '(trailer|sắp chiếu|sap chieu)'
  and lower(coalesce(movie.source_site, '')) <> 'tmdb-catalog'
  and coalesce(movie.seo_catalog_status, '') not in ('upcoming', 'trailer')
  and not exists (
    select 1 from public.movie_episodes episode
    where episode.movie_id = movie.id
      and (nullif(trim(coalesce(episode.link_m3u8, '')), '') is not null
        or nullif(trim(coalesce(episode.link_embed, '')), '') is not null)
  )
  and not exists (
    select 1 from public.episodes episode
    where episode.movie_id = movie.id
      and (nullif(trim(coalesce(episode.link_m3u8, '')), '') is not null
        or nullif(trim(coalesce(episode.link_embed, '')), '') is not null)
  )
  and not exists (
    select 1 from public.streams stream
    where stream.movie_id = movie.id
      and stream.is_active is true
      and (nullif(trim(coalesce(stream.stream_url, '')), '') is not null
        or nullif(trim(coalesce(stream.embed_url, '')), '') is not null)
  );

create index on legacy_unplayable_catalog(id);

insert into public.catalog_integrity_issues as issue (
  issue_key, issue_type, movie_id, severity, confidence, status,
  evidence, first_detected_at, last_detected_at, resolved_at, attempts,
  last_error
)
select
  'published_without_playback:' || movie.id,
  'published_without_playback',
  movie.id,
  5,
  0.9990,
  'open',
  jsonb_build_object(
    'slug', movie.slug,
    'source_site', movie.source_site,
    'episode_current', movie.episode_current,
    'current_episode', movie.current_episode,
    'hidden_pending_repair_at', now()
  ),
  now(),
  now(),
  null,
  0,
  'Hidden from public listings pending a verified playable source'
from legacy_unplayable_catalog movie
on conflict (issue_key) do update set
  status = 'open',
  severity = 5,
  confidence = 0.9990,
  evidence = issue.evidence || excluded.evidence,
  last_detected_at = now(),
  resolved_at = null,
  attempts = case when issue.attempts >= 3 then 1 else issue.attempts end,
  last_error = excluded.last_error;

-- Earlier primary-only repairs may already have reached the retry limit. Give
-- those hidden rows one bounded pass through the new alternate provider path.
update public.catalog_integrity_issues issue
set status = 'open',
    attempts = 1,
    resolved_at = null,
    last_detected_at = now(),
    last_error = 'Requeued for alternate-provider repair after dispatcher upgrade'
from public.movies movie
where movie.id = issue.movie_id
  and issue.issue_type = 'published_without_playback'
  and issue.attempts >= 3
  and lower(coalesce(movie.source_site, '')) in ('ophim', 'ophim1.com', 'phimapi')
  and not exists (
    select 1 from public.movie_episodes episode
    where episode.movie_id = movie.id
      and (nullif(trim(coalesce(episode.link_m3u8, '')), '') is not null
        or nullif(trim(coalesce(episode.link_embed, '')), '') is not null)
  )
  and not exists (
    select 1 from public.episodes episode
    where episode.movie_id = movie.id
      and (nullif(trim(coalesce(episode.link_m3u8, '')), '') is not null
        or nullif(trim(coalesce(episode.link_embed, '')), '') is not null)
  )
  and not exists (
    select 1 from public.streams stream
    where stream.movie_id = movie.id
      and stream.is_active is true
      and (nullif(trim(coalesce(stream.stream_url, '')), '') is not null
        or nullif(trim(coalesce(stream.embed_url, '')), '') is not null)
  );

update public.movies movie
set is_published = false,
    updated_at = now()
from legacy_unplayable_catalog broken
where movie.id = broken.id;

update public.movie_api_cache cache
set expires_at = now()
from legacy_unplayable_catalog broken
where cache.slug = broken.slug;

update public.home_page_cache
set expires_at = now();

select public.dispatch_catalog_source_repairs(3);
