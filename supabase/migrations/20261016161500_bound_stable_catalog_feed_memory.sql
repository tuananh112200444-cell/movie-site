begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Incident fix: materialize only UUID and sort timestamp, never complete movie rows.
-- Exact totals, ordering, full JSON output and invoker RLS semantics are preserved.
-- Large JSON/text fields are fetched only for the bounded result page.
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

commit;
