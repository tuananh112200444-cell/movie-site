begin;set local lock_timeout='3s';set local statement_timeout='15s';
do $$
declare src streams%rowtype; dst uuid; before_part1 text; changed text;
begin
 select * into strict src from streams where movie_id='87b7a839-6319-487e-beef-9ea0a05c622d' and episode_slug='tap-110-phan-2' limit 1;
 select l.target_stream_id into strict dst from private.season_partition_stream_ledger l join streams t on t.id=l.target_stream_id
 where l.source_stream_id=src.id and t.movie_id='8cdae6f5-05f0-4d9d-9b8f-05186de7ae5a' and t.episode_slug='tap-1';
 select embed_url into before_part1 from streams where movie_id='79923108-e253-4203-81a5-6698a0d984c6' and source='nguonc' and episode_slug='tap-1' limit 1;
 update streams set health_status='ok',last_checked_at=now() where id=dst;
 update streams set embed_url=embed_url where id=src.id;
 if not exists(select 1 from streams where id=dst and health_status='ok') then raise exception 'unchanged URL reset health';end if;
 changed:='https://example.invalid/rollback-only-season-test';
 update streams set embed_url=changed where id=src.id;
 if not exists(select 1 from streams where id=dst and embed_url=changed and health_status='unchecked' and last_checked_at is null) then raise exception 'changed URL not forwarded to correct season';end if;
 if not exists(select 1 from streams where movie_id='79923108-e253-4203-81a5-6698a0d984c6' and source='nguonc' and episode_slug='tap-1' and embed_url=before_part1) then raise exception 'season 2 corrupted season 1';end if;
 if (select count(*) from private.season_partition_stream_ledger l join streams t on t.id=l.target_stream_id where t.movie_id='79923108-e253-4203-81a5-6698a0d984c6')<>109 then raise exception 'season 1 count';end if;
 if (select count(*) from private.season_partition_stream_ledger l join streams t on t.id=l.target_stream_id where t.movie_id='8cdae6f5-05f0-4d9d-9b8f-05186de7ae5a')<>50 then raise exception 'season 2 count';end if;
end;$$;
rollback;
