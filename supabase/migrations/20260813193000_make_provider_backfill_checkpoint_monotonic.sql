create or replace function public.record_provider_catalog_backfill_batch(
  p_provider text,
  p_next_page integer,
  p_total_pages integer,
  p_scanned integer,
  p_created integer,
  p_updated integer,
  p_episodes integer,
  p_errors integer,
  p_last_error text,
  p_batch jsonb
)
returns public.provider_catalog_backfill_state
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  result public.provider_catalog_backfill_state;
  complete boolean := p_total_pages > 0 and p_next_page > p_total_pages;
begin
  if p_provider not in ('ophim','phimapi','vsmov','nguonc') then
    raise exception 'unsupported provider';
  end if;

  insert into public.provider_catalog_backfill_state as state (
    provider,status,next_page,total_pages,movies_scanned,movies_created,
    movies_updated,episodes_inserted,error_count,last_error,last_batch,
    started_at,completed_at,updated_at
  ) values (
    p_provider,
    case when complete then 'complete' when p_errors > 0 then 'error' else 'running' end,
    greatest(1,p_next_page),greatest(0,p_total_pages),greatest(0,p_scanned),
    greatest(0,p_created),greatest(0,p_updated),greatest(0,p_episodes),
    greatest(0,p_errors),left(coalesce(p_last_error,''),2000),coalesce(p_batch,'{}'::jsonb),
    now(),case when complete then now() else null end,now()
  )
  on conflict (provider) do update set
    status = case
      when state.status = 'complete' or excluded.status = 'complete' then 'complete'
      when excluded.status = 'error' then 'error'
      else 'running'
    end,
    -- Concurrent pages may finish out of order. A completed later page must
    -- never be overwritten by a slower earlier response.
    next_page = greatest(state.next_page, excluded.next_page),
    total_pages = greatest(state.total_pages,excluded.total_pages),
    movies_scanned = state.movies_scanned + excluded.movies_scanned,
    movies_created = state.movies_created + excluded.movies_created,
    movies_updated = state.movies_updated + excluded.movies_updated,
    episodes_inserted = state.episodes_inserted + excluded.episodes_inserted,
    error_count = state.error_count + excluded.error_count,
    last_error = excluded.last_error,
    last_batch = excluded.last_batch,
    started_at = coalesce(state.started_at,now()),
    completed_at = case when state.status = 'complete' or complete then coalesce(state.completed_at,now()) else null end,
    updated_at = now()
  returning * into result;
  return result;
end;
$function$;

revoke all on function public.record_provider_catalog_backfill_batch(text,integer,integer,integer,integer,integer,integer,integer,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.record_provider_catalog_backfill_batch(text,integer,integer,integer,integer,integer,integer,integer,text,jsonb)
  to service_role;
