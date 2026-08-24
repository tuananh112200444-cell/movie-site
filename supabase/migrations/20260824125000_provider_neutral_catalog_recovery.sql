-- Provider-neutral recovery: one movie identity, many equal playback sources.
-- OPhim transport remains retired, but its catalogue metadata must not make a
-- movie disappear when KKPhim, VSMov, NguonC, BLVietsub or GLVietsub can play it.

begin;

-- Stop the old policy before it can unpublish thousands of catalogue rows.
do $stop_destructive_retirement$
declare
  job record;
begin
  if to_regnamespace('cron') is null then return; end if;
  for job in
    select jobid from cron.job
    where jobname in ('retire-ophim-playback-offpeak', 'retire-ophim-playback-offpeak-tail')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end;
$stop_destructive_retirement$;

-- Keep physical OPhim stream retirement idempotent, but never mutate movie
-- publication or catalogue ownership here. Publication is decided only by the
-- provider-neutral playback reconciliation path.
create or replace function public.retire_ophim_playback_batch(
  p_stream_limit integer default 10000,
  p_movie_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  retired_streams integer := 0;
begin
  with target as materialized (
    select stream.id
    from public.streams stream
    where stream.is_active is true
      and public.is_retired_playback_source(
        coalesce(stream.provider_key, stream.source),
        stream.server_name,
        stream.stream_url,
        stream.embed_url
      )
    order by stream.updated_at nulls first, stream.id
    limit greatest(1, least(coalesce(p_stream_limit, 10000), 20000))
    for update skip locked
  )
  update public.streams stream
  set is_active = false,
      health_status = 'blocked',
      failure_count = greatest(coalesce(stream.failure_count, 0), 3),
      priority = 0,
      playback_score = 0,
      last_failure_at = coalesce(stream.last_failure_at, now()),
      last_error = 'Provider retired: OPhim/opstream is excluded from KhoPhim playback',
      updated_at = now()
  from target
  where stream.id = target.id;
  get diagnostics retired_streams = row_count;

  return jsonb_build_object(
    'retired_streams', retired_streams,
    'relabeled_movies', 0,
    'hidden_movies', 0,
    'effective_policy', 'provider_neutral_catalog_ophim_transport_retired'
  );
end;
$$;

comment on function public.retire_ophim_playback_batch(integer,integer) is
  'Retires only broken OPhim transport rows. Never hides or relabels the canonical movie.';

-- Every healthy provider is equal. Identity, completeness, health and latency
-- determine the chosen source; provider branding does not.
insert into public.provider_operational_policy(
  provider,ingest_enabled,playback_mode,playback_penalty,reason,reviewed_at,updated_at
)
values
  ('ophim',false,'disabled',100000,'OPhim playback transport retired; catalogue metadata retained',now(),now()),
  ('kkphim',true,'normal',0,'',now(),now()),
  ('nguonc',true,'normal',0,'',now(),now()),
  ('vsmov',true,'normal',0,'',now(),now())
on conflict(provider) do update set
  ingest_enabled=excluded.ingest_enabled,
  playback_mode=excluded.playback_mode,
  playback_penalty=excluded.playback_penalty,
  reason=excluded.reason,
  reviewed_at=now(),
  updated_at=now();

-- Verified canonical repair: the public OPhim shell "quang-uyen" and the
-- complete BLVietsub row are the same title. Preserve the old URL as an alias.
do $repair_quang_uyen$
declare
  source_movie public.movies;
  target_movie public.movies;
begin
  select * into source_movie from public.movies where slug='quang-uyen' for update;
  select * into target_movie from public.movies where slug='blvietsub-6219-quang-uyen-doc-tham' for update;
  if source_movie.id is null or target_movie.id is null then return; end if;
  if not public.movie_has_usable_persisted_playback(target_movie.id) then return; end if;

  insert into public.movie_slug_aliases(alias_slug,movie_id,canonical_slug,reason,updated_at)
  values(source_movie.slug,target_movie.id,target_movie.slug,'verified-provider-neutral-alias',now())
  on conflict(alias_slug) do update set
    movie_id=excluded.movie_id,
    canonical_slug=excluded.canonical_slug,
    reason=excluded.reason,
    updated_at=now();

  update public.movies
  set is_published=false,
      seo_catalog_status='superseded',
      superseded_by_movie_id=target_movie.id,
      source_site='merged',
      source_name='Merged into '||target_movie.slug,
      updated_at=now()
  where id=source_movie.id;

  delete from public.movie_api_cache where slug in (source_movie.slug,target_movie.slug);
end;
$repair_quang_uyen$;

-- Restart complete independent-provider catalogue backfill from page one.
-- Earlier priority jobs advanced a page after importing only four of its 24
-- entries, leaving most provider identities permanently unregistered.
insert into public.provider_catalog_backfill_state as state(
  provider,status,next_page,total_pages,movies_scanned,movies_created,
  movies_updated,episodes_inserted,error_count,last_error,last_batch,
  started_at,completed_at,updated_at
)
values
  ('phimapi','pending',1,0,0,0,0,0,0,'','{}'::jsonb,null,null,now()),
  ('vsmov','pending',1,0,0,0,0,0,0,'','{}'::jsonb,null,null,now()),
  ('nguonc','pending',1,0,0,0,0,0,0,'','{}'::jsonb,null,null,now())
on conflict(provider) do update set
  status='pending', next_page=1, total_pages=0,
  movies_scanned=0, movies_created=0, movies_updated=0,
  episodes_inserted=0, error_count=0, last_error='', last_batch='{}'::jsonb,
  started_at=null, completed_at=null, updated_at=now();

insert into public.sync_cursors(key,page,updated_at)
values
  ('provider-neutral:kkphim',1,now()),
  ('provider-neutral:vsmov',1,now()),
  ('provider-neutral:nguonc',1,now())
on conflict(key) do update set page=1, updated_at=now();

do $schedule_provider_neutral_backfill$
declare
  job record;
  base_url text := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-ophim-movies';
begin
  if to_regnamespace('cron') is null then return; end if;
  for job in
    select jobid from cron.job where jobname in (
      'provider-neutral-backfill-kkphim',
      'provider-neutral-backfill-vsmov',
      'provider-neutral-backfill-nguonc'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;

  -- UTC hours map to Vietnam night and shoulder periods. The Edge Function
  -- also refuses non-target batches during viewing peaks or capacity protect.
  perform cron.schedule(
    'provider-neutral-backfill-kkphim',
    '5,35 17-23,0-3,8-10 * * *',
    format($cmd$select net.http_get(url := %L, headers := jsonb_build_object('x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)), timeout_milliseconds := 180000);$cmd$,
      base_url||'?provider=kkphim&pages=1&limit=24&episodes=1&backfill=1&cursor_key=provider-neutral:kkphim')
  );
  perform cron.schedule(
    'provider-neutral-backfill-vsmov',
    '15,45 17-23,0-3,8-10 * * *',
    format($cmd$select net.http_get(url := %L, headers := jsonb_build_object('x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)), timeout_milliseconds := 180000);$cmd$,
      base_url||'?provider=vsmov&pages=1&limit=24&episodes=1&backfill=1&cursor_key=provider-neutral:vsmov')
  );
  perform cron.schedule(
    'provider-neutral-backfill-nguonc',
    '25,55 17-23,0-3,8-10 * * *',
    format($cmd$select net.http_get(url := %L, headers := jsonb_build_object('x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)), timeout_milliseconds := 180000);$cmd$,
      base_url||'?provider=nguonc&pages=1&limit=24&episodes=1&backfill=1&cursor_key=provider-neutral:nguonc')
  );
end;
$schedule_provider_neutral_backfill$;

insert into public.runtime_capacity_managed_jobs(job_name,paused_by_capacity_guard,paused_at,updated_at)
values
  ('provider-neutral-backfill-kkphim',false,null,now()),
  ('provider-neutral-backfill-vsmov',false,null,now()),
  ('provider-neutral-backfill-nguonc',false,null,now())
on conflict(job_name) do update set updated_at=now();

comment on table public.provider_movie_identities is
  'Provider-neutral identity map. Every provider slug points to one canonical movie; no provider owns canonical priority.';

commit;
