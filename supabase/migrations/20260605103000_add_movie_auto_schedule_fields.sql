alter table public.movies
  add column if not exists current_episode integer,
  add column if not exists total_episodes integer,
  add column if not exists schedule_type text,
  add column if not exists release_time time,
  add column if not exists release_day integer,
  add column if not exists schedule_timezone text default 'Asia/Ho_Chi_Minh';

alter table public.movies
  drop constraint if exists movies_schedule_type_check,
  add constraint movies_schedule_type_check
    check (schedule_type is null or schedule_type in ('daily', 'weekly', 'custom'));

alter table public.movies
  drop constraint if exists movies_release_day_check,
  add constraint movies_release_day_check
    check (release_day is null or release_day between 0 and 6);

update public.movies
set
  current_episode = nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::integer
where current_episode is null
  and coalesce(episode_current, '') ~ '[0-9]+';

update public.movies
set
  total_episodes = nullif(substring(coalesce(episode_total, '') from '([0-9]+)'), '')::integer
where total_episodes is null
  and coalesce(episode_total, '') ~ '[0-9]+';

create index if not exists movies_schedule_type_idx
  on public.movies (schedule_type)
  where schedule_type is not null;

create or replace function public.get_server_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

grant execute on function public.get_server_now() to anon, authenticated;
