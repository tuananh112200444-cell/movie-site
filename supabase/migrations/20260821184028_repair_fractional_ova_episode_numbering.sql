-- OPhim represents the two 26.5 OVAs as slugs 265-1 and 265-2. Historical
-- parsers interpreted those as ordinary episodes 1/2 (and an older metadata
-- path promoted 26.5 to 265), overwriting the numeric catalogue truth.

do $repair$
declare
  target_id constant uuid := 'fb3a3ad7-bb1b-460b-83e5-741b71615b48';
  target_slug constant text := 'su-noi-day-cua-co-gai-mot-sach-minh-se-lam-moi-cach-de-tro-thanh-thu-thu-3';
begin
  if not exists (
    select 1 from public.movies
    where id = target_id and slug = target_slug
  ) then
    raise exception 'Fractional OVA repair target identity changed';
  end if;

  update public.episodes
  set episode_number = 0
  where movie_id = target_id
    and episode_name ~* '^26[.]5[[:space:]]+Part[[:space:]]+[12]$'
    and episode_slug in ('265-1', '265-2');

  -- movie_episodes is keyed by numeric episode identity, so fractional parts
  -- belong only in the slug-keyed episodes/streams tables.
  delete from public.movie_episodes
  where movie_id = target_id
    and episode_name ~* '^26[.]5[[:space:]]+Part[[:space:]]+[12]$'
    and slug in ('265-1', '265-2');

  update public.movies
  set current_episode = 36,
      total_episodes = 36,
      episode_current = 'Hoàn Tất (36/36)',
      episode_total = '36 Tập',
      updated_at = now()
  where id = target_id;

  delete from public.movie_api_cache where slug = target_slug;
end;
$repair$;
