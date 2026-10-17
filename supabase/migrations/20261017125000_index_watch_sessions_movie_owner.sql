-- Standalone concurrent index: do not wrap in a transaction.
create index concurrently if not exists movie_watch_sessions_movie_owner_idx on public.movie_watch_sessions(movie_id);
