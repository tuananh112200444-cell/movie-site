create or replace function public.get_public_special_episodes(p_slug text)
returns table (
  movie_id uuid,
  server_name text,
  source text,
  episode_number integer,
  slug text,
  episode_name text,
  link_embed text,
  link_m3u8 text,
  subtitle_url text,
  audio_type text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.id,
    e.server_name,
    e.source,
    e.episode_number,
    e.slug,
    e.episode_name,
    e.link_embed,
    e.link_m3u8,
    e.subtitle_url,
    e.audio_type
  from public.movies m
  join public.movie_episodes e on e.movie_id = m.id
  where m.slug = p_slug
    and m.is_published = true
    and e.episode_number < 0
    and coalesce(lower(e.source), '') <> 'hidden'
    and (nullif(trim(e.link_embed), '') is not null or nullif(trim(e.link_m3u8), '') is not null)
  order by e.server_name, e.episode_number;
$$;

revoke all on function public.get_public_special_episodes(text) from public;
grant execute on function public.get_public_special_episodes(text) to anon, authenticated, service_role;

comment on function public.get_public_special_episodes(text) is
  'Returns only playable negative-number Pilot, Extra and Special episodes for one published movie.';
