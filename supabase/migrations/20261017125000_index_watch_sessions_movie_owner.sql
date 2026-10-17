-- Production was created concurrently in a standalone administration call.
-- Keep replay compatible with transaction-wrapped migration runners.
create index if not exists movie_watch_sessions_movie_owner_idx on public.movie_watch_sessions(movie_id);
