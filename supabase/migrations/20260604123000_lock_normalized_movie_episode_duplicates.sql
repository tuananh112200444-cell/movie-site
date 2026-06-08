-- Lock duplicate-prone keys after auditing the live database.
-- These expression indexes catch differences caused only by casing or spaces.

create unique index if not exists movies_imdb_id_lower_unique
  on public.movies ((lower(trim(imdb_id))))
  where nullif(trim(coalesce(imdb_id, '')), '') is not null;

create unique index if not exists movies_ophim_slug_lower_unique
  on public.movies ((lower(trim(ophim_slug))))
  where nullif(trim(coalesce(ophim_slug, '')), '') is not null;

create unique index if not exists movies_ophim_id_lower_unique
  on public.movies ((lower(trim(ophim_id))))
  where nullif(trim(coalesce(ophim_id, '')), '') is not null;

create unique index if not exists movie_sources_active_source_slug_lower_unique
  on public.movie_sources ((lower(trim(source_site))), (lower(trim(source_slug))))
  where is_active = true
    and nullif(trim(coalesce(source_site, '')), '') is not null
    and nullif(trim(coalesce(source_slug, '')), '') is not null;

create unique index if not exists movie_episodes_movie_server_number_lower_unique
  on public.movie_episodes (movie_id, (lower(trim(server_name))), episode_number)
  where nullif(trim(coalesce(server_name, '')), '') is not null
    and episode_number is not null;

create unique index if not exists episodes_movie_server_slug_lower_unique
  on public.episodes (movie_id, (lower(trim(server_name))), (lower(trim(episode_slug))))
  where nullif(trim(coalesce(server_name, '')), '') is not null
    and nullif(trim(coalesce(episode_slug, '')), '') is not null;

create unique index if not exists streams_active_movie_source_server_slug_lower_unique
  on public.streams (
    movie_id,
    (lower(trim(source))),
    (lower(trim(server_name))),
    (lower(trim(episode_slug)))
  )
  where is_active = true
    and nullif(trim(coalesce(source, '')), '') is not null
    and nullif(trim(coalesce(server_name, '')), '') is not null
    and nullif(trim(coalesce(episode_slug, '')), '') is not null;

create unique index if not exists external_movie_overrides_active_lower_unique
  on public.external_movie_overrides ((lower(trim(source_site))), (lower(trim(movie_slug))))
  where is_active = true
    and nullif(trim(coalesce(source_site, '')), '') is not null
    and nullif(trim(coalesce(movie_slug, '')), '') is not null;

create unique index if not exists external_episode_overrides_active_lower_unique
  on public.external_episode_overrides (
    (lower(trim(source_site))),
    (lower(trim(movie_slug))),
    coalesce(target_episode_number, -1),
    (lower(trim(coalesce(target_episode_slug, '')))),
    (lower(trim(coalesce(target_server_name, ''))))
  )
  where is_active = true
    and nullif(trim(coalesce(source_site, '')), '') is not null
    and nullif(trim(coalesce(movie_slug, '')), '') is not null;

create unique index if not exists thai_bl_movies_active_source_slug_lower_unique
  on public.thai_bl_movies ((lower(trim(source_site))), (lower(trim(source_slug))))
  where is_active = true
    and nullif(trim(coalesce(source_site, '')), '') is not null
    and nullif(trim(coalesce(source_slug, '')), '') is not null;

create unique index if not exists thai_bl_episodes_movie_server_lower_unique
  on public.thai_bl_episodes (movie_id, (lower(trim(server_name))))
  where nullif(trim(coalesce(server_name, '')), '') is not null;

create unique index if not exists thai_bl_streams_active_movie_episode_source_quality_lower_unique
  on public.thai_bl_streams (
    movie_id,
    (lower(trim(episode_slug))),
    (lower(trim(source_type))),
    (lower(trim(coalesce(quality, ''))))
  )
  where is_active = true
    and nullif(trim(coalesce(episode_slug, '')), '') is not null
    and nullif(trim(coalesce(source_type, '')), '') is not null;
