create unique index if not exists movie_episodes_movie_server_number_unique
  on public.movie_episodes (movie_id, server_name, episode_number);