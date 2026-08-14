-- Fast, exact catalogue ingestion for independent providers. The Edge parser
-- remains responsible for validating provider payloads and URLs; PostgreSQL
-- resolves canonical movie identity once and writes all episode rows in sets.

create table if not exists public.provider_movie_identities (
  provider text not null check (provider in ('phimapi', 'nguonc', 'vsmov', 'ophim')),
  provider_slug text not null,
  provider_id text not null default '',
  movie_id uuid not null references public.movies(id) on delete cascade,
  normalized_name text not null default '',
  release_year integer,
  movie_type text not null default '',
  payload_hash text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (provider, provider_slug)
);

create index if not exists provider_movie_identities_movie_idx
  on public.provider_movie_identities (movie_id, provider);

alter table public.provider_movie_identities
  add column if not exists payload_hash text not null default '';

alter table public.provider_movie_identities enable row level security;
revoke all on table public.provider_movie_identities from public, anon, authenticated;
grant select, insert, update, delete on table public.provider_movie_identities to service_role;

create or replace function public.provider_movie_type_class(p_type text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when lower(trim(coalesce(p_type, ''))) in ('single', 'movie', 'phim-le', 'phim le', 'phim-chieu-rap') then 'single'
    when lower(trim(coalesce(p_type, ''))) in ('series', 'tv', 'phim-bo', 'phim bo', 'hoathinh') then 'series'
    else ''
  end
$$;

create or replace function public.bulk_ingest_provider_catalog(
  p_provider text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  movie jsonb;
  v_provider_slug text;
  v_provider_id text;
  v_normalized_name text;
  v_incoming_type text;
  v_incoming_type_class text;
  v_release_year integer;
  v_target_movie_id uuid;
  v_target_slug text;
  v_target_source text;
  v_source_name text;
  v_payload_hash text;
  v_existing_payload_hash text;
  created_count integer := 0;
  updated_count integer := 0;
  episode_count integer := 0;
  item_count integer := 0;
begin
  if p_provider not in ('phimapi', 'nguonc') then
    raise exception 'Unsupported bulk catalogue provider: %', p_provider;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Bulk catalogue payload must contain 1..20 items';
  end if;

  v_source_name := case p_provider when 'phimapi' then 'KKPhim' else 'NguonC' end;

  create temporary table if not exists bulk_provider_map (
    provider_slug text primary key,
    movie_id uuid not null,
    provider_id text not null
  ) on commit drop;
  truncate table bulk_provider_map;

  for item in select value from jsonb_array_elements(p_items)
  loop
    movie := coalesce(item->'movie', '{}'::jsonb);
    v_provider_slug := lower(trim(coalesce(item->>'provider_slug', movie->>'slug', '')));
    v_provider_id := trim(coalesce(item->>'provider_id', v_provider_slug));
    v_normalized_name := trim(coalesce(movie->>'normalized_name', ''));
    v_incoming_type := trim(coalesce(movie->>'type', ''));
    v_incoming_type_class := public.provider_movie_type_class(v_incoming_type);
    v_release_year := nullif(coalesce(movie->>'year', ''), '')::integer;
    v_target_movie_id := null;
    v_target_slug := null;
    v_target_source := null;
    v_payload_hash := md5(item::text);
    v_existing_payload_hash := null;

    if v_provider_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'Invalid provider slug: %', v_provider_slug;
    end if;

    select identity.movie_id, identity.payload_hash
    into v_target_movie_id, v_existing_payload_hash
    from public.provider_movie_identities identity
    where identity.provider = p_provider
      and identity.provider_slug = v_provider_slug;

    -- A matching hash can only come from a previously committed complete RPC
    -- transaction, so no movie/episode/stream work is required on replay.
    if v_target_movie_id is not null and v_existing_payload_hash = v_payload_hash then
      update public.provider_movie_identities
      set last_seen_at = now()
      where provider = p_provider and provider_slug = v_provider_slug;
      item_count := item_count + 1;
      continue;
    end if;

    if v_target_movie_id is null then
      select candidate.id
      into v_target_movie_id
      from public.movies candidate
      where candidate.slug = v_provider_slug
        and lower(concat_ws(' ', candidate.source_site, candidate.source_name)) !~ '(admin-queer|blvietsub)'
        and (
          public.provider_movie_type_class(candidate.type) = ''
          or v_incoming_type_class = ''
          or public.provider_movie_type_class(candidate.type) = v_incoming_type_class
        )
        and (
          v_release_year is null or v_release_year <= 0
          or coalesce(candidate.year, 0) <= 0
          or candidate.year = v_release_year
        )
      limit 1;
    end if;

    if v_target_movie_id is null and v_release_year > 0 and length(v_normalized_name) >= 6 then
      select candidate.id
      into v_target_movie_id
      from public.movies candidate
      where candidate.normalized_name = v_normalized_name
        and candidate.year = v_release_year
        and lower(concat_ws(' ', candidate.source_site, candidate.source_name)) !~ '(admin-queer|blvietsub)'
        and (
          public.provider_movie_type_class(candidate.type) = ''
          or v_incoming_type_class = ''
          or public.provider_movie_type_class(candidate.type) = v_incoming_type_class
        )
      order by candidate.is_published desc, candidate.updated_at desc nulls last
      limit 1;
    end if;

    if v_target_movie_id is null and v_release_year > 0 then
      select candidate.id
      into v_target_movie_id
      from public.movies candidate
      where candidate.year = v_release_year
        and lower(concat_ws(' ', candidate.source_site, candidate.source_name)) !~ '(admin-queer|blvietsub)'
        and (
          lower(trim(candidate.name)) in (lower(trim(movie->>'name')), lower(trim(movie->>'origin_name')))
          or lower(trim(candidate.origin_name)) in (lower(trim(movie->>'name')), lower(trim(movie->>'origin_name')))
        )
        and (
          public.provider_movie_type_class(candidate.type) = ''
          or v_incoming_type_class = ''
          or public.provider_movie_type_class(candidate.type) = v_incoming_type_class
        )
      order by candidate.is_published desc, candidate.updated_at desc nulls last
      limit 1;
    end if;

    if v_target_movie_id is null then
      v_target_slug := v_provider_slug;
      if exists (select 1 from public.movies where slug = v_target_slug) then
        v_target_slug := p_provider || '-' || v_provider_slug;
      end if;
      if exists (select 1 from public.movies where slug = v_target_slug) then
        v_target_slug := p_provider || '-' || v_provider_slug || '-' || substr(md5(v_provider_id), 1, 8);
      end if;

      insert into public.movies (
        slug, name, origin_name, content, type, status, thumb_url, poster_url,
        quality, lang, time, episode_current, episode_total, year, actor,
        director, category, country, trailer_url, notify, showtimes, source_site,
        source_name, normalized_name, title_vi, title_en, title_original,
        current_episode, total_episodes, last_synced_at, updated_at, is_published,
        seo_catalog_status
      ) values (
        v_target_slug,
        coalesce(movie->>'name', v_provider_slug),
        coalesce(movie->>'origin_name', ''),
        coalesce(movie->>'content', ''),
        v_incoming_type,
        coalesce(movie->>'status', 'ongoing'),
        coalesce(movie->>'thumb_url', ''),
        coalesce(movie->>'poster_url', movie->>'thumb_url', ''),
        coalesce(movie->>'quality', 'HD'),
        coalesce(movie->>'lang', 'Vietsub'),
        coalesce(movie->>'time', ''),
        coalesce(movie->>'episode_current', ''),
        coalesce(movie->>'episode_total', ''),
        v_release_year,
        array(select jsonb_array_elements_text(coalesce(movie->'actor', '[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(movie->'director', '[]'::jsonb))),
        coalesce(movie->'category', '[]'::jsonb),
        coalesce(movie->'country', '[]'::jsonb),
        coalesce(movie->>'trailer_url', ''),
        coalesce(movie->>'notify', ''),
        coalesce(movie->>'showtimes', ''),
        p_provider,
        v_source_name,
        v_normalized_name,
        coalesce(movie->>'title_vi', movie->>'name', v_provider_slug),
        coalesce(movie->>'title_en', movie->>'origin_name', ''),
        coalesce(movie->>'title_original', movie->>'origin_name', movie->>'name', v_provider_slug),
        nullif(coalesce(movie->>'current_episode', ''), '')::integer,
        nullif(coalesce(movie->>'total_episodes', ''), '')::integer,
        now(), now(), false, 'awaiting_playback'
      )
      returning id into v_target_movie_id;
      created_count := created_count + 1;
    else
      select source_site into v_target_source from public.movies where id = v_target_movie_id;
      if lower(coalesce(v_target_source, '')) = p_provider then
        update public.movies set
          name = coalesce(nullif(movie->>'name', ''), name),
          origin_name = coalesce(nullif(movie->>'origin_name', ''), origin_name),
          content = coalesce(nullif(movie->>'content', ''), content),
          type = coalesce(nullif(v_incoming_type, ''), type),
          status = coalesce(nullif(movie->>'status', ''), status),
          thumb_url = coalesce(nullif(movie->>'thumb_url', ''), thumb_url),
          poster_url = coalesce(nullif(movie->>'poster_url', ''), poster_url),
          quality = coalesce(nullif(movie->>'quality', ''), quality),
          lang = coalesce(nullif(movie->>'lang', ''), lang),
          time = coalesce(nullif(movie->>'time', ''), time),
          episode_current = coalesce(nullif(movie->>'episode_current', ''), episode_current),
          episode_total = coalesce(nullif(movie->>'episode_total', ''), episode_total),
          year = coalesce(v_release_year, year),
          actor = case when jsonb_array_length(coalesce(movie->'actor', '[]'::jsonb)) > 0
            then array(select jsonb_array_elements_text(movie->'actor')) else actor end,
          director = case when jsonb_array_length(coalesce(movie->'director', '[]'::jsonb)) > 0
            then array(select jsonb_array_elements_text(movie->'director')) else director end,
          category = case when jsonb_array_length(coalesce(movie->'category', '[]'::jsonb)) > 0 then movie->'category' else category end,
          country = case when jsonb_array_length(coalesce(movie->'country', '[]'::jsonb)) > 0 then movie->'country' else country end,
          normalized_name = coalesce(nullif(v_normalized_name, ''), movies.normalized_name),
          current_episode = greatest(coalesce(current_episode, 0), coalesce(nullif(movie->>'current_episode', '')::integer, 0)),
          total_episodes = greatest(coalesce(total_episodes, 0), coalesce(nullif(movie->>'total_episodes', '')::integer, 0)),
          last_synced_at = now(),
          updated_at = now()
        where id = v_target_movie_id
          and (
            movies.name is distinct from coalesce(nullif(movie->>'name', ''), movies.name)
            or movies.origin_name is distinct from coalesce(nullif(movie->>'origin_name', ''), movies.origin_name)
            or movies.content is distinct from coalesce(nullif(movie->>'content', ''), movies.content)
            or movies.type is distinct from coalesce(nullif(v_incoming_type, ''), movies.type)
            or movies.status is distinct from coalesce(nullif(movie->>'status', ''), movies.status)
            or movies.thumb_url is distinct from coalesce(nullif(movie->>'thumb_url', ''), movies.thumb_url)
            or movies.poster_url is distinct from coalesce(nullif(movie->>'poster_url', ''), movies.poster_url)
            or movies.quality is distinct from coalesce(nullif(movie->>'quality', ''), movies.quality)
            or movies.lang is distinct from coalesce(nullif(movie->>'lang', ''), movies.lang)
            or movies.time is distinct from coalesce(nullif(movie->>'time', ''), movies.time)
            or movies.episode_current is distinct from coalesce(nullif(movie->>'episode_current', ''), movies.episode_current)
            or movies.episode_total is distinct from coalesce(nullif(movie->>'episode_total', ''), movies.episode_total)
            or movies.year is distinct from coalesce(v_release_year, movies.year)
            or movies.normalized_name is distinct from coalesce(nullif(v_normalized_name, ''), movies.normalized_name)
            or coalesce(movies.current_episode, 0) < coalesce(nullif(movie->>'current_episode', '')::integer, 0)
            or coalesce(movies.total_episodes, 0) < coalesce(nullif(movie->>'total_episodes', '')::integer, 0)
          );
      else
        update public.movies set
          current_episode = greatest(coalesce(current_episode, 0), coalesce(nullif(movie->>'current_episode', '')::integer, 0)),
          total_episodes = greatest(coalesce(total_episodes, 0), coalesce(nullif(movie->>'total_episodes', '')::integer, 0)),
          last_synced_at = now()
        where id = v_target_movie_id
          and (
            coalesce(movies.current_episode, 0) < coalesce(nullif(movie->>'current_episode', '')::integer, 0)
            or coalesce(movies.total_episodes, 0) < coalesce(nullif(movie->>'total_episodes', '')::integer, 0)
          );
      end if;
      updated_count := updated_count + 1;
    end if;

    insert into public.provider_movie_identities as identity (
      provider, provider_slug, provider_id, movie_id, normalized_name,
      release_year, movie_type, payload_hash, first_seen_at, last_seen_at
    ) values (
      p_provider, v_provider_slug, v_provider_id, v_target_movie_id, v_normalized_name,
      v_release_year, v_incoming_type, v_payload_hash, now(), now()
    )
    on conflict (provider, provider_slug) do update set
      provider_id = excluded.provider_id,
      movie_id = excluded.movie_id,
      normalized_name = excluded.normalized_name,
      release_year = excluded.release_year,
      movie_type = excluded.movie_type,
      payload_hash = excluded.payload_hash,
      last_seen_at = now();

    insert into bulk_provider_map(provider_slug, movie_id, provider_id)
    values (v_provider_slug, v_target_movie_id, v_provider_id)
    on conflict (provider_slug) do update set
      movie_id = excluded.movie_id,
      provider_id = excluded.provider_id;
    item_count := item_count + 1;
  end loop;

  with episode_rows as (
    select
      mapping.movie_id,
      mapping.provider_id,
      greatest(0, coalesce(nullif(episode->>'number', '')::integer, 0)) as episode_number,
      coalesce(episode->>'name', '') as episode_name,
      lower(trim(coalesce(episode->>'slug', ''))) as episode_slug,
      trim(coalesce(episode->>'server_name', v_source_name)) as server_name,
      coalesce(episode->>'link_m3u8', '') as link_m3u8,
      coalesce(episode->>'link_embed', '') as link_embed,
      coalesce(episode->'raw', '{}'::jsonb) as raw
    from jsonb_array_elements(p_items) item_row(item)
    join bulk_provider_map mapping on mapping.provider_slug = lower(trim(item_row.item->>'provider_slug'))
    cross join lateral jsonb_array_elements(coalesce(item_row.item->'episodes', '[]'::jsonb)) episode
    where lower(trim(coalesce(episode->>'slug', ''))) <> ''
      and (coalesce(episode->>'link_m3u8', '') <> '' or coalesce(episode->>'link_embed', '') <> '')
  )
  insert into public.movie_episodes (
    movie_id, ophim_id, episode_number, episode_name, slug, server_name,
    link_m3u8, link_embed, thumbnail_url, duration, source, is_backup
  )
  select distinct on (movie_id, lower(server_name), episode_number)
    movie_id, provider_id, episode_number, episode_name, episode_slug,
    server_name, link_m3u8, link_embed, '', '', p_provider, true
  from episode_rows
  where episode_number > 0
  order by movie_id, lower(server_name), episode_number, episode_slug
  on conflict (movie_id, server_name, episode_number) do update set
    ophim_id = excluded.ophim_id,
    episode_name = excluded.episode_name,
    slug = excluded.slug,
    link_m3u8 = excluded.link_m3u8,
    link_embed = excluded.link_embed,
    source = excluded.source,
    is_backup = excluded.is_backup,
    updated_at = now()
  where movie_episodes.ophim_id is distinct from excluded.ophim_id
    or movie_episodes.episode_name is distinct from excluded.episode_name
    or movie_episodes.slug is distinct from excluded.slug
    or movie_episodes.link_m3u8 is distinct from excluded.link_m3u8
    or movie_episodes.link_embed is distinct from excluded.link_embed
    or movie_episodes.source is distinct from excluded.source
    or movie_episodes.is_backup is distinct from excluded.is_backup;

  with episode_rows as (
    select
      mapping.movie_id,
      mapping.provider_id,
      greatest(0, coalesce(nullif(episode->>'number', '')::integer, 0)) as episode_number,
      coalesce(episode->>'name', '') as episode_name,
      lower(trim(coalesce(episode->>'slug', ''))) as episode_slug,
      trim(coalesce(episode->>'server_name', v_source_name)) as server_name,
      coalesce(episode->>'link_m3u8', '') as link_m3u8,
      coalesce(episode->>'link_embed', '') as link_embed,
      coalesce(episode->'raw', '{}'::jsonb) as raw
    from jsonb_array_elements(p_items) item_row(item)
    join bulk_provider_map mapping on mapping.provider_slug = lower(trim(item_row.item->>'provider_slug'))
    cross join lateral jsonb_array_elements(coalesce(item_row.item->'episodes', '[]'::jsonb)) episode
    where lower(trim(coalesce(episode->>'slug', ''))) <> ''
      and (coalesce(episode->>'link_m3u8', '') <> '' or coalesce(episode->>'link_embed', '') <> '')
  )
  insert into public.episodes (
    movie_id, ophim_id, server_name, episode_number, episode_name,
    episode_slug, link_m3u8, link_embed, server_data
  )
  select distinct on (movie_id, lower(server_name), lower(episode_slug))
    movie_id, provider_id, server_name, episode_number, episode_name,
    episode_slug, link_m3u8, link_embed, raw
  from episode_rows
  order by movie_id, lower(server_name), lower(episode_slug), episode_number desc
  on conflict (movie_id, server_name, episode_slug) do update set
    ophim_id = excluded.ophim_id,
    episode_number = excluded.episode_number,
    episode_name = excluded.episode_name,
    link_m3u8 = excluded.link_m3u8,
    link_embed = excluded.link_embed,
    server_data = excluded.server_data
  where episodes.ophim_id is distinct from excluded.ophim_id
    or episodes.episode_number is distinct from excluded.episode_number
    or episodes.episode_name is distinct from excluded.episode_name
    or episodes.link_m3u8 is distinct from excluded.link_m3u8
    or episodes.link_embed is distinct from excluded.link_embed
    or episodes.server_data is distinct from excluded.server_data;

  with episode_rows as (
    select
      mapping.movie_id,
      mapping.provider_id,
      lower(trim(coalesce(episode->>'slug', ''))) as episode_slug,
      trim(coalesce(episode->>'server_name', v_source_name)) as server_name,
      coalesce(episode->>'link_m3u8', '') as link_m3u8,
      coalesce(episode->>'link_embed', '') as link_embed
    from jsonb_array_elements(p_items) item_row(item)
    join bulk_provider_map mapping on mapping.provider_slug = lower(trim(item_row.item->>'provider_slug'))
    cross join lateral jsonb_array_elements(coalesce(item_row.item->'episodes', '[]'::jsonb)) episode
    where lower(trim(coalesce(episode->>'slug', ''))) <> ''
      and (coalesce(episode->>'link_m3u8', '') <> '' or coalesce(episode->>'link_embed', '') <> '')
  ), inserted as (
    insert into public.streams (
      movie_id, ophim_id, episode_slug, source, server_name, stream_url,
      embed_url, priority, is_active, health_status, failure_count, last_error,
      last_checked_at, updated_at
    )
    select distinct on (movie_id, lower(episode_slug), lower(server_name))
      movie_id, provider_id, episode_slug, p_provider, server_name,
      link_m3u8, link_embed, 1, true, 'unchecked', 0,
      'Provider verification pending: ' || p_provider, null, now()
    from episode_rows
    order by movie_id, lower(episode_slug), lower(server_name)
    on conflict (movie_id, episode_slug, source, server_name) do update set
      ophim_id = excluded.ophim_id,
      stream_url = excluded.stream_url,
      embed_url = excluded.embed_url,
      is_active = true,
      health_status = case
        when streams.stream_url is distinct from excluded.stream_url
          or streams.embed_url is distinct from excluded.embed_url
          then 'unchecked'
        else streams.health_status
      end,
      failure_count = case
        when streams.stream_url is distinct from excluded.stream_url
          or streams.embed_url is distinct from excluded.embed_url
          then 0
        else streams.failure_count
      end,
      last_error = case
        when streams.stream_url is distinct from excluded.stream_url
          or streams.embed_url is distinct from excluded.embed_url
          then excluded.last_error
        else streams.last_error
      end,
      last_checked_at = case
        when streams.stream_url is distinct from excluded.stream_url
          or streams.embed_url is distinct from excluded.embed_url
          then null
        else streams.last_checked_at
      end,
      updated_at = now()
    where streams.ophim_id is distinct from excluded.ophim_id
      or streams.stream_url is distinct from excluded.stream_url
      or streams.embed_url is distinct from excluded.embed_url
      or streams.is_active is distinct from true
    returning 1
  )
  select count(*) into episode_count from inserted;

  return jsonb_build_object(
    'success', true,
    'scanned', item_count,
    'created', created_count,
    'updated', updated_count,
    'episodes_inserted', episode_count,
    'errors', '[]'::jsonb,
    'transient_errors', '[]'::jsonb
  );
end;
$$;

revoke all on function public.provider_movie_type_class(text) from public, anon, authenticated;
revoke all on function public.bulk_ingest_provider_catalog(text, jsonb) from public, anon, authenticated;
grant execute on function public.provider_movie_type_class(text) to service_role;
grant execute on function public.bulk_ingest_provider_catalog(text, jsonb) to service_role;

comment on function public.bulk_ingest_provider_catalog(text, jsonb) is
  'Set-based provider movie/episode/stream ingestion with durable provider identity mapping.';
