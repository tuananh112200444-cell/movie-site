with catalogue as (
  select
    movie.id,
    movie.slug,
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.title_original,
    case
      when profile.status = 'published' and profile.index_mode <> 'noindex'
        then coalesce(nullif(profile.intro_content, ''), movie.content)
      else movie.content
    end as content,
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
    quality.episode_progress_percent as seo_episode_progress_percent,
    case
      when profile.status = 'published' and profile.index_mode <> 'noindex'
        then jsonb_build_object(
          'status', profile.status,
          'index_mode', profile.index_mode,
          'validation_score', profile.validation_score,
          'seo_title', profile.seo_title,
          'meta_description', profile.meta_description,
          'canonical_path', profile.canonical_path,
          'og_image_url', profile.og_image_url,
          'focus_keyword', profile.focus_keyword,
          'secondary_keywords', profile.secondary_keywords,
          'faq', profile.faq,
          'topic_links', profile.topic_links,
          'review_content', profile.review_content,
          'version', profile.version,
          'live_audit', profile.live_audit,
          'updated_at', profile.updated_at
        )
      else null
    end as seo_profile,
    (
      profile.status = 'published'
      and profile.index_mode = 'index'
      and profile.validation_score >= 85
      and (
        profile.live_audit ->> 'passed' = 'true'
        or profile.live_audit ->> 'mode' in ('static-build-pending','static-content-refresh-pending')
      )
    ) as manually_approved
  from public.movies movie
  left join public.movie_seo_quality_status quality
    on quality.movie_id = movie.id
    and quality.eligible_for_index = true
    and quality.index_tier in ('playable', 'ongoing')
    and quality.quality_score >= 85
    and quality.content_length >= 500
  left join public.movie_seo_profiles profile
    on profile.movie_id = movie.id
    and profile.status = 'published'
    and profile.index_mode <> 'noindex'
    and profile.validation_score >= 70
    and (
      profile.live_audit ->> 'passed' = 'true'
      or profile.live_audit ->> 'mode' in ('static-build-pending','static-content-refresh-pending')
    )
  where movie.is_published = true
    and movie.superseded_by_movie_id is null
)
select *
from catalogue
where (seo_quality_score is not null or manually_approved)
  and length(trim(coalesce(name, ''))) >= 2
  and length(regexp_replace(coalesce(content, ''), '<[^>]+>', ' ', 'g')) >= case when manually_approved then 160 else 500 end
  and coalesce(nullif(poster_url, ''), nullif(thumb_url, '')) is not null
  and year between 1888 and extract(year from now())::int + 2
  and (manually_approved or tmdb_id is not null)
  and jsonb_typeof(category) = 'array'
  and jsonb_array_length(category) > 0
  and jsonb_typeof(country) = 'array'
  and jsonb_array_length(country) > 0
  and (
    manually_approved
    or (
      length(trim(coalesce(origin_name, title_original, ''))) >= 2
      and exists (
        select 1 from unnest(actor) person
        where lower(trim(person)) !~ '^(đang cập nhật|dang cap nhat|updating|unknown|n/a|null)$'
      )
      and exists (
        select 1 from unnest(director) person
        where lower(trim(person)) !~ '^(đang cập nhật|dang cap nhat|updating|unknown|n/a|null)$'
      )
    )
  )
order by coalesce(manually_approved, false) desc,
  seo_quality_score desc nulls last,
  seo_freshness_score desc nulls last,
  seo_checked_at desc nulls last,
  slug asc
limit 18000;
