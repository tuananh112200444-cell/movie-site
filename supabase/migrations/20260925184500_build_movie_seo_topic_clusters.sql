-- Build crawlable, contextual movie clusters without changing editorial copy.
-- Manual links remain authoritative; automatic links only fill missing edges.
alter table public.movie_seo_topic_links
  add column if not exists link_origin text not null default 'editorial';

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='movie_seo_topic_links_origin_check'
      and conrelid='public.movie_seo_topic_links'::regclass
  ) then
    alter table public.movie_seo_topic_links
      add constraint movie_seo_topic_links_origin_check
      check (link_origin in ('editorial','automatic'));
  end if;
end;
$constraint$;

create index if not exists movie_seo_topic_links_origin_idx
  on public.movie_seo_topic_links(link_origin,source_movie_id,updated_at desc);

create or replace function public.refresh_movie_seo_topic_clusters(p_links_per_movie integer default 4)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  link_limit integer := greatest(2,least(coalesce(p_links_per_movie,4),6));
  deleted_count integer := 0;
  inserted_count integer := 0;
  backfilled_count integer := 0;
begin
  delete from public.movie_seo_topic_links where link_origin='automatic';
  get diagnostics deleted_count=row_count;

  with approved as (
    select p.movie_id,p.slug,p.updated_at,m.name,m.year,m.type,m.actor,m.category,m.country
    from public.movie_seo_profiles p
    join public.movies m on m.id=p.movie_id
    where p.status='published' and p.index_mode='index' and p.validation_score>=85
      and m.superseded_by_movie_id is null
  ), scored as (
    select source.movie_id source_movie_id,source.slug source_slug,
           target.slug target_slug,target.name target_name,target.updated_at,
           (
             (select count(*) from jsonb_array_elements(coalesce(source.category,'[]'::jsonb)) a
               join jsonb_array_elements(coalesce(target.category,'[]'::jsonb)) b
                 on coalesce(a->>'slug',a->>'name')=coalesce(b->>'slug',b->>'name'))*20
             +(select count(*) from jsonb_array_elements(coalesce(source.country,'[]'::jsonb)) a
               join jsonb_array_elements(coalesce(target.country,'[]'::jsonb)) b
                 on coalesce(a->>'slug',a->>'name')=coalesce(b->>'slug',b->>'name'))*12
             +(select count(*) from unnest(coalesce(source.actor,array[]::text[])) a
               join unnest(coalesce(target.actor,array[]::text[])) b
                 on lower(trim(a))=lower(trim(b)) and length(trim(a))>=2)*8
             +case when source.year=target.year then 3 else 0 end
             +case when source.type=target.type then 2 else 0 end
           )::integer relevance
    from approved source cross join approved target
    where source.movie_id<>target.movie_id
  ), ranked as (
    select *,row_number() over(
      partition by source_movie_id
      order by relevance desc,updated_at desc,target_slug
    ) position
    from scored where relevance>0
  )
  insert into public.movie_seo_topic_links(
    source_movie_id,source_slug,target_path,title,anchor,description,link_origin,updated_at
  )
  select source_movie_id,source_slug,'/phim/'||target_slug,
         left(target_name,180),left(target_name,180),
         left('Phim liên quan theo thể loại, quốc gia, diễn viên hoặc năm phát hành.',320),
         'automatic',now()
  from ranked
  where position<=link_limit
  on conflict(source_movie_id,target_path) do nothing;
  get diagnostics inserted_count=row_count;

  -- Directed top-N choices can leave a niche title with no inbound edge.
  -- Add exactly one best reverse edge for every still-unlinked approved page.
  with approved as (
    select p.movie_id,p.slug,p.updated_at,m.name,m.year,m.type,m.actor,m.category,m.country
    from public.movie_seo_profiles p join public.movies m on m.id=p.movie_id
    where p.status='published' and p.index_mode='index' and p.validation_score>=85
      and m.superseded_by_movie_id is null
  ), missing as (
    select target.* from approved target
    where not exists(
      select 1 from public.movie_seo_topic_links link
      where link.target_path='/phim/'||target.slug
    )
  ), scored as (
    select source.movie_id source_movie_id,source.slug source_slug,
           target.slug target_slug,target.name target_name,source.updated_at,
           (
             (select count(*) from jsonb_array_elements(coalesce(source.category,'[]'::jsonb)) a
               join jsonb_array_elements(coalesce(target.category,'[]'::jsonb)) b
                 on coalesce(a->>'slug',a->>'name')=coalesce(b->>'slug',b->>'name'))*20
             +(select count(*) from jsonb_array_elements(coalesce(source.country,'[]'::jsonb)) a
               join jsonb_array_elements(coalesce(target.country,'[]'::jsonb)) b
                 on coalesce(a->>'slug',a->>'name')=coalesce(b->>'slug',b->>'name'))*12
             +(select count(*) from unnest(coalesce(source.actor,array[]::text[])) a
               join unnest(coalesce(target.actor,array[]::text[])) b
                 on lower(trim(a))=lower(trim(b)) and length(trim(a))>=2)*8
             +case when source.year=target.year then 3 else 0 end
             +case when source.type=target.type then 2 else 0 end
           )::integer relevance
    from approved source cross join missing target
    where source.movie_id<>target.movie_id
  ), best as (
    select *,row_number() over(partition by target_slug order by relevance desc,updated_at desc,source_slug) position
    from scored
  )
  insert into public.movie_seo_topic_links(
    source_movie_id,source_slug,target_path,title,anchor,description,link_origin,updated_at
  )
  select source_movie_id,source_slug,'/phim/'||target_slug,left(target_name,180),left(target_name,180),
         'Phim liên quan trong cụm chủ đề KhoPhim.','automatic',now()
  from best where position=1
  on conflict(source_movie_id,target_path) do nothing;
  get diagnostics backfilled_count=row_count;
  inserted_count := inserted_count + backfilled_count;

  return jsonb_build_object(
    'success',true,'links_per_movie',link_limit,'deleted',deleted_count,
    'inserted',inserted_count,'inbound_backfilled',backfilled_count,
    'approved_movies',(select count(*) from public.movie_seo_profiles p join public.movies m on m.id=p.movie_id where p.status='published' and p.index_mode='index' and p.validation_score>=85 and m.superseded_by_movie_id is null),
    'movies_with_incoming',(select count(distinct regexp_replace(target_path,'^/phim/','')) from public.movie_seo_topic_links where target_path like '/phim/%'),
    'checked_at',now()
  );
end;
$function$;

revoke all on function public.refresh_movie_seo_topic_clusters(integer) from public,anon,authenticated;
grant execute on function public.refresh_movie_seo_topic_clusters(integer) to service_role;

do $schedule$
declare job_id bigint;
begin
  if not exists(select 1 from pg_extension where extname='pg_cron') then return; end if;
  select jobid into job_id from cron.job where jobname='refresh-movie-seo-topic-clusters' limit 1;
  if job_id is null then
    perform cron.schedule('refresh-movie-seo-topic-clusters','17,47 * * * *','select public.refresh_movie_seo_topic_clusters(4);');
  else
    perform cron.alter_job(job_id:=job_id,schedule:='17,47 * * * *',command:='select public.refresh_movie_seo_topic_clusters(4);',active:=true);
  end if;
end;
$schedule$;

select public.refresh_movie_seo_topic_clusters(4);
