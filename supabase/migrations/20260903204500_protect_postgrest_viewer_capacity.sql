-- Viewer-critical movie detail and playback reads must not queue behind
-- optional discovery RPCs. Both callers already have cached/static fallbacks.
alter function public.search_movies_smart(text, integer)
  set statement_timeout = '350ms';

alter function public.get_top10_movies_today(integer)
  set statement_timeout = '600ms';

comment on function public.search_movies_smart(text, integer) is
  'Typo-tolerant search with a bounded execution time so it cannot exhaust the PostgREST viewer pool.';

comment on function public.get_top10_movies_today(integer) is
  'First-party Top 10 with a bounded execution time; callers use cached/static fallback on timeout.';
