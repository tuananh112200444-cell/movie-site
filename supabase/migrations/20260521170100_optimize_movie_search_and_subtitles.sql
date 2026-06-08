
create extension if not exists pg_trgm with schema extensions;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subtitles',
  'subtitles',
  true,
  5242880,
  array['text/vtt', 'text/plain', 'application/x-subrip']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists movies_published_updated_idx
  on public.movies (is_published, updated_at desc);

create index if not exists movies_slug_published_idx
  on public.movies (slug)
  where is_published = true;

create index if not exists movies_ophim_slug_published_idx
  on public.movies (ophim_slug)
  where is_published = true;

create index if not exists movies_tmdb_id_idx
  on public.movies (tmdb_id)
  where tmdb_id is not null;

create index if not exists movies_imdb_id_idx
  on public.movies (imdb_id)
  where imdb_id is not null and imdb_id <> '';

create index if not exists movies_name_trgm_idx
  on public.movies using gin (name gin_trgm_ops)
  where is_published = true;

create index if not exists movies_origin_name_trgm_idx
  on public.movies using gin (origin_name gin_trgm_ops)
  where is_published = true;

create index if not exists movies_title_vi_trgm_idx
  on public.movies using gin (title_vi gin_trgm_ops)
  where is_published = true;

create index if not exists movies_title_en_trgm_idx
  on public.movies using gin (title_en gin_trgm_ops)
  where is_published = true;

create index if not exists movies_normalized_name_trgm_idx
  on public.movies using gin (normalized_name gin_trgm_ops)
  where is_published = true;

create index if not exists movies_slug_trgm_idx
  on public.movies using gin (slug gin_trgm_ops)
  where is_published = true;

create index if not exists movie_episodes_movie_number_idx
  on public.movie_episodes (movie_id, episode_number, server_name);

create index if not exists episodes_movie_number_idx
  on public.episodes (movie_id, episode_number);

create index if not exists streams_movie_active_priority_idx
  on public.streams (movie_id, is_active, priority desc);