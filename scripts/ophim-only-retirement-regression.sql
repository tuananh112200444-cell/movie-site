-- Run after applying the migration; all test mutations roll back.
begin isolation level repeatable read;set local statement_timeout='90s';

do $test$ declare movies_before bigint;nguonc_before bigint;r2_before bigint;v jsonb;begin
 if public.is_retired_playback_source('nguonc','NguonC','https://cdn.nguonc.com/x.m3u8','') then raise exception 'NguonC misclassified';end if;
 if public.is_retired_playback_source('khophim-r2','KhoPhim R2','https://khophim.org/hls/ophim-trailer.m3u8','') then raise exception 'R2 misclassified';end if;
 if not public.is_retired_playback_source('ophim1.com','Vietsub #1','null','null') then raise exception 'OPhim alias missed';end if;
 if not public.is_retired_playback_source('other','Vietsub','https://s1.opstream90.com/a/index.m3u8','') then raise exception 'OPhim domain missed';end if;
 select count(*) into movies_before from movies;
 select count(*) into nguonc_before from streams where coalesce(provider_key,source)='nguonc';
 select count(*) into r2_before from streams where coalesce(provider_key,source)='khophim-r2';
 v:=private.archive_retired_ophim_batch(500);
 if movies_before<>(select count(*) from movies) then raise exception 'Movie catalogue changed';end if;
 if nguonc_before<>(select count(*) from streams where coalesce(provider_key,source)='nguonc') then raise exception 'NguonC changed';end if;
 if r2_before<>(select count(*) from streams where coalesce(provider_key,source)='khophim-r2') then raise exception 'R2 changed';end if;
 if exists(select 1 from provider_operational_policy where provider='nguonc' and (not ingest_enabled or playback_mode<>'normal')) then raise exception 'NguonC policy disabled';end if;
end;$test$;
select table_name,count(*) archived from private.ophim_retirement_backup group by table_name;
rollback;
