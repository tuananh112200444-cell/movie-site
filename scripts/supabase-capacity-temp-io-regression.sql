-- Simulate temp-file pressure against the installed guard and roll back every change.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
update public.runtime_capacity_samples set sampled_at=now()-interval '120 seconds',temp_bytes=(select greatest(0,temp_bytes-536870912) from pg_stat_database where datname=current_database()) where singleton;
do $check$ declare s public.runtime_capacity_state; begin
 s:=public.evaluate_runtime_capacity();
 if (s.last_reason->>'scan_pressure')::boolean is distinct from true then raise exception 'Guard failed to detect temporary IO pressure'; end if;
end; $check$;
rollback;
