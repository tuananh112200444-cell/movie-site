-- Detect provider episodes whose structured filename proves they belong to a
-- different same-year movie.  Detection is bounded and runs only off-peak;
-- repair is delegated to the existing identity-checked targeted sync.

create or replace function public.scan_episode_identity_mismatches(p_batch_size integer default 400)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch_size integer := greatest(100, least(coalesce(p_batch_size, 400), 800));
  scan_page integer := 1;
  scan_offset integer := 0;
  scanned integer := 0;
  detected integer := 0;
  next_page integer := 1;
begin
  select greatest(1, coalesce(page, 1)) into scan_page
  from public.sync_cursors
  where key = 'episode-identity-integrity-scan'
  limit 1;

  scan_page := coalesce(scan_page, 1);
  scan_offset := (scan_page - 1) * batch_size;

  create temporary table identity_scan_movies on commit drop as
  select m.id,m.slug,m.name,m.origin_name,m.title_vi,m.title_en,m.title_original,
         m.year,m.source_site,m.source_name,m.is_published
  from public.movies m
  order by m.id
  offset scan_offset
  limit batch_size;
  get diagnostics scanned = row_count;

  if scanned = 0 and scan_page > 1 then
    scan_page := 1;
    scan_offset := 0;
    truncate identity_scan_movies;
    insert into identity_scan_movies
    select m.id,m.slug,m.name,m.origin_name,m.title_vi,m.title_en,m.title_original,
           m.year,m.source_site,m.source_name,m.is_published
    from public.movies m
    order by m.id
    limit batch_size;
    get diagnostics scanned = row_count;
  end if;
  create index on identity_scan_movies(id);

  create temporary table structured_foreign_identity on commit drop as
  select
    m.id as movie_id,
    m.slug,
    m.year as movie_year,
    trim(split_part(e.server_data->>'filename', ' - ', 1)) as foreign_name,
    trim(split_part(e.server_data->>'filename', ' - ', 2)) as foreign_origin,
    nullif(substring(split_part(e.server_data->>'filename', ' - ', 3) from '([12][0-9]{3})'), '')::integer as foreign_year,
    count(*)::integer as episode_rows,
    min(nullif(e.ophim_id, '')) as foreign_source_id,
    min(e.server_data->>'filename') as sample_filename
  from identity_scan_movies m
  join public.episodes e on e.movie_id = m.id
  where coalesce(e.server_data->>'filename', '') like '% - % - %'
  group by m.id,m.slug,m.year,
           trim(split_part(e.server_data->>'filename', ' - ', 1)),
           trim(split_part(e.server_data->>'filename', ' - ', 2)),
           nullif(substring(split_part(e.server_data->>'filename', ' - ', 3) from '([12][0-9]{3})'), '')::integer;

  delete from structured_foreign_identity f
  using identity_scan_movies m
  where m.id = f.movie_id
    and (
      f.foreign_year is null
      or f.foreign_name = ''
      or f.foreign_origin = ''
      or lower(f.foreign_name) = any(array[
        lower(trim(coalesce(m.name,''))), lower(trim(coalesce(m.origin_name,''))),
        lower(trim(coalesce(m.title_vi,''))), lower(trim(coalesce(m.title_en,''))),
        lower(trim(coalesce(m.title_original,'')))
      ])
      or lower(f.foreign_origin) = any(array[
        lower(trim(coalesce(m.name,''))), lower(trim(coalesce(m.origin_name,''))),
        lower(trim(coalesce(m.title_vi,''))), lower(trim(coalesce(m.title_en,''))),
        lower(trim(coalesce(m.title_original,'')))
      ])
    );

  create temporary table detected_identity_issues on commit drop as
  select
    f.movie_id,
    (array_agg(related.id order by related.id::text))[1] as related_movie_id,
    sum(f.episode_rows)::integer as episode_rows,
    jsonb_agg(jsonb_build_object(
      'foreign_name', f.foreign_name,
      'foreign_origin', f.foreign_origin,
      'foreign_year', f.foreign_year,
      'foreign_source_id', f.foreign_source_id,
      'sample_filename', f.sample_filename,
      'episode_rows', f.episode_rows
    ) order by f.foreign_name) as signatures
  from structured_foreign_identity f
  join lateral (
    select other.id
    from public.movies other
    where other.id <> f.movie_id
      and other.year = f.foreign_year
      and (
        lower(trim(coalesce(other.name,''))) in (lower(f.foreign_name), lower(f.foreign_origin))
        or lower(trim(coalesce(other.origin_name,''))) in (lower(f.foreign_name), lower(f.foreign_origin))
        or lower(trim(coalesce(other.title_vi,''))) in (lower(f.foreign_name), lower(f.foreign_origin))
        or lower(trim(coalesce(other.title_en,''))) in (lower(f.foreign_name), lower(f.foreign_origin))
        or lower(trim(coalesce(other.title_original,''))) in (lower(f.foreign_name), lower(f.foreign_origin))
      )
    order by other.is_published desc,coalesce(other.current_episode,0) desc,other.id
    limit 1
  ) related on true
  group by f.movie_id;

  insert into public.catalog_integrity_issues as issue (
    issue_key,issue_type,movie_id,related_movie_id,severity,confidence,status,
    evidence,first_detected_at,last_detected_at,resolved_at,attempts,last_error
  )
  select
    'episode_identity_mismatch:' || d.movie_id,
    'episode_identity_mismatch',d.movie_id,d.related_movie_id,5,1,'open',
    jsonb_build_object('episode_rows',d.episode_rows,'signatures',d.signatures),
    now(),now(),null,0,null
  from detected_identity_issues d
  on conflict (issue_key) do update set
    related_movie_id = excluded.related_movie_id,
    severity = excluded.severity,
    confidence = excluded.confidence,
    status = case when issue.status = 'ignored' then 'ignored' else 'open' end,
    evidence = excluded.evidence,
    last_detected_at = now(),
    resolved_at = null,
    attempts = case when issue.status = 'resolved' then 0 else issue.attempts end,
    last_error = null;
  get diagnostics detected = row_count;

  update public.catalog_integrity_issues issue
  set status='resolved',resolved_at=now(),last_detected_at=now(),last_error=null
  where issue.issue_type='episode_identity_mismatch'
    and issue.movie_id in (select id from identity_scan_movies)
    and issue.status in ('open','repairing')
    and not exists (select 1 from detected_identity_issues d where d.movie_id=issue.movie_id);

  next_page := case when scanned < batch_size then 1 else scan_page + 1 end;
  insert into public.sync_cursors(key,page,updated_at)
  values ('episode-identity-integrity-scan',next_page,now())
  on conflict (key) do update set page=excluded.page,updated_at=excluded.updated_at;

  return jsonb_build_object('scanned',scanned,'page',scan_page,'next_page',next_page,'detected',detected);
