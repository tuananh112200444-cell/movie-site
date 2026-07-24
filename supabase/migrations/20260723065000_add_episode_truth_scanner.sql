-- A cursor-based safety net repairs historical drift that predates the queue.
-- It scans a small indexed slice and never performs a full-catalog burst.

create table if not exists public.movie_episode_truth_scan_state (
  singleton boolean primary key default true check (singleton),
  cursor_movie_id uuid,
  last_run_at timestamptz,
  last_scanned integer not null default 0,
  last_queued integer not null default 0
);

alter table public.movie_episode_truth_scan_state enable row level security;
revoke all on table public.movie_episode_truth_scan_state from public, anon, authenticated;
grant select, insert, update on table public.movie_episode_truth_scan_state to service_role;

insert into public.movie_episode_truth_scan_state (singleton)
values (true)
on conflict (singleton) do nothing;

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
    with candidates as (
      select
        m.id,
        greatest(
          coalesce(m.current_episode, 0),
          coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::integer, 0)
        ) as advertised_episode
      from public.movies m
      where m.is_published is true
        and (state_cursor is null or m.id > state_cursor)
      order by m.id
      limit batch_limit
    )
    select
      c.id,
      c.advertised_episode,
      greatest(
        coalesce((
          select max(greatest(coalesce(e.episode_number, 0)::integer, 1))
          from public.movie_episodes e
          where e.movie_id = c.id
            and (coalesce(e.link_m3u8, '') ~* '^https?://' or coalesce(e.link_embed, '') ~* '^https?://')
        ), 0),
        coalesce((
          select max(greatest(coalesce(e.episode_number, 0)::integer, 1))
          from public.episodes e
          where e.movie_id = c.id
            and (coalesce(e.link_m3u8, '') ~* '^https?://' or coalesce(e.link_embed, '') ~* '^https?://')
        ), 0)
      ) as playable_episode
    from candidates c
    order by c.id
  loop
    scanned := scanned + 1;
    last_id := item.id;
    if item.advertised_episode > item.playable_episode and item.advertised_episode > 0 then
      perform public.enqueue_movie_refresh(item.id, 'episode_truth_scan');
      queued := queued + 1;
    end if;
  end loop;

  -- Wrap after reaching the end of the UUID-ordered catalog.
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

revoke all on function public.scan_movie_episode_truth(integer) from public, anon, authenticated;
grant execute on function public.scan_movie_episode_truth(integer) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'scan-movie-episode-truth';

    perform cron.schedule(
      'scan-movie-episode-truth',
      '2-59/5 * * * *',
      $cmd$select public.scan_movie_episode_truth(200);$cmd$
    );
  end if;
end $$;

-- Immediate cleanup for drift already observed during the compatibility audit.
insert into public.movie_refresh_queue (movie_id, requested_at, next_attempt_at, reasons)
select m.id, now(), now(), array['episode_truth_audit_repair']
from public.movies m
where m.slug in (
  'blvietsub-6623-mua-he-ay-co-cau',
  'blvietsub-1603-hoang-tu-va-be-toi-trung-thanh',
  'blvietsub-6592-rang-dong',
  'blvietsub-6621-anh-sao-anh-niem-tin',
  'blvietsub-1673-chuyen-tinh-gian-don',
  'hoac-tong-dung-nguoc-nua-to-tieu-thu-om-bung-bau-bo-chay-roi-short-drama',
  'sau-khi-mat-tri-nho-bon-nguoi-dan-ong-tranh-gianh-toi-short-drama',
  'tinh-yeu-199-muon-mai-mai-yeu',
  'devil-may-cry-phan-2',
  'sherlock-holmes-phan-6'
)
on conflict (movie_id) do update set
  requested_at = excluded.requested_at,
  next_attempt_at = least(public.movie_refresh_queue.next_attempt_at, now()),
  reasons = public.movie_refresh_queue.reasons || array['episode_truth_audit_repair'],
  attempts = 0,
  last_error = null;

comment on function public.scan_movie_episode_truth(integer) is
  'Cursor-based, bounded historical drift scanner; queues repairs without blocking ingestion.';
