select
  count(*) over() as seo_profile_total,
  movie.id, movie.slug, movie.name, movie.origin_name, movie.title_vi, movie.title_en, movie.title_original,
  coalesce(nullif(profile.intro_content, ''), movie.content) as content,
  movie.type, movie.status, movie.thumb_url, movie.poster_url, movie.trailer_url, movie.time,
  movie.episode_current, movie.episode_total, movie.current_episode, movie.total_episodes,
  movie.quality, movie.lang, movie.year, movie.actor, movie.director, movie.category, movie.country,
  movie.view, movie.tmdb_id, movie.imdb_id, movie.source_site, movie.source_name, movie.updated_at, movie.is_published,
  quality.index_tier as seo_index_tier, quality.quality_score as seo_quality_score,
  quality.freshness_score as seo_freshness_score, quality.checked_at as seo_checked_at,
  quality.latest_episode_number as seo_latest_episode_number, quality.declared_total_episodes as seo_declared_total_episodes,
  quality.episode_progress_percent as seo_episode_progress_percent,
  jsonb_build_object(
    'status', profile.status, 'index_mode', profile.index_mode, 'validation_score', profile.validation_score,
    'seo_title', profile.seo_title, 'meta_description', profile.meta_description, 'canonical_path', profile.canonical_path,
    'og_image_url', profile.og_image_url, 'focus_keyword', profile.focus_keyword, 'secondary_keywords', profile.secondary_keywords,
    'faq', profile.faq, 'topic_links', profile.topic_links, 'review_content', profile.review_content,
    'version', profile.version, 'live_audit', profile.live_audit, 'updated_at', profile.updated_at
  ) as seo_profile
from public.movie_seo_profiles profile
join public.movies movie on movie.id = profile.movie_id
left join public.movie_seo_quality_status quality on quality.movie_id = movie.id
where profile.status = 'published'
  and profile.index_mode = 'index'
  and profile.validation_score >= 85
  and movie.superseded_by_movie_id is null
  and length(regexp_replace(coalesce(profile.intro_content, movie.content, ''), '<[^>]+>', ' ', 'g')) >= 160
  and coalesce(nullif(movie.poster_url, ''), nullif(movie.thumb_url, '')) is not null
  and movie.year between 1888 and extract(year from now())::int + 2
  and jsonb_typeof(movie.category) = 'array' and jsonb_array_length(movie.category) > 0
  and jsonb_typeof(movie.country) = 'array' and jsonb_array_length(movie.country) > 0
order by profile.published_at desc nulls last, profile.updated_at desc
limit 8000;
