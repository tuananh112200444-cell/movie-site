-- Keep public episode metadata aligned with links that customers can actually
-- play. Source feeds sometimes advertise an episode before its link arrives.
-- The queue corrects that metadata asynchronously without blocking ingestion.

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
  select coalesce(max(e.episode_number), 0)
  into max_episode
  from (
    select greatest(coalesce(episode_number, 0)::integer, 1) as episode_number
    from public.movie_episodes
    where movie_id = p_movie_id
      and (coalesce(link_m3u8, '') ~* '^https?://' or coalesce(link_embed, '') ~* '^https?://')
    union all
    select greatest(coalesce(episode_number, 0)::integer, 1) as episode_number
    from public.episodes
    where movie_id = p_movie_id
      and (coalesce(link_m3u8, '') ~* '^https?://' or coalesce(link_embed, '') ~* '^https?://')
  ) e;

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

-- Queue recent discrepancies for repair. This is bounded and does not execute
-- episode scans inside the migration transaction for every movie.
with recent_movies as (
  select
    m.id,
    greatest(
      coalesce(m.current_episode, 0),
      coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::integer, 0)
    ) as advertised_episode
  from public.movies m
  where m.is_published is true
  order by m.updated_at desc nulls last
  limit 1000
),
playable as (
  select x.movie_id, max(x.episode_number) as max_episode
  from (
    select e.movie_id, greatest(coalesce(e.episode_number, 0)::integer, 1) as episode_number
    from public.movie_episodes e
    join recent_movies r on r.id = e.movie_id
    where coalesce(e.link_m3u8, '') ~* '^https?://' or coalesce(e.link_embed, '') ~* '^https?://'
    union all
    select e.movie_id, greatest(coalesce(e.episode_number, 0)::integer, 1) as episode_number
    from public.episodes e
    join recent_movies r on r.id = e.movie_id
    where coalesce(e.link_m3u8, '') ~* '^https?://' or coalesce(e.link_embed, '') ~* '^https?://'
  ) x
  group by x.movie_id
)
insert into public.movie_refresh_queue (movie_id, requested_at, next_attempt_at, reasons)
select r.id, now(), now(), array['episode_truth_repair']
from recent_movies r
left join playable p on p.movie_id = r.id
where r.advertised_episode > coalesce(p.max_episode, 0)
  and r.advertised_episode > 0
on conflict (movie_id) do update set
  requested_at = excluded.requested_at,
  next_attempt_at = least(public.movie_refresh_queue.next_attempt_at, now()),
  reasons = public.movie_refresh_queue.reasons || array['episode_truth_repair'],
  attempts = 0,
  last_error = null;

comment on function public.reconcile_movie_release_state(uuid) is
  'Caps public episode metadata to the highest locally playable episode; metadata never promises an unavailable episode.';
