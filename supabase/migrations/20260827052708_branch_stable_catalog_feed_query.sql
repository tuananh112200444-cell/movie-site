begin;

-- Select the semantic clock before planning the query. Keeping the mode inside
-- a CASE expression produced a generic plan that occasionally scanned/sorted
-- the whole catalogue and hit PostgREST's statement timeout.
create or replace function public.get_stable_catalog_feed(
  p_mode text default 'new',
  p_limit integer default 36,
  p_offset integer default 0
)
returns table(item jsonb, total_count bigint)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  normalized_mode text := lower(coalesce(p_mode,'new'));
  sort_column text;
  episode_filter text;
begin
  if normalized_mode not in ('new','episode_updates') then
    return;
  end if;

  if normalized_mode = 'episode_updates' then
    sort_column := 'last_episode_change_at';
    episode_filter := 'and movie.last_episode_change_at is not null';
  else
    sort_column := 'published_at';
    episode_filter := '';
  end if;

  return query execute format($query$
    with candidates as (
      select
        movie.id,
        movie.slug,
        movie.name,
        movie.origin_name,
        movie.title_vi,
        movie.title_en,
        movie.thumb_url,
        movie.poster_url,
        movie.type,
        movie.year,
        movie.quality,
        movie.lang,
        movie.episode_current,
        movie.episode_total,
        movie.current_episode,
        movie.total_episodes,
        movie.schedule_type,
        movie.release_time,
        movie.release_day,
        movie.schedule_timezone,
        movie.category,
        movie.country,
        movie.source_site,
        movie.source_name,
        movie.release_at,
        movie.next_episode_at,
        movie.next_episode_name,
        movie.schedule_note,
        movie.published_at,
        movie.last_episode_change_at,
        movie.%1$I as feed_sort_at
      from public.movies movie
      where movie.is_published is true
        and lower(coalesce(movie.seo_catalog_status,'published')) not in ('hidden','draft','superseded')
        and movie.superseded_by_movie_id is null
        %2$s
      order by movie.%1$I desc nulls last, movie.id
      limit $1 offset $2
    )
    select
      jsonb_build_object(
        'id',candidate.id,
        'slug',candidate.slug,
        'name',candidate.name,
        'origin_name',candidate.origin_name,
        'title_vi',candidate.title_vi,
        'title_en',candidate.title_en,
        'thumb_url',candidate.thumb_url,
        'poster_url',candidate.poster_url,
        'type',candidate.type,
        'year',candidate.year,
        'quality',candidate.quality,
        'lang',candidate.lang,
        'episode_current',candidate.episode_current,
        'episode_total',candidate.episode_total,
        'current_episode',candidate.current_episode,
        'total_episodes',candidate.total_episodes,
        'schedule_type',candidate.schedule_type,
        'release_time',candidate.release_time,
        'release_day',candidate.release_day,
        'schedule_timezone',candidate.schedule_timezone,
        'category',candidate.category,
        'country',candidate.country,
        'updated_at',candidate.feed_sort_at,
        'feed_sort_at',candidate.feed_sort_at,
        'published_at',candidate.published_at,
        'last_episode_change_at',candidate.last_episode_change_at,
        'source_site',candidate.source_site,
        'source_name',candidate.source_name,
        'release_at',candidate.release_at,
        'next_episode_at',candidate.next_episode_at,
        'next_episode_name',candidate.next_episode_name,
        'schedule_note',candidate.schedule_note,
        'is_published',true
      ) as item,
      null::bigint as total_count
    from candidates candidate
    order by candidate.feed_sort_at desc nulls last, candidate.id
  $query$, sort_column, episode_filter)
  using greatest(1,least(coalesce(p_limit,36),72)), greatest(0,coalesce(p_offset,0));
end;
$$;

revoke all on function public.get_stable_catalog_feed(text,integer,integer) from public;
grant execute on function public.get_stable_catalog_feed(text,integer,integer)
  to anon, authenticated, service_role;

comment on function public.get_stable_catalog_feed(text,integer,integer) is
  'Stable indexed public feeds: new=first publication, episode_updates=real episode-number increase.';

commit;
