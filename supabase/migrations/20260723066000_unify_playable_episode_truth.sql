-- One definition of "playable episode" for ingestion, repair and auditing.
-- Active stream rows are valid player sources and must not be ignored when a
-- connector stores its playable links outside the two legacy episode tables.

create or replace function public.get_movie_playable_max_episode(p_movie_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(x.episode_number), 0)::integer
  from (
    select greatest(coalesce(e.episode_number, 0)::integer, 1) as episode_number
    from public.movie_episodes e
    where e.movie_id = p_movie_id
      and (
        coalesce(e.link_m3u8, '') ~* '^https?://'
        or coalesce(e.link_embed, '') ~* '^https?://'
      )
    union all
    select greatest(coalesce(e.episode_number, 0)::integer, 1) as episode_number
    from public.episodes e
    where e.movie_id = p_movie_id
      and (
        coalesce(e.link_m3u8, '') ~* '^https?://'
        or coalesce(e.link_embed, '') ~* '^https?://'
      )
    union all
    select greatest(
      coalesce(
        nullif(substring(coalesce(s.episode_slug, '') from '([0-9]+)'), '')::integer,
        0
      ),
      1
    ) as episode_number
    from public.streams s
    where s.movie_id = p_movie_id
      and s.is_active is true
      and (
        coalesce(s.stream_url, '') ~* '^https?://'
        or coalesce(s.embed_url, '') ~* '^https?://'
      )
  ) x;
$$;

revoke all on function public.get_movie_playable_max_episode(uuid) from public, anon, authenticated;
grant execute on function public.get_movie_playable_max_episode(uuid) to service_role;

create or replace function public.reconcile_movie_release_state(p_movie_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  max_episode integer := 0;
  declared_total integer := 0;
  advertised_episode integer := 0;
  normalized_status text := '';
  normalized_label text := '';
  raw_suffix text := '';
begin
  max_episode := public.get_movie_playable_max_episode(p_movie_id);

  select
    greatest(
      coalesce(total_episodes, 0),
      coalesce(nullif(substring(coalesce(episode_total, '') from '([0-9]+)'), '')::integer, 0)
    ),
    greatest(
      coalesce(current_episode, 0),
      coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::integer, 0)
    ),
    lower(coalesce(status, '')),
    lower(coalesce(episode_current, '')),
    case when lower(coalesce(episode_current, '')) like '%raw%' then ' RAW' else '' end
  into declared_total, advertised_episode, normalized_status, normalized_label, raw_suffix
  from public.movies
  where id = p_movie_id;

  if not found then
    return 0;
  end if;

  perform set_config('app.movie_refresh_processing', '1', true);

  if max_episode > 0 then
    update public.movies
    set
      seo_catalog_status = case
        when lower(coalesce(seo_catalog_status, '')) in ('hidden', 'draft', 'superseded') then seo_catalog_status
        else 'published'
      end,
      status = case
        when declared_total > 0 and max_episode >= declared_total then 'completed'
        when declared_total > max_episode
          or lower(coalesce(status, '')) in ('upcoming', 'trailer', 'returning series', 'in production')
          then 'ongoing'
        else status
      end,
      episode_current = case
        when declared_total > 1 and max_episode >= declared_total
          then 'Hoàn Tất (' || max_episode::text || '/' || declared_total::text || ')'
        when advertised_episode is distinct from max_episode
          or normalized_label ~ '(trailer|sap chieu|dang cap nhat)'
          then 'Tập ' || max_episode::text || raw_suffix
        else episode_current
      end,
      current_episode = max_episode,
      updated_at = case
        when advertised_episode is distinct from max_episode
          or lower(coalesce(status, '')) in ('upcoming', 'trailer', 'returning series', 'in production')
          or normalized_label ~ '(trailer|sap chieu|dang cap nhat)'
          then now()
        else updated_at
      end
    where id = p_movie_id
      and is_published is true;
  elsif advertised_episode > 0
    and normalized_status not in ('upcoming', 'trailer')
    and normalized_label !~ '(trailer|sap chieu)'
  then
    update public.movies
    set
      current_episode = 0,
      episode_current = 'Đang cập nhật',
      updated_at = now()
    where id = p_movie_id
      and is_published is true;
  end if;

  return max_episode;
end;
$$;

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
    if item.advertised_episode is distinct from item.playable_episode
      and (item.advertised_episode > 0 or item.playable_episode > 0)
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

insert into public.movie_refresh_queue (movie_id, requested_at, next_attempt_at, reasons)
select m.id, now(), now(), array['unified_episode_truth_repair']
from public.movies m
where m.slug = 'so-9-dinh-menh'
on conflict (movie_id) do update set
  requested_at = excluded.requested_at,
  next_attempt_at = least(public.movie_refresh_queue.next_attempt_at, now()),
  reasons = public.movie_refresh_queue.reasons || array['unified_episode_truth_repair'],
  attempts = 0,
  last_error = null;

comment on function public.get_movie_playable_max_episode(uuid) is
  'Shared playable-episode truth across movie_episodes, episodes and active streams.';
