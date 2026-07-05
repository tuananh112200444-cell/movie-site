drop index if exists public.idx_ping_logs_run_at;
drop index if exists public.player_error_events_event_type_idx;
drop index if exists public.idx_sync_logs_run_at;

drop policy if exists "Allow anon player error inserts" on public.player_error_events;

create or replace function public.kp_search_normalize(input text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions, pg_temp
as $function$
  select trim(regexp_replace(regexp_replace(
    translate(
      lower(coalesce(input, '')),
      'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    ),
    '[^a-z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'));
$function$;

select cron.schedule(
  'cleanup-observability-logs-daily',
  '35 2 * * *',
  $$
    delete from public.player_error_events where created_at < now() - interval '30 days';
    delete from public.stream_health_logs where created_at < now() - interval '14 days';
    delete from public.sync_logs where run_at < now() - interval '45 days';
  $$
)
where not exists (
  select 1 from cron.job where jobname = 'cleanup-observability-logs-daily'
);
