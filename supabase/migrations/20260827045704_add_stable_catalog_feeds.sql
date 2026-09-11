begin;

-- Stable catalogue clocks. `updated_at` is an operational timestamp and is
-- touched by metadata sync, source health and canonical repairs. It must not
-- decide what viewers see as a new movie or a newly released episode.
alter table public.movies
  add column if not exists published_at timestamptz,
  add column if not exists last_episode_change_at timestamptz;

update public.movies movie
set published_at = coalesce(quality.first_eligible_at, movie.created_at, movie.updated_at, now())
from public.movie_seo_quality_status quality
where quality.movie_id = movie.id
  and movie.is_published is true
  and movie.published_at is null;

update public.movies
set published_at = coalesce(created_at, updated_at, now())
where is_published is true
  and published_at is null;

update public.movies movie
set last_episode_change_at = coalesce(
  quality.last_episode_change_at,
  case when coalesce(movie.current_episode,0) > 0 then movie.published_at end
)
from public.movie_seo_quality_status quality
where quality.movie_id = movie.id
  and movie.last_episode_change_at is null;

update public.movies
set last_episode_change_at = published_at
where last_episode_change_at is null
  and coalesce(current_episode,0) > 0;

create or replace function public.maintain_movie_feed_timestamps()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_published is true and new.published_at is null then
      new.published_at := coalesce(new.created_at, now());
    end if;
    if coalesce(new.current_episode,0) > 0 and new.last_episode_change_at is null then
      new.last_episode_change_at := coalesce(new.published_at, new.created_at, now());
    end if;
    return new;
  end if;

  -- First publication is immutable. Republishing after a temporary source
  -- outage must not make an old movie look newly added again.
  if old.published_at is not null then
    new.published_at := old.published_at;
  elsif new.is_published is true and old.is_published is distinct from true then
    new.published_at := now();
  end if;

  -- Only a real episode-number increase advances the update feed. Metadata,
  -- poster, cache, health and source URL changes deliberately preserve it.
  if new.last_episode_change_at is distinct from old.last_episode_change_at then
    new.last_episode_change_at := new.last_episode_change_at;
  elsif coalesce(new.current_episode,0) > coalesce(old.current_episode,0) then
    new.last_episode_change_at := now();
  else
    new.last_episode_change_at := old.last_episode_change_at;
  end if;

  return new;
end;
$$;

drop trigger if exists maintain_movie_feed_timestamps_trigger on public.movies;
create trigger maintain_movie_feed_timestamps_trigger
before insert or update on public.movies
for each row execute function public.maintain_movie_feed_timestamps();

revoke all on function public.maintain_movie_feed_timestamps() from public, anon, authenticated;

create index if not exists movies_stable_publication_feed_idx
  on public.movies (published_at desc nulls last, id)
  where is_published is true
    and superseded_by_movie_id is null
    and lower(coalesce(seo_catalog_status,'published')) not in ('hidden','draft','superseded');

create index if not exists movies_stable_episode_feed_idx
  on public.movies (last_episode_change_at desc nulls last, id)
  where is_published is true
    and superseded_by_movie_id is null
    and lower(coalesce(seo_catalog_status,'published')) not in ('hidden','draft','superseded')
    and last_episode_change_at is not null;

create or replace function public.get_stable_catalog_feed(
  p_mode text default 'new',
  p_limit integer default 36,
  p_offset integer default 0
)
returns table(item jsonb, total_count bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with candidates as (
    select
      movie.*,
      case
        when lower(coalesce(p_mode,'new')) = 'episode_updates'
          then movie.last_episode_change_at
        else coalesce(movie.published_at,movie.created_at)
      end as feed_sort_at
    from public.movies movie
    where movie.is_published is true
      and lower(coalesce(movie.seo_catalog_status,'published')) not in ('hidden','draft','superseded')
      and movie.superseded_by_movie_id is null
      and lower(coalesce(p_mode,'new')) in ('new','episode_updates')
      and (
        lower(coalesce(p_mode,'new')) = 'new'
        or movie.last_episode_change_at is not null
      )
  )
  select
    jsonb_build_object(
      'id',candidate.id,
      'slug',candidate.slug,
      'name',candidate.name,
      'origin_name',candidate.origin_name,
      'title_vi',candidate.title_vi,
      'title_en',candidate.title_en,
      'thumb_url',candidate.thumb_url,
      'poster_url',candidate.poster_url,
      'type',candidate.type,
      'year',candidate.year,
      'quality',candidate.quality,
      'lang',candidate.lang,
      'episode_current',candidate.episode_current,
      'episode_total',candidate.episode_total,
      'current_episode',candidate.current_episode,
      'total_episodes',candidate.total_episodes,
      'schedule_type',candidate.schedule_type,
      'release_time',candidate.release_time,
      'release_day',candidate.release_day,
      'schedule_timezone',candidate.schedule_timezone,
      'category',candidate.category,
      'country',candidate.country,
      -- Existing list clients sort on modified.time. Return the semantic feed
      -- clock through this compatibility field, not the operational timestamp.
      'updated_at',candidate.feed_sort_at,
      'feed_sort_at',candidate.feed_sort_at,
      'published_at',candidate.published_at,
      'last_episode_change_at',candidate.last_episode_change_at,
      'source_site',candidate.source_site,
      'source_name',candidate.source_name,
      'release_at',candidate.release_at,
      'next_episode_at',candidate.next_episode_at,
      'next_episode_name',candidate.next_episode_name,
      'schedule_note',candidate.schedule_note,
      'is_published',true
    ) as item,
    null::bigint as total_count
  from candidates candidate
  order by candidate.feed_sort_at desc nulls last, candidate.id
  limit greatest(1,least(coalesce(p_limit,36),72))
  offset greatest(0,coalesce(p_offset,0));
$$;

revoke all on function public.get_stable_catalog_feed(text,integer,integer) from public;
grant execute on function public.get_stable_catalog_feed(text,integer,integer)
  to anon, authenticated, service_role;

comment on function public.get_stable_catalog_feed(text,integer,integer) is
  'Stable public feeds: new=first publication, episode_updates=real episode-number increase. Operational updated_at never changes feed order.';

-- Re-enable a small periodic safety net. It calls the existing strict
-- health-aware reconcile function, so editorial hidden/draft/superseded rows
-- remain private while interrupted provider ingests cannot stay stuck.
insert into public.system_brain_tasks as task (
  task_key,brain,handler,params,priority,interval_seconds,enabled,status,
  next_run_at,lease_until,consecutive_failures,last_error,updated_at
)
values (
  'catalog:release-reconciliation','catalog','rpc:reconcile_hidden_usable_movies',
  '{"p_limit":20}'::jsonb,3,600,true,'idle',now()+interval '2 minutes',null,0,null,now()
)
on conflict(task_key) do update set
  brain=excluded.brain,
  handler=excluded.handler,
  params=excluded.params,
  priority=excluded.priority,
  interval_seconds=excluded.interval_seconds,
  enabled=true,
  status='idle',
  next_run_at=least(task.next_run_at,now()+interval '2 minutes'),
  lease_until=null,
  consecutive_failures=0,
  last_error=null,
  updated_at=now();

update public.home_page_cache
set expires_at=now()
where id in ('homepage_v3','search_index_v4_rows');

commit;
