create table if not exists public.movie_tmdb_enrichment_status (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  status text not null check (status in ('enriched', 'verified_no_change', 'skipped_identity', 'retryable_error')),
  attempted_at timestamptz not null default now(),
  enriched_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists movie_tmdb_enrichment_retry_idx
  on public.movie_tmdb_enrichment_status (status, attempted_at asc);

alter table public.movie_tmdb_enrichment_status enable row level security;
revoke all on table public.movie_tmdb_enrichment_status from public, anon, authenticated;
grant all on table public.movie_tmdb_enrichment_status to service_role;

do $scheduler$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'enrich-tmdb-metadata-offpeak';

    perform cron.schedule(
      'enrich-tmdb-metadata-offpeak',
      '7 0,9,17 * * *',
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

comment on table public.movie_tmdb_enrichment_status is
  'Audit trail for conservative TMDB metadata enrichment. It never authorizes stream, episode, slug, or source-title changes.';
