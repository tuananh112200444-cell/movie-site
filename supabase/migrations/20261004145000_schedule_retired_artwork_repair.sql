create or replace function public.get_retired_artwork_repair_candidates(p_limit integer default 5)
returns setof public.movies
language sql
security definer
set search_path = public, pg_temp
as $$
  select m.*
  from public.movies m
  left join public.movie_tmdb_enrichment_status s on s.movie_id = m.id
  where m.is_published is true
    and m.superseded_by_movie_id is null
    and (length(trim(coalesce(m.poster_url, ''))) = 0
      or m.poster_url ~* '^https://phim\.nguonc\.com/public/images/')
    and (length(trim(coalesce(m.thumb_url, ''))) = 0
      or m.thumb_url ~* '^https://phim\.nguonc\.com/public/images/')
    and (
      s.movie_id is null
      or coalesce(s.metadata->>'artwork_repair', '') <> 'kkphim'
      or (s.status = 'retryable_error' and s.attempted_at < now() - interval '6 hours')
      or (s.status = 'skipped_identity' and s.attempted_at < now() - interval '30 days')
    )
  order by m.updated_at desc nulls last, m.id
  limit greatest(1, least(coalesce(p_limit, 5), 5));
$$;

revoke all on function public.get_retired_artwork_repair_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_retired_artwork_repair_candidates(integer) to service_role;

do $scheduler$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    -- TMDB repair remains disabled until a TMDB credential is explicitly
    -- configured in Singapore; otherwise it produces a 503 every ten minutes.
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'enrich-tmdb-metadata-offpeak';

    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'repair-retired-artwork-offpeak';

    perform cron.schedule(
      'repair-retired-artwork-offpeak',
      '3-58/5 17-22 * * *',
      $job$
        select net.http_post(
          url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/repair-retired-artwork',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
          ),
          body := '{"limit":5}'::jsonb,
          timeout_milliseconds := 120000
        );
      $job$
    );

    perform net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/repair-retired-artwork',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
      ),
      body := '{"limit":5}'::jsonb,
      timeout_milliseconds := 120000
    );
  end if;
end;
$scheduler$;
