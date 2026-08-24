-- A source filename such as `03_The.New.One.Armed.Swordsman...` is not an
-- episode slug. The previous prefix-only regex promoted the movie to episode 3
-- and made the repair brain look for two episodes that do not exist.

create or replace function public.get_movie_playable_episode_numbers(p_movie_id uuid)
returns table(episode_number integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with legacy_links as materialized (
    select
      episode.episode_number::integer as episode_number,
      rtrim(replace(trim(coalesce(episode.link_m3u8, '')), '&amp;', '&'), '/') as direct_url,
      rtrim(replace(trim(coalesce(episode.link_embed, '')), '&amp;', '&'), '/') as embed_url
    from public.movie_episodes episode
    where episode.movie_id = p_movie_id
      and episode.episode_number between 1 and 10000
      and lower(trim(coalesce(episode.source, ''))) <> 'hidden'
      and (
        coalesce(trim(episode.link_m3u8), '') ~* '^https?://'
        or coalesce(trim(episode.link_embed), '') ~* '^https?://'
      )
    union all
    select
      episode.episode_number::integer,
      rtrim(replace(trim(coalesce(episode.link_m3u8, '')), '&amp;', '&'), '/'),
      rtrim(replace(trim(coalesce(episode.link_embed, '')), '&amp;', '&'), '/')
    from public.episodes episode
    where episode.movie_id = p_movie_id
      and episode.episode_number between 1 and 10000
      and (
        coalesce(trim(episode.link_m3u8), '') ~* '^https?://'
        or coalesce(trim(episode.link_embed), '') ~* '^https?://'
      )
  ), stream_health as materialized (
    select
      case
        when lower(trim(coalesce(stream.episode_slug, ''))) = 'full' then 1
        when trim(coalesce(stream.episode_slug, '')) ~* '^[0-9]{1,4}$'
          then trim(stream.episode_slug)::integer
        when trim(coalesce(stream.episode_slug, '')) ~* '^(tap|episode|ep)[-_ ]*0*[0-9]{1,4}$'
          then substring(trim(stream.episode_slug) from '([0-9]{1,4})$')::integer
        else null
      end as episode_number,
      rtrim(replace(trim(coalesce(stream.stream_url, '')), '&amp;', '&'), '/') as direct_url,
      rtrim(replace(trim(coalesce(stream.embed_url, '')), '&amp;', '&'), '/') as embed_url,
      public.stream_row_is_publicly_usable(stream) as is_usable
    from public.streams stream
    where stream.movie_id = p_movie_id
  ), playable as (
    select stream.episode_number
    from stream_health stream
    where stream.is_usable is true
      and stream.episode_number between 1 and 10000
    union
    select legacy.episode_number
    from legacy_links legacy
    where
      not exists (
        select 1
        from stream_health stream
        where (legacy.direct_url <> '' and legacy.direct_url in (stream.direct_url, stream.embed_url))
           or (legacy.embed_url <> '' and legacy.embed_url in (stream.direct_url, stream.embed_url))
      )
      or exists (
        select 1
        from stream_health stream
        where stream.is_usable is true
          and (
            (legacy.direct_url <> '' and legacy.direct_url in (stream.direct_url, stream.embed_url))
            or (legacy.embed_url <> '' and legacy.embed_url in (stream.direct_url, stream.embed_url))
          )
      )
  )
  select distinct playable.episode_number::integer
  from playable
  where playable.episode_number between 1 and 10000;
$$;

revoke all on function public.get_movie_playable_episode_numbers(uuid)
  from public, anon, authenticated;
grant execute on function public.get_movie_playable_episode_numbers(uuid)
  to service_role;

select public.reconcile_movie_release_state(movie.id)
from public.movies movie
where movie.slug in ('the-new-one-armed-swordsman', 'doi-dieu-tra-phap-y');

comment on function public.get_movie_playable_episode_numbers(uuid) is
  'Canonical health-aware episode truth. Stream slugs must be full, a pure number, or a strict tap/episode/ep number; source filenames never become episode numbers.';
