-- Reject numeric identifiers that are not plausible episode slugs and never
-- emit completion labels where the current episode exceeds the declared total.

create or replace function public.get_movie_playable_max_episode(p_movie_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(x.episode_number), 0)::integer
  from (
    select greatest(coalesce(e.episode_number, 0)::integer, 1) as episode_number
    from public.movie_episodes e
    where e.movie_id = p_movie_id
      and (
        coalesce(e.link_m3u8, '') ~* '^https?://'
        or coalesce(e.link_embed, '') ~* '^https?://'
      )
    union all
    select greatest(coalesce(e.episode_number, 0)::integer, 1) as episode_number
    from public.episodes e
    where e.movie_id = p_movie_id
      and (
        coalesce(e.link_m3u8, '') ~* '^https?://'
        or coalesce(e.link_embed, '') ~* '^https?://'
      )
    union all
    select greatest(
      substring(trim(coalesce(s.episode_slug, '')) from '([0-9]{1,4})')::integer,
      1
    ) as episode_number
    from public.streams s
    where s.movie_id = p_movie_id
      and s.is_active is true
      and trim(coalesce(s.episode_slug, '')) ~* '^(tap[-_ ]*)?[0-9]{1,4}($|[-_ ])'
      and (
        coalesce(s.stream_url, '') ~* '^https?://'
        or coalesce(s.embed_url, '') ~* '^https?://'
      )
  ) x;
$$;

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
begin
  max_episode := public.get_movie_playable_max_episode(p_movie_id);

  select
    greatest(
      coalesce(total_episodes, 0),
      coalesce(nullif(substring(coalesce(episode_total, '') from '([0-9]+)'), '')::integer, 0)
    ),
    greatest(
      coalesce(current_episode, 0),
      coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::integer, 0)
    ),
    lower(coalesce(status, '')),
    lower(coalesce(episode_current, '')),
    case when lower(coalesce(episode_current, '')) like '%raw%' then ' RAW' else '' end
  into declared_total, advertised_episode, normalized_status, normalized_label, raw_suffix
  from public.movies
  where id = p_movie_id;

  if not found then
    return 0;
  end if;

  perform set_config('app.movie_refresh_processing', '1', true);

  if max_episode > 0 then
    update public.movies
    set
      seo_catalog_status = case
        when lower(coalesce(seo_catalog_status, '')) in ('hidden', 'draft', 'superseded') then seo_catalog_status
        else 'published'
      end,
      status = case
        when declared_total > 0 and max_episode = declared_total then 'completed'
        when declared_total <> max_episode
          or lower(coalesce(status, '')) in ('upcoming', 'trailer', 'returning series', 'in production')
          then 'ongoing'
        else status
      end,
      episode_current = case
        when declared_total > 0 and max_episode = declared_total
          then 'Hoàn Tất (' || max_episode::text || '/' || declared_total::text || ')'
        when advertised_episode is distinct from max_episode
          or normalized_label ~ '(trailer|sap chieu|dang cap nhat|hoàn tất|hoan tat)'
          then 'Tập ' || max_episode::text || raw_suffix
        else episode_current
      end,
      current_episode = max_episode,
      updated_at = case
        when advertised_episode is distinct from max_episode
          or lower(coalesce(status, '')) in ('upcoming', 'trailer', 'returning series', 'in production')
          or normalized_label ~ '(trailer|sap chieu|dang cap nhat|hoàn tất|hoan tat)'
          then now()
        else updated_at
      end
    where id = p_movie_id
      and is_published is true;
  elsif advertised_episode > 0
    and normalized_status not in ('upcoming', 'trailer')
    and normalized_label !~ '(trailer|sap chieu)'
  then
    update public.movies
    set
      current_episode = 0,
      episode_current = 'Đang cập nhật',
      updated_at = now()
    where id = p_movie_id
      and is_published is true;
  end if;

  return max_episode;
end;
$$;

-- Repair every malformed completion label through the canonical queue.
insert into public.movie_refresh_queue (movie_id, requested_at, next_attempt_at, reasons)
select m.id, now(), now(), array['invalid_completion_label_repair']
from public.movies m
where m.is_published is true
  and lower(coalesce(m.episode_current, '')) ~ '(hoàn tất|hoan tat)'
  and coalesce(
    nullif(substring(m.episode_current from '\(([0-9]+)\/[0-9]+\)'), '')::integer,
    0
  ) > coalesce(
    nullif(substring(m.episode_current from '\([0-9]+\/([0-9]+)\)'), '')::integer,
    0
  )
on conflict (movie_id) do update set
  requested_at = excluded.requested_at,
  next_attempt_at = least(public.movie_refresh_queue.next_attempt_at, now()),
  reasons = public.movie_refresh_queue.reasons || array['invalid_completion_label_repair'],
  attempts = 0,
  last_error = null;

comment on function public.get_movie_playable_max_episode(uuid) is
  'Shared episode truth with strict 1-4 digit stream slug validation.';
