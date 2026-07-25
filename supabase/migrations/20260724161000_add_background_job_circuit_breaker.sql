create table if not exists public.background_job_pause_state (
  jobid bigint primary key,
  jobname text not null,
  was_active boolean not null,
  captured_at timestamptz not null default now()
);

alter table public.background_job_pause_state enable row level security;
revoke all on table public.background_job_pause_state from public, anon, authenticated;
grant select, insert, update, delete on table public.background_job_pause_state to service_role;

create or replace function public.set_background_jobs_paused(p_paused boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, cron, pg_temp
as $$
declare
  changed integer := 0;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return jsonb_build_object('paused', p_paused, 'changed', 0, 'reason', 'pg_cron unavailable');
  end if;

  if p_paused then
    insert into public.background_job_pause_state(jobid, jobname, was_active, captured_at)
    select jobid, jobname, active, now()
    from cron.job
    on conflict (jobid) do update set
      jobname = excluded.jobname,
      was_active = excluded.was_active,
      captured_at = excluded.captured_at;

    perform cron.alter_job(jobid, active := false)
    from cron.job
    where active = true;
    get diagnostics changed = row_count;
  else
    perform cron.alter_job(j.jobid, active := s.was_active)
    from cron.job j
    join public.background_job_pause_state s on s.jobid = j.jobid;
    get diagnostics changed = row_count;
    truncate public.background_job_pause_state;
  end if;

  return jsonb_build_object('paused', p_paused, 'changed', changed, 'at', now());
end;
$$;

revoke all on function public.set_background_jobs_paused(boolean) from public, anon, authenticated;
grant execute on function public.set_background_jobs_paused(boolean) to service_role;

comment on function public.set_background_jobs_paused(boolean) is
  'Reversible circuit breaker for isolating viewer-read incidents from all pg_cron background work.';
