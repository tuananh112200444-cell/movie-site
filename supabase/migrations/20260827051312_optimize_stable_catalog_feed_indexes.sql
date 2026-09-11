begin;

-- Match both the public-feed predicate and its exact NULL ordering. This lets
-- Postgres stop after the requested page instead of scanning/sorting the full
-- published catalogue on every request.
drop index if exists public.movies_stable_publication_feed_idx;
create index movies_stable_publication_feed_idx
  on public.movies (published_at desc nulls last, id)
  where is_published is true
    and superseded_by_movie_id is null
    and lower(coalesce(seo_catalog_status,'published')) not in ('hidden','draft','superseded');

drop index if exists public.movies_stable_episode_feed_idx;
create index movies_stable_episode_feed_idx
  on public.movies (last_episode_change_at desc nulls last, id)
  where is_published is true
    and superseded_by_movie_id is null
    and lower(coalesce(seo_catalog_status,'published')) not in ('hidden','draft','superseded')
    and last_episode_change_at is not null;

commit;
