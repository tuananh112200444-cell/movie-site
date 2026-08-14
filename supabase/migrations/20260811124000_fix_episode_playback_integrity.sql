-- Keep episode numbering, stream health, publication state, and detail cache
-- consistent. Provider episode numbers are rewritten only under a strict,
-- collision-free season contract; ambiguous data is left untouched.

create or replace function public.normalize_verified_cumulative_season_numbering(
  p_movie_id uuid,
  p_source text,
  p_raw_start integer,
  p_raw_end integer,
  p_season integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_key text := lower(trim(coalesce(p_source, '')));
  canonical_total integer := coalesce(p_raw_end, 0) - coalesce(p_raw_start, 0) + 1;
  offset_value integer := coalesce(p_raw_start, 0) - 1;
  source_count integer := 0;
  source_min integer := 0;
  source_max integer := 0;
  movie_title text := '';
  movie_current integer := 0;
  movie_total integer := 0;
begin
  if p_movie_id is null
     or source_key not in ('ophim', 'phimapi')
     or coalesce(p_season, 0) < 2
     or coalesce(p_raw_start, 0) <= 1
     or canonical_total < 2
     or p_raw_start <= canonical_total
  then
    return false;
  end if;

  select
    lower(concat_ws(' ', name, origin_name, title_vi, title_en, title_original)),
    coalesce(current_episode, 0),
    coalesce(total_episodes, 0)
  into movie_title, movie_current, movie_total
  from public.movies
  where id = p_movie_id;

  if not found
     or movie_title !~ ('(season|part|phan|phần|mua|mùa)[[:space:]]*0*' || p_season::text || '([^0-9]|$)')
     or greatest(movie_current, movie_total) <> p_raw_end
  then
    return false;
  end if;

  select count(distinct episode_number), min(episode_number), max(episode_number)
  into source_count, source_min, source_max
  from public.movie_episodes
  where movie_id = p_movie_id
    and lower(trim(coalesce(source, ''))) = source_key
    and episode_number between p_raw_start and p_raw_end;

  if source_count <> canonical_total
     or source_min <> p_raw_start
     or source_max <> p_raw_end
  then
    return false;
  end if;

  create temporary table if not exists verified_season_number_map (
    movie_episode_id bigint primary key,
    server_name text not null,
    old_number integer not null,
    new_number integer not null,
    old_slug text,
    new_slug text not null,
    link_m3u8 text,
    link_embed text
  ) on commit drop;
  truncate table verified_season_number_map;

  insert into verified_season_number_map (
    movie_episode_id, server_name, old_number, new_number,
    old_slug, new_slug, link_m3u8, link_embed
  )
  select
    episode.id,
    episode.server_name,
    episode.episode_number,
    episode.episode_number - offset_value,
    episode.slug,
    'tap-' || lpad((episode.episode_number - offset_value)::text, 2, '0'),
    episode.link_m3u8,
    episode.link_embed
  from public.movie_episodes episode
  where episode.movie_id = p_movie_id
    and lower(trim(coalesce(episode.source, ''))) = source_key
    and episode.episode_number between p_raw_start and p_raw_end;

  if exists (
    select 1
    from verified_season_number_map mapping
    join public.movie_episodes target
      on target.movie_id = p_movie_id
     and lower(trim(target.server_name)) = lower(trim(mapping.server_name))
     and target.episode_number = mapping.new_number
     and target.id <> mapping.movie_episode_id
  ) or exists (
    select 1
    from verified_season_number_map mapping
    join public.streams target
      on target.movie_id = p_movie_id
     and lower(trim(target.source)) = source_key
     and lower(trim(target.server_name)) = lower(trim(mapping.server_name))
     and lower(trim(target.episode_slug)) = lower(mapping.new_slug)
     and lower(trim(target.episode_slug)) <> lower(trim(coalesce(mapping.old_slug, '')))
  ) then
    truncate table verified_season_number_map;
    return false;
  end if;

  update public.streams stream
  set
    episode_slug = mapping.new_slug,
    updated_at = now()
  from verified_season_number_map mapping
  where stream.movie_id = p_movie_id
    and lower(trim(stream.source)) = source_key
    and lower(trim(stream.server_name)) = lower(trim(mapping.server_name))
    and (
      lower(trim(stream.episode_slug)) = lower(trim(coalesce(mapping.old_slug, '')))
      or stream.stream_url = mapping.link_m3u8
      or stream.embed_url = mapping.link_embed
    );

  update public.episodes episode
  set
    episode_number = mapping.new_number,
    episode_name = 'Tập ' || lpad(mapping.new_number::text, 2, '0'),
    episode_slug = mapping.new_slug,
    server_data = case
      when jsonb_typeof(episode.server_data) = 'object' then
        jsonb_set(
          jsonb_set(episode.server_data, '{name}', to_jsonb('Tập ' || lpad(mapping.new_number::text, 2, '0')), true),
          '{slug}', to_jsonb(mapping.new_slug), true
        )
      else episode.server_data
    end
  from verified_season_number_map mapping
  where episode.movie_id = p_movie_id
    and lower(trim(episode.server_name)) = lower(trim(mapping.server_name))
    and (
      episode.episode_number = mapping.old_number
      or episode.link_m3u8 = mapping.link_m3u8
      or episode.link_embed = mapping.link_embed
    );

  update public.movie_episodes episode
  set
    episode_number = mapping.new_number,
    episode_name = 'Tập ' || lpad(mapping.new_number::text, 2, '0'),
    slug = mapping.new_slug,
    updated_at = now()
  from verified_season_number_map mapping
  where episode.id = mapping.movie_episode_id;

  update public.movies
  set
    current_episode = canonical_total,
    total_episodes = canonical_total,
    episode_current = case
      when lower(coalesce(episode_current, '')) ~ '(hoàn|hoan|complete)'
        then 'Hoàn Tất (' || canonical_total::text || '/' || canonical_total::text || ')'
      else 'Tập ' || canonical_total::text
    end,
    episode_total = canonical_total::text,
    updated_at = now()
  where id = p_movie_id;

  delete from public.movie_api_cache cache
  using public.movies movie
  where movie.id = p_movie_id
    and cache.slug in (movie.slug, movie.ophim_slug);

  perform public.enqueue_movie_refresh(p_movie_id, 'verified_season_numbering_normalized');
  perform public.reconcile_movie_release_state(p_movie_id);
  truncate table verified_season_number_map;
  return true;
end;
$$;

revoke all on function public.normalize_verified_cumulative_season_numbering(uuid,text,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.normalize_verified_cumulative_season_numbering(uuid,text,integer,integer,integer)
  to service_role;

create or replace function public.stream_row_is_publicly_usable(p_stream public.streams)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    p_stream.is_active is true
    and (
      coalesce(trim(p_stream.stream_url), '') ~* '^https?://'
      or coalesce(trim(p_stream.embed_url), '') ~* '^https?://'
    )
    and lower(trim(coalesce(p_stream.health_status, 'unchecked'))) <> 'dead'
    and coalesce(p_stream.last_error, '') not like 'Provider verification pending:%'
    and not (
      lower(trim(coalesce(p_stream.health_status, 'unchecked'))) = 'failed'
      and coalesce(p_stream.failure_count, 0) >= 3
    )
    and not (
      lower(trim(coalesce(p_stream.health_status, 'unchecked'))) = 'blocked'
      and coalesce(p_stream.embed_url, '') !~* '^https?://player\.phimapi\.com/player/'
      and coalesce(p_stream.embed_url, '') !~* '^https?://[^/]*streamc\.xyz/'
    );
$$;

revoke all on function public.stream_row_is_publicly_usable(public.streams)
  from public, anon, authenticated;

create or replace function public.reconcile_movie_after_stream_health_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_usable boolean := false;
  new_usable boolean := false;
  affected_movie_id uuid;
  should_reconcile boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_usable := public.stream_row_is_publicly_usable(old);
  end if;
  if tg_op <> 'DELETE' then
    new_usable := public.stream_row_is_publicly_usable(new);
  end if;

  if tg_op = 'UPDATE'
     and old.movie_id = new.movie_id
     and old_usable = new_usable
     and coalesce(old.stream_url, '') = coalesce(new.stream_url, '')
     and coalesce(old.embed_url, '') = coalesce(new.embed_url, '')
  then
    return new;
  end if;

  affected_movie_id := case when tg_op = 'DELETE' then old.movie_id else new.movie_id end;
  should_reconcile := old_usable is distinct from new_usable;

  delete from public.movie_api_cache cache
  using public.movies movie
  where movie.id = affected_movie_id
    and cache.slug in (movie.slug, movie.ophim_slug);

  perform public.enqueue_movie_refresh(affected_movie_id, 'stream_health_changed');
  if should_reconcile then
    perform public.reconcile_movie_release_state(affected_movie_id);
  end if;

  if tg_op = 'UPDATE' and old.movie_id is distinct from new.movie_id then
    delete from public.movie_api_cache cache
    using public.movies movie
    where movie.id = old.movie_id
      and cache.slug in (movie.slug, movie.ophim_slug);
    perform public.enqueue_movie_refresh(old.movie_id, 'stream_health_moved');
    perform public.reconcile_movie_release_state(old.movie_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.reconcile_movie_after_stream_health_change()
  from public, anon, authenticated;

drop trigger if exists reconcile_movie_after_stream_health_change on public.streams;
create trigger reconcile_movie_after_stream_health_change
after insert or delete or update of
  movie_id, stream_url, embed_url, is_active, health_status, failure_count, last_error
on public.streams
for each row execute function public.reconcile_movie_after_stream_health_change();

-- Verified production repair: both providers report TMDB 247805 season 4;
-- OPhim supplies one contiguous cumulative range 36..52 (17 season episodes).
select public.normalize_verified_cumulative_season_numbering(
  '941028ad-1f20-4478-809a-701ea4342a83'::uuid,
  'ophim',
  36,
  52,
  4
);

-- The only currently public non-trailer movie without a usable persisted
-- source is removed from watch listings until a provider supplies a verified
-- replacement. This does not delete metadata or its failed source history.
update public.movies movie
set
  is_published = false,
  seo_catalog_status = case
    when lower(coalesce(movie.seo_catalog_status, '')) in ('hidden', 'draft', 'superseded')
      then movie.seo_catalog_status
    else 'awaiting_playback'
  end,
  current_episode = 0,
  episode_current = 'Đang cập nhật',
  updated_at = now()
where movie.id = 'dfdfe36f-56df-4826-b593-f7ed9616d3e9'::uuid
  and not public.movie_has_usable_persisted_playback(movie.id);

delete from public.movie_api_cache
where slug in ('keo-ngot-tinh-yeu', 'moi-luc-moi-noi-phan-4');

comment on function public.normalize_verified_cumulative_season_numbering(uuid,text,integer,integer,integer) is
  'Rewrites a provider cumulative season range to 1..N only when the caller verified TMDB season and title, metadata, contiguity, and collision checks all pass.';
comment on function public.reconcile_movie_after_stream_health_change() is
  'Immediately expires detail cache and reconciles publication whenever stream usability changes.';
