begin;

-- BLVietsub's legacy parser accepted arbitrary four-digit numbers from a page
-- as the release year. The 2040 values are not valid release years. Recover a
-- trustworthy year only when it is embedded in the image filename; leave the
-- rest unknown rather than presenting a fabricated future date.
with invalid_bl_years as (
  select
    id,
    (regexp_match(
      regexp_replace(coalesce(nullif(poster_url, ''), nullif(thumb_url, ''), ''), '^.*/', ''),
      '(?:^|[-_])((?:19|20)[0-9]{2})(?:[-_.]|$)'
    ))[1]::integer as image_year
  from public.movies
  where source_site = 'blvietsub'
    and year > extract(year from current_date)::integer + 1
), repaired_bl_years as (
  update public.movies movie
  set year = case
    when invalid.image_year between 1888 and extract(year from current_date)::integer + 1
      then invalid.image_year
    else null
  end
  from invalid_bl_years invalid
  where movie.id = invalid.id
  returning movie.id
)
select count(*) as repaired_invalid_bl_years from repaired_bl_years;

-- Feed pages have different semantic clocks from operational `updated_at`.
-- A movie imported today but released decades ago must not become a new movie.
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

  return query execute format($query$
    with filtered as materialized (
      select movie.*, movie.%1$I as feed_sort_at
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
      to_jsonb(candidate)
        || jsonb_build_object('id', candidate.id, 'updated_at', candidate.feed_sort_at, 'feed_sort_at', candidate.feed_sort_at),
      total.total_count
    from candidates candidate
    cross join total
    order by candidate.feed_sort_at desc nulls last, candidate.id
  $query$, sort_column, eligibility)
  using greatest(1, least(coalesce(p_limit, 36), 72)), greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.get_stable_catalog_feed(text, integer, integer) from public;
grant execute on function public.get_stable_catalog_feed(text, integer, integer)
  to anon, authenticated, service_role;

create index if not exists movies_catalog_valid_year_new_idx
  on public.movies (year desc, created_at desc nulls last, id)
  where is_published is true
    and superseded_by_movie_id is null
    and lower(coalesce(seo_catalog_status, 'published')) not in ('hidden', 'draft', 'superseded');

update public.home_page_cache
set sections = coalesce(sections, '{}'::jsonb) - 'trending',
    expires_at = now()
where id = 'homepage_v3';

commit;
