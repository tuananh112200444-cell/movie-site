select
  movie.id,
  movie.slug,
  movie.name,
  movie.origin_name,
  movie.title_vi,
  movie.title_en,
  movie.title_original,
  movie.content,
  movie.type,
  movie.status,
  movie.thumb_url,
  movie.poster_url,
  movie.trailer_url,
  movie.time,
  movie.episode_current,
  movie.episode_total,
  movie.current_episode,
  movie.total_episodes,
  movie.quality,
  movie.lang,
  movie.year,
  movie.actor,
  movie.director,
  movie.category,
  movie.country,
  movie.view,
  movie.tmdb_id,
  movie.imdb_id,
  movie.source_site,
  movie.source_name,
  movie.updated_at,
  movie.is_published,
  quality.index_tier as seo_index_tier,
  quality.quality_score as seo_quality_score,
  quality.freshness_score as seo_freshness_score,
  quality.checked_at as seo_checked_at,
  quality.latest_episode_number as seo_latest_episode_number,
  quality.declared_total_episodes as seo_declared_total_episodes,
  quality.episode_progress_percent as seo_episode_progress_percent
from public.movie_seo_quality_status quality
join public.movies movie on movie.id = quality.movie_id
where quality.eligible_for_index = true
  and quality.index_tier = 'upcoming'
  and quality.quality_score >= 88
  and quality.content_length >= 350
  and movie.is_published = true
  and movie.superseded_by_movie_id is null
  and movie.tmdb_id is not null
  and length(trim(coalesce(movie.name, ''))) >= 2
  and length(trim(coalesce(movie.origin_name, movie.title_original, ''))) >= 2
  and coalesce(nullif(movie.poster_url, ''), nullif(movie.thumb_url, '')) is not null
  and movie.year between extract(year from now())::int and extract(year from now())::int + 2
  and jsonb_typeof(movie.category) = 'array'
  and jsonb_array_length(movie.category) > 0
  and jsonb_typeof(movie.country) = 'array'
  and jsonb_array_length(movie.country) > 0
  and movie.trailer_url ~* '^https://(www\.|m\.)?(youtube\.com/watch\?[^[:space:]]*v=|youtu\.be/|youtube\.com/(embed|shorts)/)[A-Za-z0-9_?&=/.-]+'
  and exists (
    select 1 from unnest(movie.actor) person
    where lower(trim(person)) !~ '^(đang cập nhật|dang cap nhat|updating|unknown|n/a|null)$'
  )
  and exists (
    select 1 from unnest(movie.director) person
    where lower(trim(person)) !~ '^(đang cập nhật|dang cap nhat|updating|unknown|n/a|null)$'
  )
order by quality.quality_score desc,
  quality.freshness_score desc,
  quality.checked_at desc,
  movie.slug asc
limit 20;
