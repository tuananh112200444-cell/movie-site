create table if not exists public.provider_catalog_backfill_state (
  provider text primary key check (provider in ('ophim','phimapi','vsmov','nguonc')),
  status text not null default 'pending' check (status in ('pending','running','complete','paused','error')),
  next_page integer not null default 1 check (next_page > 0),
  total_pages integer not null default 0 check (total_pages >= 0),
  movies_scanned bigint not null default 0,
  movies_created bigint not null default 0,
  movies_updated bigint not null default 0,
  episodes_inserted bigint not null default 0,
  error_count bigint not null default 0,
  last_error text not null default '',
  last_batch jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.provider_catalog_backfill_state enable row level security;
revoke all on table public.provider_catalog_backfill_state from public, anon, authenticated;
grant all on table public.provider_catalog_backfill_state to service_role;

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
    status = excluded.status,
    next_page = excluded.next_page,
    total_pages = greatest(state.total_pages,excluded.total_pages),
    movies_scanned = state.movies_scanned + excluded.movies_scanned,
    movies_created = state.movies_created + excluded.movies_created,
    movies_updated = state.movies_updated + excluded.movies_updated,
    episodes_inserted = state.episodes_inserted + excluded.episodes_inserted,
    error_count = state.error_count + excluded.error_count,
    last_error = excluded.last_error,
    last_batch = excluded.last_batch,
    started_at = coalesce(state.started_at,now()),
    completed_at = case when complete then now() else null end,
    updated_at = now()
  returning * into result;
  return result;
end;
$function$;

revoke all on function public.record_provider_catalog_backfill_batch(text,integer,integer,integer,integer,integer,integer,integer,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.record_provider_catalog_backfill_batch(text,integer,integer,integer,integer,integer,integer,integer,text,jsonb)
  to service_role;

create or replace function public.provider_catalog_storage_status()
returns table(database_bytes bigint, soft_limit_bytes bigint, can_continue boolean)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
  select
    pg_database_size(current_database()),
    7516192768::bigint,
    pg_database_size(current_database()) < 7516192768::bigint;
$function$;

revoke all on function public.provider_catalog_storage_status() from public, anon, authenticated;
grant execute on function public.provider_catalog_storage_status() to service_role;
