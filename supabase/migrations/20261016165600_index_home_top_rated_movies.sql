-- Match home-proxy's rating order so LIMIT stops before scanning/sorting all
-- published films. Build without blocking ingestion.
create index concurrently if not exists movies_home_rating_order_idx
  on public.movies (
    tmdb_vote_average desc nulls last,
    tmdb_vote_count desc nulls last,
    tmdb_popularity desc nulls last
  ) where is_published = true;