end;
$$;

revoke all on function public.scan_episode_identity_mismatches(integer) from public,anon,authenticated;
grant execute on function public.scan_episode_identity_mismatches(integer) to service_role;

-- Extend the existing low-concurrency dispatcher; identity repair is excluded
-- during the two viewer peaks (11:00-14:59 and 19:00-23:59 Vietnam time).
create or replace function public.dispatch_catalog_source_repairs(p_limit integer default 3)
returns jsonb
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  item record;
  request_id bigint;
  dispatched integer := 0;
  cron_secret text;
  provider text;
  vn_hour integer := extract(hour from now() at time zone 'Asia/Ho_Chi_Minh');
begin
  perform public.reconcile_catalog_source_repairs();

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name='CRON_SECRET'
  order by created_at desc limit 1;
  if nullif(cron_secret,'') is null then
    return jsonb_build_object('dispatched',0,'error','CRON_SECRET unavailable');
  end if;

  for item in
    select issue.issue_key,issue.movie_id,issue.attempts,
           lower(coalesce(movie.source_site,'')) as source_site,issue.issue_type
    from public.catalog_integrity_issues issue
    join public.movies movie on movie.id=issue.movie_id
    where issue.status='open'
      and issue.issue_type in (
        'published_without_playback','episode_count_mismatch','episode_sequence_gap','episode_identity_mismatch'
      )
      and issue.attempts < 3
      and lower(coalesce(movie.source_site,'')) in ('ophim','ophim1.com','phimapi')
      and (
        issue.issue_type <> 'episode_identity_mismatch'
        or (vn_hour not between 11 and 14 and vn_hour not between 19 and 23)
      )
    order by
      case when issue.issue_type='episode_identity_mismatch' then 0
           when movie.is_published is true and issue.issue_type in ('episode_count_mismatch','episode_sequence_gap') then 1
           when movie.is_published is true then 2 else 3 end,
      issue.severity desc,issue.first_detected_at,issue.issue_key
    for update of issue skip locked
    limit greatest(1,least(coalesce(p_limit,3),6))
  loop
    provider := case
      when item.attempts=0 and item.source_site='phimapi' then 'kkphim'
      when item.attempts=0 then 'ophim'
      when item.source_site='phimapi' then 'ophim'
      else 'kkphim' end;

    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies'
        || '?movie_id=' || item.movie_id || '&provider=' || provider
        || '&episodes=1&strict_missing_detail=1',
      headers := jsonb_build_object('x-cron-secret',cron_secret),
      timeout_milliseconds := 120000
    ) into request_id;

    update public.catalog_integrity_issues
    set status='repairing',attempts=attempts+1,last_error=null,
        evidence=evidence || jsonb_build_object(
          'repair_provider',provider,'repair_request_id',request_id,
          'repair_movie_id',item.movie_id,'repair_dispatched_at',now()
        )
    where issue_key=item.issue_key;
    dispatched := dispatched + 1;
  end loop;
  return jsonb_build_object('dispatched',dispatched);
