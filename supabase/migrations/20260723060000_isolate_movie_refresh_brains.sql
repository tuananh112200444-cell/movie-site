-- Isolate movie ingestion from lifecycle/SEO reconciliation.
-- Bulk syncs may write hundreds of episode rows in one transaction. Running
-- reconciliation and SEO scans once per row causes a thundering herd and can
-- make PostgREST appear to "lose" movies while PostgreSQL is saturated.

create table if not exists public.movie_refresh_queue (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  requested_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  reasons text[] not null default '{}'::text[],
  attempts integer not null default 0,
  last_error text
);

create index if not exists movie_refresh_queue_ready_idx
  on public.movie_refresh_queue (next_attempt_at, requested_at);

alter table public.movie_refresh_queue enable row level security;
revoke all on table public.movie_refresh_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.movie_refresh_queue to service_role;

create or replace function public.enqueue_movie_refresh(
  p_movie_id uuid,
  p_reason text default 'data_changed'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_movie_id is null then
    return;
  end if;

  insert into public.movie_refresh_queue as q (
    movie_id, requested_at, next_attempt_at, reasons, attempts, last_error
  ) values (
    p_movie_id, now(), now(), array[coalesce(nullif(p_reason, ''), 'data_changed')], 0, null
  )
  on conflict (movie_id) do update set
    requested_at = excluded.requested_at,
    next_attempt_at = least(q.next_attempt_at, now()),
    reasons = (
      select coalesce(array_agg(distinct reason), '{}'::text[])
      from unnest(q.reasons || excluded.reasons) as reason
    ),
    attempts = 0,
    last_error = null;
end;
$$;

revoke all on function public.enqueue_movie_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_movie_refresh(uuid, text) to service_role;

create or replace function public.enqueue_movie_refresh_after_movie_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.movie_refresh_processing', true), '0') = '1' then
    return new;
  end if;
  perform public.enqueue_movie_refresh(new.id, 'movie_changed');
  return new;
end;
$$;

create or replace function public.enqueue_movie_refresh_after_episode_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_movie_id uuid;
begin
  target_movie_id := case when tg_op = 'DELETE' then old.movie_id else new.movie_id end;
  perform public.enqueue_movie_refresh(target_movie_id, 'episode_changed');

  if tg_op = 'UPDATE' and old.movie_id is distinct from new.movie_id then
    perform public.enqueue_movie_refresh(old.movie_id, 'episode_moved');
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists refresh_movie_seo_quality_on_movie_change on public.movies;
drop trigger if exists enqueue_movie_refresh_on_movie_change on public.movies;
create trigger enqueue_movie_refresh_on_movie_change
after insert or update of
  slug, name, content, poster_url, thumb_url, trailer_url, status,
  episode_current, episode_total, current_episode, total_episodes,
  year, release_at, next_episode_at, schedule_type, release_day,
  is_published, seo_catalog_status, tmdb_popularity
on public.movies
for each row execute function public.enqueue_movie_refresh_after_movie_change();

drop trigger if exists reconcile_movie_after_movie_episode_change on public.movie_episodes;
drop trigger if exists enqueue_movie_refresh_after_movie_episode_change on public.movie_episodes;
create trigger enqueue_movie_refresh_after_movie_episode_change
after insert or update of movie_id, episode_number, link_m3u8, link_embed or delete
on public.movie_episodes
for each row execute function public.enqueue_movie_refresh_after_episode_change();

drop trigger if exists reconcile_movie_after_episode_change on public.episodes;
drop trigger if exists enqueue_movie_refresh_after_episode_change on public.episodes;
create trigger enqueue_movie_refresh_after_episode_change
after insert or update of movie_id, episode_number, link_m3u8, link_embed or delete
on public.episodes
for each row execute function public.enqueue_movie_refresh_after_episode_change();

create or replace function public.reconcile_movie_release_state(p_movie_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  max_episode integer := 0;
  declared_total integer := 0;
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

  select greatest(
    coalesce(total_episodes, 0),
    coalesce(nullif(substring(coalesce(episode_total, '') from '([0-9]+)'), '')::integer, 0)
  )
  into declared_total
  from public.movies
  where id = p_movie_id;

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
        when lower(coalesce(episode_current, '')) ~ '(trailer|sap chieu|dang cap nhat)'
          or coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::integer, 0) < max_episode
          then 'Tập ' || max_episode::text
        else episode_current
      end,
      current_episode = max_episode,
      updated_at = case
        when coalesce(current_episode, 0) <> max_episode
          or lower(coalesce(status, '')) in ('upcoming', 'trailer', 'returning series', 'in production')
          or lower(coalesce(episode_current, '')) ~ '(trailer|sap chieu|dang cap nhat)'
          or coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::integer, 0) < max_episode
          then now()
        else updated_at
      end
    where id = p_movie_id
      and is_published is true;
  end if;

  return max_episode;
