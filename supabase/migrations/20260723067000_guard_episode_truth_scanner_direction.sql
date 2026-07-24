-- The scanner is a safety net for over-advertised episodes. Upward episode
-- discovery belongs to connector ingestion, because labels such as "Full" do
-- not contain a numeric current episode and would otherwise create churn.

create or replace function public.scan_movie_episode_truth(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  state_cursor uuid;
  item record;
  scanned integer := 0;
  queued integer := 0;
  last_id uuid;
  batch_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  select cursor_movie_id
  into state_cursor
  from public.movie_episode_truth_scan_state
  where singleton is true
  for update;

  for item in
    select
      m.id,
      greatest(
        coalesce(m.current_episode, 0),
        coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::integer, 0)
      ) as advertised_episode,
      public.get_movie_playable_max_episode(m.id) as playable_episode
    from public.movies m
    where m.is_published is true
      and (state_cursor is null or m.id > state_cursor)
    order by m.id
    limit batch_limit
  loop
    scanned := scanned + 1;
    last_id := item.id;
    if item.advertised_episode > item.playable_episode
      and item.advertised_episode > 0
    then
      perform public.enqueue_movie_refresh(item.id, 'episode_truth_scan');
      queued := queued + 1;
    end if;
  end loop;

  if scanned = 0 then
    state_cursor := null;
  else
    state_cursor := last_id;
  end if;

  update public.movie_episode_truth_scan_state
  set
    cursor_movie_id = state_cursor,
    last_run_at = now(),
    last_scanned = scanned,
    last_queued = queued
  where singleton is true;

  return jsonb_build_object('scanned', scanned, 'queued', queued, 'cursor', state_cursor);
end;
$$;

-- Remove only scanner-only upward-drift work created by the short-lived broad
-- condition. Preserve every connector, movie-change and genuine over-advertised
-- repair request.
delete from public.movie_refresh_queue q
using public.movies m
where q.movie_id = m.id
  and q.reasons = array['episode_truth_scan']::text[]
  and greatest(
    coalesce(m.current_episode, 0),
    coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::integer, 0)
  ) <= public.get_movie_playable_max_episode(m.id);

comment on function public.scan_movie_episode_truth(integer) is
  'Bounded scanner for over-advertised episodes; connector ingestion owns upward episode discovery.';