end;
$$;

revoke all on function public.dispatch_catalog_source_repairs(integer) from public,anon,authenticated;
grant execute on function public.dispatch_catalog_source_repairs(integer) to service_role;

do $scheduler$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    if exists (select 1 from cron.job where jobname='scan-episode-identity-offpeak') then
      perform cron.unschedule(jobid) from cron.job where jobname='scan-episode-identity-offpeak';
    end if;
    perform cron.schedule(
      'scan-episode-identity-offpeak',
      '7-57/10 17-23,0-3,8-11 * * *',
      'select public.scan_episode_identity_mismatches(400);'
    );
  end if;
end;
$scheduler$;

-- Correct the reported proven cross-wire immediately.  The foreign movie
-- already has its own complete canonical row, so no playback data is lost.
do $repair_lau_chu_hoa$
declare
  target_id uuid := '510f2c4e-40d0-4474-bfed-97f9874cd7be';
  foreign_id text := '33f68c58d409a7d8a1524d062a44b5d8';
  removed integer := 0;
begin
  delete from public.streams
  where movie_id=target_id and ophim_id=foreign_id;
  delete from public.movie_episodes
  where movie_id=target_id and ophim_id=foreign_id;
  delete from public.episodes
  where movie_id=target_id and ophim_id=foreign_id
    and coalesce(server_data->>'filename','') like 'Ngoảnh Đầu Lại Lau Nước Mắt Cho Cậu - Smile After Tears - 2026 - %';
  get diagnostics removed = row_count;

  update public.movies
  set current_episode=0,total_episodes=1,episode_current='Trailer',episode_total='1 Tập',
      last_synced_at=now(),updated_at=now()
  where id=target_id;

  delete from public.movie_api_cache where slug='lau-chu-hoa';
  insert into public.movie_refresh_queue(movie_id,requested_at,next_attempt_at,reasons,attempts,last_error)
  values (target_id,now(),now(),array['episode_identity_mismatch'],0,null)
  on conflict (movie_id) do update set
    requested_at=excluded.requested_at,next_attempt_at=least(movie_refresh_queue.next_attempt_at,now()),
    reasons=(select array_agg(distinct reason) from unnest(movie_refresh_queue.reasons || excluded.reasons) reason),
    attempts=0,last_error=null;

  insert into public.catalog_integrity_issues (
    issue_key,issue_type,movie_id,related_movie_id,severity,confidence,status,evidence,
    first_detected_at,last_detected_at,resolved_at,attempts,last_error
  ) values (
    'episode_identity_mismatch:' || target_id,'episode_identity_mismatch',target_id,
    '4d071715-2c73-482f-8153-cc4fc4c1789a',5,1,'resolved',
    jsonb_build_object('removed_episode_rows',removed,'foreign_source_id',foreign_id,
      'foreign_title','Ngoảnh Đầu Lại Lau Nước Mắt Cho Cậu','verified_target','Lầu Chú Hỏa'),
    now(),now(),now(),0,null
  ) on conflict (issue_key) do update set
    related_movie_id=excluded.related_movie_id,status='resolved',evidence=excluded.evidence,
    last_detected_at=now(),resolved_at=now(),attempts=0,last_error=null;
end;
$repair_lau_chu_hoa$;

comment on function public.scan_episode_identity_mismatches(integer) is
  'Bounded off-peak detector for structured provider episode filenames that prove a cross-wired movie identity.';
