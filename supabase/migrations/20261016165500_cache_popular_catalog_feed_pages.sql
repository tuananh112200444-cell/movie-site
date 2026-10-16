-- Cache the first five pages of both public feeds; retain exact live fallback
-- for other page sizes, deeper pages, stale snapshots and authenticated RLS.
begin;set local lock_timeout='3s';set local statement_timeout='30s';
create or replace function public.compute_stable_catalog_feed(
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
  normalized_mode text := lower(coalesce(p_mode, 'new'));
  sort_column text;
  eligibility text;
begin
  if normalized_mode not in ('new', 'episode_updates') then
    return;
  end if;

  if normalized_mode = 'new' then
    sort_column := 'created_at';
    eligibility := format(
      'and movie.year between %s and %s',
      extract(year from current_date)::integer - 1,
      extract(year from current_date)::integer + 1
    );
  else
    sort_column := 'last_episode_change_at';
    eligibility := format(
      'and movie.year between %s and %s
       and movie.last_episode_change_at is not null
       and (
         (coalesce(movie.current_episode, 0) > 0
           and (coalesce(movie.total_episodes, 0) = 0
             or movie.current_episode < movie.total_episodes)
           and lower(coalesce(movie.episode_current, '''')) not like ''%%hoàn tất%%''
           and lower(coalesce(movie.episode_current, '''')) not like ''%%hoan tat%%''
           and lower(coalesce(movie.episode_current, '''')) not in (''full'', ''full hd'', ''end''))
         or movie.last_episode_change_at > coalesce(movie.created_at, movie.published_at, timestamptz ''epoch'') + interval ''6 hours''
       )',
      extract(year from current_date)::integer - 1,
      extract(year from current_date)::integer + 1
    );
  end if;

  return query execute format($query$
    with filtered as materialized (
      select movie.id, movie.%1$I as feed_sort_at
      from public.movies movie
      where movie.is_published is true
        and lower(coalesce(movie.seo_catalog_status, 'published')) not in ('hidden', 'draft', 'superseded')
        and movie.superseded_by_movie_id is null
        %2$s
    ), total as (
      select count(*)::bigint as total_count from filtered
    ), candidates as (
      select *
      from filtered
      order by feed_sort_at desc nulls last, id
      limit $1 offset $2
    )
    select
      to_jsonb(movie)
        || jsonb_build_object('id', candidate.id, 'updated_at', candidate.feed_sort_at, 'feed_sort_at', candidate.feed_sort_at),
      total.total_count
    from candidates candidate
    join public.movies movie on movie.id = candidate.id
    cross join total
    order by candidate.feed_sort_at desc nulls last, candidate.id
  $query$, sort_column, eligibility)
  using greatest(1, least(coalesce(p_limit, 36), 72)), greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.compute_stable_catalog_feed(text,integer,integer) from public,anon,authenticated;
grant execute on function public.compute_stable_catalog_feed(text,integer,integer) to service_role;
create materialized view public.catalog_feed_page_cache as
select modes.mode, pages.n*36 as page_offset,feed.ordinality as row_position,feed.item,feed.total_count,now() as cached_at
from (values('new'::text),('episode_updates'::text)) modes(mode)
cross join generate_series(0,4) pages(n)
cross join lateral public.compute_stable_catalog_feed(modes.mode,36,pages.n*36) with ordinality feed;
create unique index catalog_feed_page_cache_position_idx on public.catalog_feed_page_cache(mode,page_offset,row_position);
revoke all on public.catalog_feed_page_cache from public,anon,authenticated;
grant select on public.catalog_feed_page_cache to anon,service_role;
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
  normalized_mode text := lower(coalesce(p_mode, 'new'));
  sort_column text;
  eligibility text;
begin
  if normalized_mode not in ('new', 'episode_updates') then
    return;
  end if;

  if normalized_mode = 'new' then
    sort_column := 'created_at';
    eligibility := format(
      'and movie.year between %s and %s',
      extract(year from current_date)::integer - 1,
      extract(year from current_date)::integer + 1
    );
  else
    sort_column := 'last_episode_change_at';
    eligibility := format(
      'and movie.year between %s and %s
       and movie.last_episode_change_at is not null
       and (
         (coalesce(movie.current_episode, 0) > 0
           and (coalesce(movie.total_episodes, 0) = 0
             or movie.current_episode < movie.total_episodes)
           and lower(coalesce(movie.episode_current, '''')) not like ''%%hoàn tất%%''
           and lower(coalesce(movie.episode_current, '''')) not like ''%%hoan tat%%''
           and lower(coalesce(movie.episode_current, '''')) not in (''full'', ''full hd'', ''end''))
         or movie.last_episode_change_at > coalesce(movie.created_at, movie.published_at, timestamptz ''epoch'') + interval ''6 hours''
       )',
      extract(year from current_date)::integer - 1,
      extract(year from current_date)::integer + 1
    );
  end if;

  -- Only roles with the same public visibility can use this shared snapshot.
  if current_user in ('anon','service_role','postgres')
     and greatest(1,least(coalesce(p_limit,36),72))=36
     and greatest(0,coalesce(p_offset,0)) in (0,36,72,108,144) then
    return query
      select c.item,c.total_count from public.catalog_feed_page_cache c
      where c.mode=normalized_mode and c.page_offset=greatest(0,coalesce(p_offset,0))
        and c.cached_at>now()-interval '10 minutes'
      order by c.row_position;
    if found then return; end if;
  end if;

  return query execute format($query$
    with filtered as materialized (
      select movie.id, movie.%1$I as feed_sort_at
      from public.movies movie
      where movie.is_published is true
        and lower(coalesce(movie.seo_catalog_status, 'published')) not in ('hidden', 'draft', 'superseded')
        and movie.superseded_by_movie_id is null
        %2$s
    ), total as (
      select count(*)::bigint as total_count from filtered
    ), candidates as (
      select *
      from filtered
      order by feed_sort_at desc nulls last, id
      limit $1 offset $2
    )
    select
      to_jsonb(movie)
        || jsonb_build_object('id', candidate.id, 'updated_at', candidate.feed_sort_at, 'feed_sort_at', candidate.feed_sort_at),
      total.total_count
    from candidates candidate
    join public.movies movie on movie.id = candidate.id
    cross join total
    order by candidate.feed_sort_at desc nulls last, candidate.id
  $query$, sort_column, eligibility)
  using greatest(1, least(coalesce(p_limit, 36), 72)), greatest(0, coalesce(p_offset, 0));
end;
$$;

select cron.schedule('refresh-public-catalog-feed-cache','0-59/2 * * * *','refresh materialized view concurrently public.catalog_feed_page_cache;');
commit;
