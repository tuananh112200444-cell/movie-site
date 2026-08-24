-- A target provider sync can persist usable playback after a movie was
-- quarantined. Rows with the contradictory state `published + is_published
-- false` were never released because reconcile only recognized
-- `awaiting_playback`. Publish any usable row unless its SEO state is an
-- explicit editorial tombstone.

create or replace function public.reconcile_movie_release_state(p_movie_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  max_episode integer := 0;
  declared_total integer := 0;
  advertised_episode integer := 0;
  normalized_status text := '';
  normalized_label text := '';
  raw_suffix text := '';
  current_seo_status text := '';
  currently_published boolean := false;
  preview_only boolean := false;
  has_usable_playback boolean := false;
begin
  max_episode := public.get_movie_playable_max_episode(p_movie_id);
  has_usable_playback := public.movie_has_usable_persisted_playback(p_movie_id);

  select
    greatest(
      coalesce(movie.total_episodes, 0),
      coalesce(nullif(substring(coalesce(movie.episode_total, '') from '([0-9]+)'), '')::integer, 0)
    ),
    greatest(
      coalesce(movie.current_episode, 0),
      coalesce(nullif(substring(coalesce(movie.episode_current, '') from '([0-9]+)'), '')::integer, 0)
    ),
    lower(coalesce(movie.status, '')),
    lower(coalesce(movie.episode_current, '')),
    case when lower(coalesce(movie.episode_current, '')) like '%raw%' then ' RAW' else '' end,
    lower(coalesce(movie.seo_catalog_status, '')),
    coalesce(movie.is_published, false),
    public.movie_is_preview_only(movie)
  into declared_total, advertised_episode, normalized_status, normalized_label,
       raw_suffix, current_seo_status, currently_published, preview_only
  from public.movies movie
  where movie.id = p_movie_id;

  if not found then return 0; end if;
  perform set_config('app.movie_refresh_processing', '1', true);

  if max_episode > 0 and has_usable_playback then
    update public.movies
    set
      is_published = case
        when current_seo_status in ('hidden', 'draft', 'superseded') then is_published
        else true
      end,
      seo_catalog_status = case
        when current_seo_status in ('hidden', 'draft', 'superseded') then seo_catalog_status
        else 'published'
      end,
      status = case
        when declared_total > 0 and max_episode = declared_total then 'completed'
        when declared_total <> max_episode
          or normalized_status in ('upcoming', 'trailer', 'returning series', 'in production')
          then 'ongoing'
        else status
      end,
      episode_current = case
        when declared_total > 0 and max_episode = declared_total
          then 'Hoàn Tất (' || max_episode::text || '/' || declared_total::text || ')'
        when advertised_episode is distinct from max_episode
          or normalized_label ~ '(trailer|sap chieu|đang cập nhật|dang cap nhat|hoàn tất|hoan tat)'
          then 'Tập ' || max_episode::text || raw_suffix
        else episode_current
      end,
      current_episode = max_episode,
      updated_at = case
        when advertised_episode is distinct from max_episode
          or normalized_status in ('upcoming', 'trailer', 'returning series', 'in production')
          or normalized_label ~ '(trailer|sap chieu|đang cập nhật|dang cap nhat|hoàn tất|hoan tat)'
          or currently_published is false
          then now()
        else updated_at
      end
    where id = p_movie_id;
  elsif not preview_only and currently_published then
    update public.movies
    set is_published = false,
        seo_catalog_status = case
          when current_seo_status in ('hidden', 'draft', 'superseded') then seo_catalog_status
          else 'awaiting_playback'
        end,
        current_episode = 0,
        episode_current = 'Đang cập nhật',
        updated_at = now()
    where id = p_movie_id;
  end if;

  return case when has_usable_playback then max_episode else 0 end;
end;
$$;

revoke all on function public.reconcile_movie_release_state(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_movie_release_state(uuid)
  to service_role;

select public.reconcile_movie_release_state(id)
from public.movies
where slug = 'quy-nhap-trang-2';

delete from public.movie_api_cache where slug = 'quy-nhap-trang-2';
update public.home_page_cache
set expires_at = now()
where id in ('homepage_v3', 'search_index_v4_rows');

comment on function public.reconcile_movie_release_state(uuid) is
  'Health-aware release truth: usable playback republishes every non-editorial row, including contradictory published+false quarantine residue; unusable released rows remain awaiting_playback.';
