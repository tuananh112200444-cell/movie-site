alter table public.movies
  add column if not exists hero_backdrop_url text,
  add column if not exists hero_poster_url text;

comment on column public.movies.hero_backdrop_url is
  'Verified landscape artwork reserved for wide hero surfaces; never a stretched portrait poster.';

comment on column public.movies.hero_poster_url is
  'Verified portrait artwork reserved for poster cards paired with the hero backdrop.';
