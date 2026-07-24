create or replace function public.claim_motchill_ongoing_for_sync(p_limit integer default 2)
returns table (
  id uuid,
  source_url text,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select m.id
    from public.movies m
    where m.source_site = 'motchill'
      and m.is_published is true
      and lower(coalesce(m.status, '')) = 'ongoing'
      and nullif(trim(m.source_url), '') is not null
    order by m.last_synced_at asc nulls first, m.updated_at asc
    limit greatest(1, least(coalesce(p_limit, 2), 16))
    for update skip locked
  )
  update public.movies m
  set last_synced_at = now()
  from candidates c
  where m.id = c.id
  returning m.id, m.source_url, m.name;
end;
$$;

revoke all on function public.claim_motchill_ongoing_for_sync(integer)
  from public, anon, authenticated;
grant execute on function public.claim_motchill_ongoing_for_sync(integer)
  to service_role;

do $$
begin
  if exists (
    select 1 from cron.job
    where jobname = 'recheck-motchill-ongoing-every-10-minutes'
  ) then
    perform cron.unschedule('recheck-motchill-ongoing-every-10-minutes');
  end if;

  perform cron.schedule(
    'recheck-motchill-ongoing-every-10-minutes',
    '7,17,27,37,47,57 * * * *',
    $cmd$select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-motchill-feed?repair_ongoing=1&limit=2',
      headers := jsonb_build_object(
        'x-cron-secret',
        (select decrypted_secret
         from vault.decrypted_secrets
         where name = 'CRON_SECRET'
         order by created_at desc
         limit 1)
      ),
      timeout_milliseconds := 120000
    );$cmd$
  );
end $$;

comment on function public.claim_motchill_ongoing_for_sync(integer) is
  'Atomically claims the stalest published ongoing Motchill movies. SKIP LOCKED prevents overlapping cron runs from syncing the same title.';
