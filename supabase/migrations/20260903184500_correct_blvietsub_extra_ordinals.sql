-- Some legacy Extra rows were numbered by their position inside a special-only
-- server block. Recover the provider's explicit ordinal retained in the server
-- label (for example "13 Extra") without touching normal episodes.
with parsed as (
  select
    episode.id,
    (regexp_match(episode.server_name, '([0-9]{1,4})\s+Extra\s*$', 'i'))[1]::integer as extra_ordinal
  from public.movie_episodes episode
  where episode.source = 'blvietsub'
    and episode.episode_number between -2999 and -2001
    and episode.server_name ~* '[0-9]{1,4}\s+Extra\s*$'
), safe as (
  select parsed.*
  from parsed
  join public.movie_episodes source_row on source_row.id = parsed.id
  where parsed.extra_ordinal > 0
    and not exists (
      select 1 from public.movie_episodes existing
      where existing.movie_id = source_row.movie_id
        and existing.server_name = source_row.server_name
        and existing.episode_number = -(2000 + parsed.extra_ordinal)
        and existing.id <> source_row.id
    )
)
update public.movie_episodes episode
set episode_number = -(2000 + safe.extra_ordinal),
    episode_name = format('Tập %s Extra', safe.extra_ordinal),
    slug = format('tap-extra-%s', safe.extra_ordinal)
from safe
where episode.id = safe.id;
