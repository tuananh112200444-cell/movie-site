-- Manual incident rollback only. Does not re-enable OPhim ingestion.
-- Review before running: restores the transport rows archived by this retirement.
begin;set local lock_timeout='3s';set local statement_timeout='60s';
insert into public.streams select r.* from private.ophim_retirement_backup b
cross join lateral jsonb_populate_record(null::public.streams,b.payload) r
where b.table_name='streams' on conflict do nothing;
insert into public.movie_episodes select r.* from private.ophim_retirement_backup b
cross join lateral jsonb_populate_record(null::public.movie_episodes,b.payload) r
where b.table_name='movie_episodes' on conflict do nothing;
insert into public.episodes select r.* from private.ophim_retirement_backup b
cross join lateral jsonb_populate_record(null::public.episodes,b.payload) r
where b.table_name='episodes' on conflict do nothing;
update public.movie_sources s set is_active=(b.payload->>'is_active')::boolean,status=b.payload->>'status',updated_at=now()
from private.ophim_retirement_backup b where b.table_name='movie_sources' and b.row_id=s.id::text;
commit;
