create table if not exists public.movie_slug_aliases (
  alias_slug text primary key,
  movie_id uuid not null references public.movies(id) on delete cascade,
  canonical_slug text not null,
  reason text not null default 'merge',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(alias_slug)) > 0),
  check (length(trim(canonical_slug)) > 0),
  check (alias_slug <> canonical_slug)
);

create index if not exists movie_slug_aliases_movie_id_idx
  on public.movie_slug_aliases(movie_id);

alter table public.movie_slug_aliases enable row level security;
revoke all on table public.movie_slug_aliases from public, anon, authenticated;
grant all on table public.movie_slug_aliases to service_role;
