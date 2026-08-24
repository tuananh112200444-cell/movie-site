-- Keep database publication truth aligned with the frontend/detail API: a
-- verified 404/410/DNS/refused failure is conclusive on the first probe and
-- must not be shown to more viewers. PhimAPI's browser-managed iframe remains
-- the narrow exception because its direct CDN probe can return a false 404.

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
      and (
        coalesce(p_stream.failure_count, 0) >= 3
        or (
          coalesce(p_stream.last_error, '') ~* '(HTTP|segment|playlist|manifest)[[:space:]]*(404|410)|ENOTFOUND|NXDOMAIN|name not resolved|could not resolve host|connection refused'
          and coalesce(p_stream.embed_url, '') !~* '^https?://player[.]phimapi[.]com/player/'
        )
      )
    )
    and not (
      lower(trim(coalesce(p_stream.health_status, 'unchecked'))) = 'blocked'
      and coalesce(p_stream.embed_url, '') !~* '^https?://player[.]phimapi[.]com/player/'
      and coalesce(p_stream.embed_url, '') !~* '^https?://[^/]*streamc[.]xyz/'
    );
$$;

revoke all on function public.stream_row_is_publicly_usable(public.streams)
  from public, anon, authenticated;
grant execute on function public.stream_row_is_publicly_usable(public.streams)
  to service_role;

select public.reconcile_movie_release_state(movie.id)
from public.movies movie
where movie.slug = 'doi-dieu-tra-phap-y';

comment on function public.stream_row_is_publicly_usable(public.streams) is
  'Canonical public stream gate: conclusive 404/410/DNS/refused failures are hidden immediately; repeated ambiguous failures still require three probes; browser-managed PhimAPI is the narrow false-404 exception.';
