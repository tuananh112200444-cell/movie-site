do $$
declare
  group_rec record;
  ids uuid[];
  target_id uuid;
  source_id uuid;
  target_slug text;
  source_slugs text[];
  source_ids uuid[];
  merge_summary jsonb;
  moved_movie_episodes integer;
  moved_episodes integer;
  moved_streams integer;
  moved_movie_sources integer;
  moved_stream_health_logs integer;
  affected_rows integer;
  merged_groups integer := 0;
  merged_movies integer := 0;
begin
  for group_rec in
    select *
    from public.movie_duplicate_candidates
    where reason in ('normalized_origin_year', 'ophim_slug', 'ophim_id', 'tmdb_id')
    order by duplicate_count desc
  loop
    select array_agg((item->>'id')::uuid)
    into ids
    from jsonb_array_elements(group_rec.movies) item;

    select m.id
    into target_id
    from public.movies m
    where m.id = any(ids)
      and coalesce(m.is_published, true) = true
    order by
      case
        when lower(coalesce(m.source_site, '') || ' ' || coalesce(m.source_name, '')) like '%admin%' then 5
        when lower(coalesce(m.source_site, '') || ' ' || coalesce(m.source_name, '')) like '%supabase%' then 4
        when lower(coalesce(m.source_site, '') || ' ' || coalesce(m.source_name, '')) like '%blvietsub%' then 4
        when nullif(trim(coalesce(m.tmdb_id::text, '')), '') is not null then 3
        when lower(coalesce(m.source_site, '') || ' ' || coalesce(m.source_name, '')) like '%ophim%' then 2
        else 1
      end desc,
      (
        case when nullif(trim(coalesce(m.poster_url, '')), '') is not null then 1 else 0 end +
        case when nullif(trim(coalesce(m.thumb_url, '')), '') is not null then 1 else 0 end +
        case when nullif(trim(coalesce(m.content, '')), '') is not null then 1 else 0 end +
        case when nullif(trim(coalesce(m.origin_name, '')), '') is not null then 1 else 0 end +
        case when nullif(trim(coalesce(m.episode_current, '')), '') is not null then 1 else 0 end +
        case when m.current_episode is not null then 1 else 0 end +
        case when m.category is not null and m.category::text <> '[]' then 1 else 0 end +
        case when m.country is not null and m.country::text <> '[]' then 1 else 0 end +
        case when nullif(trim(coalesce(m.ophim_id, '')), '') is not null then 1 else 0 end +
        case when nullif(trim(coalesce(m.ophim_slug, '')), '') is not null then 1 else 0 end
      ) desc,
      m.updated_at desc nulls last
    limit 1;

    if target_id is null then
      continue;
    end if;

    select slug into target_slug from public.movies where id = target_id;
    source_ids := array_remove(ids, target_id);
    select array_agg(slug)
    into source_slugs
    from public.movies
    where id = any(source_ids)
      and coalesce(is_published, true) = true;

    if source_slugs is null or cardinality(source_slugs) = 0 then
      continue;
    end if;

    moved_movie_episodes := 0;
    moved_episodes := 0;
    moved_streams := 0;
    moved_movie_sources := 0;
    moved_stream_health_logs := 0;

    foreach source_id in array source_ids loop
      if not exists (select 1 from public.movies where id = source_id and coalesce(is_published, true) = true) then
        continue;
      end if;

      update public.movies target
      set
        title_vi = coalesce(nullif(trim(target.title_vi), ''), nullif(trim(source.title_vi), ''), target.title_vi, source.title_vi, ''),
        title_en = coalesce(nullif(trim(target.title_en), ''), nullif(trim(source.title_en), ''), target.title_en, source.title_en, ''),
        title_zh = coalesce(nullif(trim(target.title_zh), ''), nullif(trim(source.title_zh), ''), target.title_zh, source.title_zh, ''),
        title_original = coalesce(nullif(trim(target.title_original), ''), nullif(trim(source.title_original), ''), target.title_original, source.title_original, ''),
        origin_name = coalesce(nullif(trim(target.origin_name), ''), nullif(trim(source.origin_name), ''), target.origin_name, source.origin_name, ''),
        normalized_name = coalesce(nullif(trim(target.normalized_name), ''), nullif(trim(source.normalized_name), ''), target.normalized_name, source.normalized_name, ''),
        content = coalesce(nullif(trim(target.content), ''), nullif(trim(source.content), ''), target.content, source.content, ''),
        thumb_url = coalesce(nullif(trim(target.thumb_url), ''), nullif(trim(source.thumb_url), ''), target.thumb_url, source.thumb_url, ''),
        poster_url = coalesce(nullif(trim(target.poster_url), ''), nullif(trim(source.poster_url), ''), target.poster_url, source.poster_url, ''),
        trailer_url = coalesce(nullif(trim(target.trailer_url), ''), nullif(trim(source.trailer_url), ''), target.trailer_url, source.trailer_url, ''),
        tmdb_id = coalesce(target.tmdb_id, source.tmdb_id),
        imdb_id = coalesce(nullif(trim(target.imdb_id), ''), nullif(trim(source.imdb_id), ''), target.imdb_id, source.imdb_id, ''),
        ophim_id = coalesce(nullif(trim(target.ophim_id), ''), nullif(trim(source.ophim_id), ''), target.ophim_id, source.ophim_id, ''),
        ophim_slug = coalesce(nullif(trim(target.ophim_slug), ''), nullif(trim(source.ophim_slug), ''), target.ophim_slug, source.ophim_slug),
        episode_current = coalesce(nullif(trim(target.episode_current), ''), nullif(trim(source.episode_current), ''), target.episode_current, source.episode_current, ''),
        episode_total = coalesce(nullif(trim(target.episode_total), ''), nullif(trim(source.episode_total), ''), target.episode_total, source.episode_total, ''),
        current_episode = greatest(coalesce(target.current_episode, 0), coalesce(source.current_episode, 0)),
        total_episodes = greatest(coalesce(target.total_episodes, 0), coalesce(source.total_episodes, 0)),
        schedule_type = coalesce(nullif(trim(target.schedule_type), ''), nullif(trim(source.schedule_type), ''), target.schedule_type, source.schedule_type),
        release_time = coalesce(target.release_time, source.release_time),
        release_day = coalesce(target.release_day, source.release_day),
        schedule_timezone = coalesce(nullif(trim(target.schedule_timezone), ''), nullif(trim(source.schedule_timezone), ''), target.schedule_timezone, source.schedule_timezone, 'Asia/Ho_Chi_Minh'),
        release_at = coalesce(target.release_at, source.release_at),
        next_episode_at = coalesce(target.next_episode_at, source.next_episode_at),
        next_episode_name = coalesce(nullif(trim(target.next_episode_name), ''), nullif(trim(source.next_episode_name), ''), target.next_episode_name, source.next_episode_name),
        schedule_note = coalesce(nullif(trim(target.schedule_note), ''), nullif(trim(source.schedule_note), ''), target.schedule_note, source.schedule_note),
        category = case when target.category is null or target.category::text = '[]' then source.category else target.category end,
        country = case when target.country is null or target.country::text = '[]' then source.country else target.country end,
        updated_at = now()
      from public.movies source
      where target.id = target_id
        and source.id = source_id;

      if to_regclass('public.movie_episodes') is not null then
        delete from public.movie_episodes source_ep
        using public.movie_episodes target_ep
        where source_ep.movie_id = source_id
          and target_ep.movie_id = target_id
          and lower(trim(coalesce(source_ep.server_name, ''))) = lower(trim(coalesce(target_ep.server_name, '')))
          and coalesce(source_ep.episode_number, -1) = coalesce(target_ep.episode_number, -1);

        update public.movie_episodes
        set movie_id = target_id,
            updated_at = now()
        where movie_id = source_id;
        get diagnostics affected_rows = row_count;
        moved_movie_episodes := moved_movie_episodes + affected_rows;
      end if;

      if to_regclass('public.episodes') is not null then
        delete from public.episodes source_ep
        using public.episodes target_ep
        where source_ep.movie_id = source_id
          and target_ep.movie_id = target_id
          and lower(trim(coalesce(source_ep.server_name, ''))) = lower(trim(coalesce(target_ep.server_name, '')))
          and lower(trim(coalesce(source_ep.episode_slug, ''))) = lower(trim(coalesce(target_ep.episode_slug, '')));

        update public.episodes
        set movie_id = target_id
        where movie_id = source_id;
        get diagnostics affected_rows = row_count;
        moved_episodes := moved_episodes + affected_rows;
      end if;

      if to_regclass('public.streams') is not null then
        delete from public.streams source_stream
        using public.streams target_stream
        where source_stream.movie_id = source_id
          and target_stream.movie_id = target_id
          and coalesce(source_stream.is_active, true) = true
          and coalesce(target_stream.is_active, true) = true
          and lower(trim(coalesce(source_stream.source, ''))) = lower(trim(coalesce(target_stream.source, '')))
          and lower(trim(coalesce(source_stream.server_name, ''))) = lower(trim(coalesce(target_stream.server_name, '')))
          and lower(trim(coalesce(source_stream.episode_slug, ''))) = lower(trim(coalesce(target_stream.episode_slug, '')));

        update public.streams
        set movie_id = target_id,
            updated_at = now()
        where movie_id = source_id;
        get diagnostics affected_rows = row_count;
        moved_streams := moved_streams + affected_rows;
      end if;

      if to_regclass('public.movie_sources') is not null then
        delete from public.movie_sources source_row
        using public.movie_sources target_row
        where source_row.movie_id = source_id
          and target_row.movie_id = target_id
          and coalesce(source_row.is_active, true) = true
          and coalesce(target_row.is_active, true) = true
          and lower(trim(coalesce(source_row.source_site, ''))) = lower(trim(coalesce(target_row.source_site, '')))
          and lower(trim(coalesce(source_row.source_slug, ''))) = lower(trim(coalesce(target_row.source_slug, '')));

        update public.movie_sources
        set movie_id = target_id,
            updated_at = now()
        where movie_id = source_id;
        get diagnostics affected_rows = row_count;
        moved_movie_sources := moved_movie_sources + affected_rows;
      end if;

      if to_regclass('public.stream_health_logs') is not null then
        update public.stream_health_logs
        set movie_id = target_id
        where movie_id = source_id;
        get diagnostics affected_rows = row_count;
        moved_stream_health_logs := moved_stream_health_logs + affected_rows;
      end if;

      delete from public.movie_api_cache
      where slug in (target_slug, (select slug from public.movies where id = source_id));

      insert into public.movie_slug_aliases (alias_slug, movie_id, canonical_slug, reason, updated_at)
      select slug, target_id, target_slug, 'auto-duplicate-candidates', now()
      from public.movies
      where id = source_id and slug <> target_slug
      on conflict (alias_slug) do update
      set movie_id = excluded.movie_id,
          canonical_slug = excluded.canonical_slug,
          reason = excluded.reason,
          updated_at = now();

      update public.movies
      set
        is_published = false,
        source_site = 'merged',
        source_name = 'Merged into ' || target_slug,
        tmdb_id = null,
        imdb_id = '',
        ophim_id = '',
        ophim_slug = null,
        updated_at = now()
      where id = source_id;

      merged_movies := merged_movies + 1;
    end loop;

    delete from public.home_page_cache where id <> '__never__';

    merge_summary := jsonb_build_object(
      'reason', group_rec.reason,
      'dedup_key', group_rec.dedup_key,
      'year', group_rec.year,
      'moved_movie_episodes', moved_movie_episodes,
      'moved_episodes', moved_episodes,
      'moved_streams', moved_streams,
      'moved_movie_sources', moved_movie_sources,
      'moved_stream_health_logs', moved_stream_health_logs
    );

    insert into public.movie_merge_audit (
      target_movie_id,
      target_slug,
      source_movie_ids,
      source_slugs,
      reason,
      summary
    )
    values (
      target_id,
      target_slug,
      source_ids,
      source_slugs,
      'auto-duplicate-candidates',
      merge_summary
    );

    merged_groups := merged_groups + 1;
  end loop;

  raise notice 'Merged % duplicate groups and % source movies', merged_groups, merged_movies;
end $$;
