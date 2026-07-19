create or replace function public.trigger_refresh_movie_seo_quality_from_movie()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_movie_seo_quality(new.id);
  return new;
end;
$$;

create or replace function public.trigger_refresh_movie_seo_quality_from_episode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id uuid := coalesce(new.movie_id, old.movie_id);
begin
  if target_id is not null and exists (select 1 from public.movies where id = target_id) then
    perform public.refresh_movie_seo_quality(target_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists movies_refresh_seo_quality on public.movies;
create trigger movies_refresh_seo_quality
after insert or update of slug, name, content, poster_url, thumb_url, year, status,
  episode_current, current_episode, is_published, seo_catalog_status, updated_at
on public.movies
for each row execute function public.trigger_refresh_movie_seo_quality_from_movie();

drop trigger if exists movie_episodes_refresh_seo_quality on public.movie_episodes;
create trigger movie_episodes_refresh_seo_quality
after insert or update of movie_id, link_m3u8, link_embed or delete
on public.movie_episodes
for each row execute function public.trigger_refresh_movie_seo_quality_from_episode();

drop trigger if exists episodes_refresh_seo_quality on public.episodes;
create trigger episodes_refresh_seo_quality
after insert or update of movie_id, link_m3u8, link_embed or delete
on public.episodes
for each row execute function public.trigger_refresh_movie_seo_quality_from_episode();

revoke all on function public.trigger_refresh_movie_seo_quality_from_movie() from public, anon, authenticated;
revoke all on function public.trigger_refresh_movie_seo_quality_from_episode() from public, anon, authenticated;
grant execute on function public.trigger_refresh_movie_seo_quality_from_movie() to service_role;
grant execute on function public.trigger_refresh_movie_seo_quality_from_episode() to service_role;