end;
$$;

create or replace function public.process_movie_refresh_queue(p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  processed integer := 0;
begin
  perform set_config('app.movie_refresh_processing', '1', true);

  for item in
    select q.movie_id
    from public.movie_refresh_queue q
    where q.next_attempt_at <= now()
    order by q.requested_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  loop
    begin
      perform public.reconcile_movie_release_state(item.movie_id);
      perform public.refresh_movie_seo_quality(item.movie_id);
      delete from public.movie_refresh_queue where movie_id = item.movie_id;
      processed := processed + 1;
    exception when others then
      update public.movie_refresh_queue
      set
        attempts = attempts + 1,
        last_error = left(sqlerrm, 1000),
        next_attempt_at = now() + make_interval(
          mins => least(60, greatest(1, power(2, least(attempts, 5))::integer))
        )
      where movie_id = item.movie_id;
    end;
  end loop;

  perform set_config('app.movie_refresh_processing', '0', true);
  return processed;
end;
$$;

revoke all on function public.process_movie_refresh_queue(integer) from public, anon, authenticated;
grant execute on function public.process_movie_refresh_queue(integer) to service_role;

-- Preserve old RPC names for compatibility, but make them enqueue-only.
create or replace function public.refresh_recent_movie_seo_quality(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  queued integer := 0;
begin
  insert into public.movie_refresh_queue (movie_id, requested_at, next_attempt_at, reasons)
  select m.id, now(), now(), array['scheduled_quality_refresh']
  from public.movies m
  order by m.updated_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 200), 500))
  on conflict (movie_id) do update set
    requested_at = excluded.requested_at,
    next_attempt_at = least(public.movie_refresh_queue.next_attempt_at, now()),
    reasons = public.movie_refresh_queue.reasons || array['scheduled_quality_refresh'];
  get diagnostics queued = row_count;
  return queued;
end;
$$;

create or replace function public.refresh_ongoing_movie_seo_quality(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  queued integer := 0;
begin
  insert into public.movie_refresh_queue (movie_id, requested_at, next_attempt_at, reasons)
  select m.id, now(), now(), array['ongoing_freshness_refresh']
  from public.movies m
  where m.is_published is true
    and (
      lower(coalesce(m.status, '')) in ('ongoing', 'returning series', 'in production')
      or (coalesce(m.current_episode, 0) > 0 and coalesce(m.total_episodes, 0) > coalesce(m.current_episode, 0))
      or m.next_episode_at >= now() - interval '14 days'
    )
  order by m.updated_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 100), 250))
  on conflict (movie_id) do update set
    requested_at = excluded.requested_at,
    next_attempt_at = least(public.movie_refresh_queue.next_attempt_at, now()),
    reasons = public.movie_refresh_queue.reasons || array['ongoing_freshness_refresh'];
  get diagnostics queued = row_count;
  return queued;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname in (
      'refresh-movie-seo-quality-hourly',
      'refresh-ongoing-movie-seo-quality',
      'process-movie-refresh-queue',
      'queue-ongoing-movie-seo-quality'
    );

    perform cron.schedule(
      'process-movie-refresh-queue',
      '* * * * *',
      $cmd$select public.process_movie_refresh_queue(10);$cmd$
    );

    perform cron.schedule(
      'queue-ongoing-movie-seo-quality',
      '17 3 * * *',
      $cmd$select public.refresh_ongoing_movie_seo_quality(100);$cmd$
    );
  end if;
end $$;

-- Repair the affected recent catalog gradually instead of blocking this migration.
insert into public.movie_refresh_queue (movie_id, requested_at, next_attempt_at, reasons)
select m.id, now(), now(), array['migration_recovery']
from public.movies m
where m.is_published is true
  and (
    m.updated_at >= now() - interval '14 days'
    or lower(coalesce(m.status, '')) in ('ongoing', 'upcoming', 'trailer')
  )
order by m.updated_at desc nulls last
limit 250
on conflict (movie_id) do update set
  next_attempt_at = least(public.movie_refresh_queue.next_attempt_at, now()),
  reasons = public.movie_refresh_queue.reasons || array['migration_recovery'];

comment on table public.movie_refresh_queue is
  'Deduplicated boundary between ingestion and movie lifecycle/SEO brains; prevents per-row sync fan-out.';
