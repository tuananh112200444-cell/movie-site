-- Keep scheduler credentials out of URLs and cron.job command text.
-- Create the matching Vault secret once with:
--   select vault.create_secret('<same value as Edge CRON_SECRET>', 'CRON_SECRET');
do $$
declare
  cron_secret text;
begin
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'CRON_SECRET'
  order by created_at desc
  limit 1;

  if coalesce(length(cron_secret), 0) < 32 then
    raise exception 'Vault secret CRON_SECRET is missing or shorter than 32 characters';
  end if;

  perform cron.unschedule(jobname) from cron.job where jobname in (
    'sync-blvietsub-feed-every-15-minutes',
    'sync-blvietsub-feed-backfill-every-30-minutes',
    'repair-blvietsub-smart-every-15-minutes',
    'sync-ophim-priority-every-15-minutes',
    'sync-kkphim-priority-every-15-minutes'
  );

  perform cron.schedule('sync-blvietsub-feed-every-15-minutes', '3,18,33,48 * * * *',
    $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-blvietsub-feed?limit=24&offset=0&page_size=150&refresh_search=0', headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)), timeout_milliseconds := 120000);$cmd$);
  perform cron.schedule('sync-blvietsub-feed-backfill-every-30-minutes', '8,38 * * * *',
    $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-blvietsub-feed?limit=12&use_cursor=1&cursor_key=blvietsub_sitemap_external&refresh_search=0', headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)), timeout_milliseconds := 120000);$cmd$);
  perform cron.schedule('repair-blvietsub-smart-every-15-minutes', '11,26,41,56 * * * *',
    $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-blvietsub-feed?repair_existing=1&limit=4&refresh_search=0', headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)), timeout_milliseconds := 120000);$cmd$);
  perform cron.schedule('sync-ophim-priority-every-15-minutes', '1,16,31,46 * * * *',
    $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies?provider=ophim&pages=1&limit=8&episodes=1', headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)), timeout_milliseconds := 150000);$cmd$);
  perform cron.schedule('sync-kkphim-priority-every-15-minutes', '6,21,36,51 * * * *',
    $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies?provider=kkphim&pages=1&limit=8&episodes=1', headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)), timeout_milliseconds := 150000);$cmd$);
end $$;

-- Operational audit is callable only by service_role and makes schema drift observable.
create or replace function public.database_security_audit()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'tables_without_rls', coalesce((
      select jsonb_agg(c.relname order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    ), '[]'::jsonb),
    'public_execute_security_definer', coalesce((
      select jsonb_agg(p.proname order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
    ), '[]'::jsonb),
    'generated_at', now()
  );
$$;
revoke all on function public.database_security_audit() from public, anon, authenticated;
grant execute on function public.database_security_audit() to service_role;
