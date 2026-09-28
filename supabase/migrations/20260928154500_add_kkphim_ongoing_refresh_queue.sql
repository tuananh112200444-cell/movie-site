-- Recent-list polling alone misses an ongoing title after it falls off page 1.
-- Keep a small round-robin queue for published KKPhim series and dispatch at
-- most two targeted identity-safe refreshes every ten minutes.

create table if not exists public.kkphim_ongoing_refresh_queue (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  next_check_at timestamptz not null default now(),
  last_dispatched_at timestamptz,
  dispatch_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kkphim_ongoing_refresh_due_idx
  on public.kkphim_ongoing_refresh_queue(next_check_at, movie_id);

alter table public.kkphim_ongoing_refresh_queue enable row level security;
revoke all on table public.kkphim_ongoing_refresh_queue from public, anon, authenticated;
grant select,insert,update,delete on table public.kkphim_ongoing_refresh_queue to service_role;

create or replace function public.queue_kkphim_ongoing_refresh()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  provider_is_kkphim boolean := lower(coalesce(new.source_site,''))='phimapi'
    or lower(coalesce(new.source_name,'')) like '%kkphim%';
  still_ongoing boolean := coalesce(new.is_published,false)
    and coalesce(new.superseded_by_movie_id,null) is null
    and coalesce(new.current_episode,0)>0
    and (coalesce(new.total_episodes,0)=0 or new.current_episode<new.total_episodes)
    and lower(coalesce(new.status,'')) not in ('completed','hoan-tat')
    and lower(coalesce(new.episode_current,'')) not like '%hoàn tất%'
    and lower(coalesce(new.episode_current,'')) not like '%hoan tat%'
    and lower(coalesce(new.episode_current,'')) not in ('full','full hd','trailer','teaser');
begin
  if provider_is_kkphim and still_ongoing then
    insert into public.kkphim_ongoing_refresh_queue(movie_id,next_check_at,updated_at)
    values(new.id,case when tg_op='INSERT' then now() else now()+interval '30 minutes' end,now())
    on conflict(movie_id) do update set
      next_check_at=case
        when tg_op='UPDATE' and coalesce(new.current_episode,0)>coalesce(old.current_episode,0)
          then now()+interval '30 minutes'
        else public.kkphim_ongoing_refresh_queue.next_check_at
      end,
      updated_at=now();
  else
    delete from public.kkphim_ongoing_refresh_queue where movie_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_kkphim_ongoing_refresh_after_movie_change on public.movies;
create trigger queue_kkphim_ongoing_refresh_after_movie_change
after insert or update of source_site,source_name,is_published,superseded_by_movie_id,
  current_episode,total_episodes,status,episode_current
on public.movies
for each row execute function public.queue_kkphim_ongoing_refresh();

revoke all on function public.queue_kkphim_ongoing_refresh() from public,anon,authenticated;

insert into public.kkphim_ongoing_refresh_queue(movie_id,next_check_at)
select movie.id,
       now()+make_interval(secs=>(row_number() over(order by coalesce(movie.last_episode_change_at,movie.updated_at) desc)-1)*20)
from public.movies movie
where movie.is_published=true
  and movie.superseded_by_movie_id is null
  and (lower(coalesce(movie.source_site,''))='phimapi' or lower(coalesce(movie.source_name,'')) like '%kkphim%')
  and coalesce(movie.current_episode,0)>0
  and (coalesce(movie.total_episodes,0)=0 or movie.current_episode<movie.total_episodes)
  and lower(coalesce(movie.status,'')) not in ('completed','hoan-tat')
  and lower(coalesce(movie.episode_current,'')) not like '%hoàn tất%'
  and lower(coalesce(movie.episode_current,'')) not like '%hoan tat%'
  and lower(coalesce(movie.episode_current,'')) not in ('full','full hd','trailer','teaser')
on conflict(movie_id) do nothing;

create or replace function public.dispatch_kkphim_ongoing_refresh(p_limit integer default 2)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  item record;
  dispatched integer:=0;
begin
  for item in
    select queue.movie_id,movie.slug,movie.last_episode_change_at
    from public.kkphim_ongoing_refresh_queue queue
    join public.movies movie on movie.id=queue.movie_id
    where queue.next_check_at<=now()
      and movie.is_published=true
      and movie.superseded_by_movie_id is null
    order by coalesce(movie.last_episode_change_at,movie.updated_at) desc,queue.next_check_at,queue.movie_id
    for update of queue skip locked
    limit greatest(1,least(coalesce(p_limit,2),4))
  loop
    update public.kkphim_ongoing_refresh_queue
    set next_check_at=now()+case
          when item.last_episode_change_at>=now()-interval '14 days' then interval '30 minutes'
          else interval '6 hours'
        end,
        last_dispatched_at=now(),dispatch_count=dispatch_count+1,updated_at=now()
    where movie_id=item.movie_id;

    perform net.http_get(
      url:='https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-ophim-movies?provider=kkphim&movie_id='
        ||item.movie_id::text||'&limit=1&episodes=1',
      headers:=jsonb_build_object('x-cron-secret',(
        select decrypted_secret from vault.decrypted_secrets
        where name='CRON_SECRET' order by created_at desc limit 1
      )),
      timeout_milliseconds:=120000
    );
    dispatched:=dispatched+1;
  end loop;
  return jsonb_build_object('success',true,'dispatched',dispatched,'checked_at',now());
end;
$$;

revoke all on function public.dispatch_kkphim_ongoing_refresh(integer) from public,anon,authenticated;
grant execute on function public.dispatch_kkphim_ongoing_refresh(integer) to service_role;

do $scheduler$
declare target_job bigint;
begin
  if not exists(select 1 from pg_extension where extname='pg_cron') then return; end if;
  select jobid into target_job from cron.job where jobname='refresh-kkphim-ongoing-every-10-minutes' limit 1;
  if target_job is null then
    perform cron.schedule('refresh-kkphim-ongoing-every-10-minutes','1,11,21,31,41,51 * * * *',
      'select public.dispatch_kkphim_ongoing_refresh(2);');
  else
    perform cron.alter_job(job_id:=target_job,schedule:='1,11,21,31,41,51 * * * *',
      command:='select public.dispatch_kkphim_ongoing_refresh(2);',active:=true);
  end if;
end;
$scheduler$;

comment on function public.dispatch_kkphim_ongoing_refresh(integer) is
  'Round-robin targeted KKPhim episode refresh; bounded to two ongoing movies every ten minutes.';
