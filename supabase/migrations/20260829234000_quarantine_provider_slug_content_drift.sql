begin;

-- A provider slug is not a globally stable movie identity. Providers can
-- reuse the same slug for a movie edition and a TV series (for example Mouse,
-- 2021). Refuse identity rewrites that disagree with the canonical movie's
-- known type or year so bulk and targeted imports fail closed.
create or replace function public.enforce_provider_identity_movie_compatibility()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
declare
  canonical_type text;
  canonical_year integer;
  incoming_type text := public.canonical_movie_type(new.movie_type);
begin
  if lower(coalesce(new.provider, '')) not in ('phimapi', 'kkphim', 'nguonc', 'vsmov', 'ophim') then
    return new;
  end if;

  select public.canonical_movie_type(movie.type), movie.year
    into canonical_type, canonical_year
  from public.movies movie
  where movie.id = new.movie_id
    and movie.superseded_by_movie_id is null;

  if not found then
    raise exception 'Provider identity targets a missing or retired movie: %', new.movie_id;
  end if;

  if incoming_type <> '' and canonical_type <> '' and incoming_type <> canonical_type then
    raise exception 'Provider identity type mismatch for %:% (% vs %)',
      new.provider, new.provider_slug, incoming_type, canonical_type;
  end if;

  if new.release_year between 1888 and 2200
    and canonical_year between 1888 and 2200
    and new.release_year <> canonical_year then
    raise exception 'Provider identity year mismatch for %:% (% vs %)',
      new.provider, new.provider_slug, new.release_year, canonical_year;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_provider_identity_movie_compatibility()
  from public, anon, authenticated;

drop trigger if exists provider_identity_movie_compatibility_guard
  on public.provider_movie_identities;
create trigger provider_identity_movie_compatibility_guard
before insert or update of movie_id, movie_type, release_year
on public.provider_movie_identities
for each row execute function public.enforce_provider_identity_movie_compatibility();

create temporary table kp_verified_foreign_full_rows on commit drop as
select
  stream.id as stream_id,
  stream.movie_id,
  movie.slug as movie_slug,
  stream.server_name,
  stream.stream_url,
  stream.embed_url
from public.streams stream
join public.movies movie on movie.id = stream.movie_id
where lower(coalesce(stream.source, '')) = 'phimapi'
  and lower(coalesce(stream.episode_slug, '')) in ('full', 'tap-full', 'movie')
  and movie.slug in (
    'anna-pigeon-2026',
    'cong-ty-quai-vat',
    'cuoc-tinh-vung-trom',
    'cuon-so-tu-than-japan',
    'khi-me-gap-bo-phan-1',
    'loi-nguyen-cau',
    'love-around',
    'love-me',
    'luu-kim-tue-nguyet',
    'moi-gioi-nha-ma',
    'mouse-ke-san-nguoi',
    'phi-tri-nhan-sinh-2',
    'the-100-girlfriends-who-really-really-really-really-really-love-you-2023',
    'tinh-yeu-manh-liet',
    'vo-boc'
  );

insert into public.catalog_integrity_issues (
  issue_key,
  issue_type,
  movie_id,
  severity,
  confidence,
  status,
  evidence,
  last_detected_at,
  resolved_at,
  last_error
)
select
  'provider_slug_content_drift:' || bad.movie_id::text,
  'provider_slug_content_drift',
  bad.movie_id,
  5,
  1,
  'resolved',
  jsonb_build_object(
    'provider', 'phimapi',
    'quarantined_episode_label', 'full',
    'removed_stream_rows', count(*),
    'server_names', jsonb_agg(distinct bad.server_name),
    'reason', 'Provider movie/Full edition conflicted with a verified episodic canonical title'
  ),
  now(),
  now(),
  null
from kp_verified_foreign_full_rows bad
group by bad.movie_id
on conflict (issue_key) do update set
  issue_type = excluded.issue_type,
  severity = excluded.severity,
  confidence = excluded.confidence,
  status = excluded.status,
  evidence = excluded.evidence,
  last_detected_at = excluded.last_detected_at,
  resolved_at = excluded.resolved_at,
  last_error = null;

delete from public.movie_episodes episode
using kp_verified_foreign_full_rows bad
where episode.movie_id = bad.movie_id
  and lower(coalesce(episode.slug, episode.episode_name, '')) in ('full', 'tap-full', 'movie')
  and (
    lower(coalesce(episode.source, '')) = 'phimapi'
    or (nullif(bad.stream_url, '') is not null and episode.link_m3u8 = bad.stream_url)
    or (nullif(bad.embed_url, '') is not null and episode.link_embed = bad.embed_url)
  );

delete from public.episodes episode
using kp_verified_foreign_full_rows bad
where episode.movie_id = bad.movie_id
  and lower(coalesce(episode.episode_slug, episode.episode_name, '')) in ('full', 'tap-full', 'movie')
  and (
    (nullif(bad.stream_url, '') is not null and episode.link_m3u8 = bad.stream_url)
    or (nullif(bad.embed_url, '') is not null and episode.link_embed = bad.embed_url)
    or lower(coalesce(episode.server_name, '')) = lower(coalesce(bad.server_name, ''))
  );

delete from public.streams stream
using kp_verified_foreign_full_rows bad
where stream.id = bad.stream_id;

delete from public.movie_api_cache cache
using (select distinct movie_slug from kp_verified_foreign_full_rows) bad
where cache.slug = bad.movie_slug;

commit;
