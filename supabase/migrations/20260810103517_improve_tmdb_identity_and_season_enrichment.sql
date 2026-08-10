create or replace function public.get_tmdb_metadata_enrichment_candidates(p_limit integer default 15)
returns setof public.movies
language sql
security definer
set search_path = public, pg_temp
as $$
  select m.*
  from public.movies m
  left join public.movie_tmdb_enrichment_status s on s.movie_id = m.id
  left join public.movie_seo_quality_status q on q.movie_id = m.id
  where m.is_published is true
    and (
      m.tmdb_id is null
      or length(trim(regexp_replace(coalesce(m.content, ''), '<[^>]+>', ' ', 'g'))) < 80
      or coalesce(array_length(m.actor, 1), 0) = 0
      or coalesce(array_length(m.director, 1), 0) = 0
      or coalesce(jsonb_array_length(m.category), 0) = 0
      or coalesce(jsonb_array_length(m.country), 0) = 0
      or (length(trim(coalesce(m.poster_url, ''))) = 0 and length(trim(coalesce(m.thumb_url, ''))) = 0)
    )
    and (
      s.movie_id is null
      or (s.status in ('enriched', 'verified_no_change') and m.updated_at > s.attempted_at)
      or (s.status = 'retryable_error' and s.attempted_at < now() - interval '6 hours')
      or (s.status = 'skipped_identity' and s.attempted_at < now() - interval '30 days')
    )
  order by
    coalesce(q.eligible_for_index, false) desc,
    case when m.tmdb_id is null then 0 else 1 end,
    m.updated_at desc nulls last,
    m.id
  limit greatest(1, least(coalesce(p_limit, 15), 15));
$$;

revoke all on function public.get_tmdb_metadata_enrichment_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_tmdb_metadata_enrichment_candidates(integer) to service_role;

create or replace function public.is_duplicate_series_season_content(p_movie_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select
      id,
      content,
      lower(regexp_replace(
        coalesce(nullif(trim(origin_name), ''), nullif(trim(name), '')),
        '(\s*[-–—:]?\s*)?(\(|\[)?(season|phần|mùa)\s*[0-9]{1,2}(\)|\])?\s*$',
        '',
        'i'
      )) as base_title
    from public.movies
    where id = p_movie_id
      and is_published is true
      and coalesce(content, '') <> ''
      and coalesce(nullif(trim(origin_name), ''), nullif(trim(name), '')) ~* '(season|phần|mùa)\s*[0-9]{1,2}'
  )
  select exists (
    select 1
    from target t
    join public.movies other
      on other.id <> t.id
     and other.is_published is true
     and other.content = t.content
     and lower(regexp_replace(
       coalesce(nullif(trim(other.origin_name), ''), nullif(trim(other.name), '')),
       '(\s*[-–—:]?\s*)?(\(|\[)?(season|phần|mùa)\s*[0-9]{1,2}(\)|\])?\s*$',
       '',
       'i'
     )) = t.base_title
     and coalesce(nullif(trim(other.origin_name), ''), nullif(trim(other.name), '')) ~* '(season|phần|mùa)\s*[0-9]{1,2}'
  );
$$;

revoke all on function public.is_duplicate_series_season_content(uuid) from public, anon, authenticated;
grant execute on function public.is_duplicate_series_season_content(uuid) to service_role;

do $scheduler$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'enrich-tmdb-metadata-offpeak';

    perform cron.schedule(
      'enrich-tmdb-metadata-offpeak',
      '7-57/10 17-22 * * *',
      $job$
        select net.http_post(
          url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/enrich-tmdb-metadata',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
          ),
          body := '{"limit":15}'::jsonb,
          timeout_milliseconds := 120000
        );
      $job$
    );
  end if;

  if to_regclass('public.runtime_capacity_managed_jobs') is not null then
    insert into public.runtime_capacity_managed_jobs (job_name)
    values ('enrich-tmdb-metadata-offpeak')
    on conflict (job_name) do nothing;
  end if;
end;
$scheduler$;

comment on function public.get_tmdb_metadata_enrichment_candidates(integer) is
  'Prioritizes index-eligible movies and includes missing TMDB identities. The worker still requires one exact title, year, and media-type match before any write.';

comment on function public.is_duplicate_series_season_content(uuid) is
  'Allows replacement of a season synopsis only when another published season of the same normalized series has exactly the same existing content.';
