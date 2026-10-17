set statement_timeout='25s';
with recursive raw_ledgers as materialized (
 select * from canonical_merge_ledger where candidate_key like 'implicit-first:%' and status='completed'
), paths as (
 select id merge_id,canonical_movie_id movie_id,0 depth from raw_ledgers
 union all select p.merge_id,m.superseded_by_movie_id,p.depth+1 from paths p join movies m on m.id=p.movie_id where m.superseded_by_movie_id is not null and p.depth<16
), ledgers as materialized (
 select distinct on(r.id) r.id,r.source_slugs,p.movie_id canonical_movie_id from raw_ledgers r join paths p on p.merge_id=r.id order by r.id,p.depth desc
), expected as materialized (
 select distinct l.canonical_movie_id movie_id,coalesce(a.row_data->>'stream_url','') stream_url,coalesce(a.row_data->>'embed_url','') embed_url
 from ledgers l join canonical_merge_archive a on a.merge_id=l.id and a.table_name='streams'
), canonical_ids as materialized (select distinct canonical_movie_id movie_id from ledgers), actual as materialized (
 select distinct s.movie_id,coalesce(s.stream_url,'') stream_url,coalesce(s.embed_url,'') embed_url from streams s join canonical_ids c on s.movie_id=c.movie_id
), missing as (select * from expected except select * from actual), expected_sessions as materialized (
 select distinct l.canonical_movie_id movie_id,a.row_data->>'playback_id' playback_id from ledgers l join canonical_merge_archive a on a.merge_id=l.id and a.table_name='movie_watch_sessions'
), actual_sessions as materialized (
 select s.movie_id,s.playback_id::text playback_id from movie_watch_sessions s join canonical_ids c on s.movie_id=c.movie_id
), missing_sessions as (select * from expected_sessions except select * from actual_sessions)
select jsonb_build_object('expected_url_pairs',(select count(*) from expected),'missing_url_pairs',(select count(*) from missing),'missing_examples',(select jsonb_agg(to_jsonb(t)) from (select movie_id from missing limit 5)t),
 'retired_without_alias',(select count(*) from ledgers l cross join lateral unnest(l.source_slugs) slug where not exists(select 1 from movie_slug_aliases a where a.alias_slug=slug)),
 'public_retired',(select count(*) from movies where superseded_by_movie_id is not null and is_published),
 'candidates',(select jsonb_agg(t) from (select status,count(*) from canonicalization_candidates where candidate_key like 'implicit-first:%' group by status)t),
 'expected_sessions',(select count(*) from expected_sessions),'missing_sessions',(select count(*) from missing_sessions),
 'capacity',(select mode from runtime_capacity_state where singleton)
) result;
