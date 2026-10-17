begin;set local lock_timeout='3s';set local statement_timeout='15s';
create or replace function public.queue_kkphim_ongoing_refresh()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  provider_is_kkphim boolean := lower(coalesce(new.source_site,''))='phimapi'
    or lower(coalesce(new.source_name,'')) like '%kkphim%'
    or exists(select 1 from public.streams s where s.movie_id=new.id and s.source in ('phimapi','kkphim'))
    or exists(select 1 from public.provider_movie_identities p where p.movie_id=new.id and p.provider in ('phimapi','kkphim'));
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
-- Re-evaluate only the affected current title; keep global cadence and capacity guards.
update public.movies set current_episode=current_episode where id='77bdca05-5d81-4e4a-bfc5-046dc760db26';
commit;
