begin;set local lock_timeout='3s';set local statement_timeout='15s';
create or replace function public.archive_canonical_merge_table(p_merge_id uuid,p_table_name text,p_source_movie_ids uuid[])
returns integer language plpgsql set search_path=public,pg_catalog,pg_temp as $$
declare allowed constant text[]:=array[
 'episodes','movie_episodes','streams','movie_sources','stream_health_logs','movie_enrichment','movie_provider_coverage',
 'movie_refresh_queue','movie_search_documents','movie_seo_quality_status','movie_tmdb_enrichment_status',
 'provider_movie_identities','schedule_email_notifications','seo_url_inspections','catalog_integrity_issues',
 'subtitle_tracks','thai_bl_episodes','thai_bl_streams','watch_progress','movie_slug_aliases','canonical_movie_identities',
 'movie_watch_sessions','movie_comments','movie_reviews','playback_learning_queue','player_error_events'];
 affected integer;has_id boolean;id_expression text;predicate text;slug_column text;
begin
 if not p_table_name=any(allowed) or to_regclass('public.'||p_table_name) is null then return 0;end if;
 select exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||p_table_name) and attname='movie_id' and attnum>0 and not attisdropped) into has_id;
 if has_id then
  id_expression:='r.movie_id';predicate:='r.movie_id=any($2)';
 else
  select case when exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||p_table_name) and attname='movie_slug' and attnum>0 and not attisdropped) then 'movie_slug' else 'slug' end into slug_column;
  id_expression:=format('(select id from public.movies where slug=r.%I limit 1)',slug_column);
  predicate:=format('r.%I in(select slug from public.movies where id=any($2))',slug_column);
 end if;
 execute format($sql$
  insert into public.canonical_merge_archive(merge_id,table_name,source_movie_id,row_key,row_data)
  select $1,%L,%s,
   md5(to_jsonb(r)::text),to_jsonb(r) from public.%I r
  where %s
  on conflict do nothing
 $sql$,p_table_name,id_expression,p_table_name,predicate) using p_merge_id,p_source_movie_ids;
 get diagnostics affected=row_count;return affected;
end;$$;

commit;
