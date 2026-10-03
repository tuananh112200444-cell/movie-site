create extension if not exists pgcrypto;

create table if not exists public.movie_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_slug text not null check (length(movie_slug) between 1 and 180),
  author_name text not null check (length(author_name) between 1 and 60),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (length(body) between 3 and 1000),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists movie_comments_slug_created_idx
  on public.movie_comments (movie_slug, created_at desc)
  where status = 'visible';

alter table public.movie_comments enable row level security;

drop policy if exists "Anyone reads visible movie comments" on public.movie_comments;
create policy "Anyone reads visible movie comments"
  on public.movie_comments for select
  using (status = 'visible' or auth.uid() = user_id);

drop policy if exists "Users update own visible movie comments" on public.movie_comments;
create policy "Users update own visible movie comments"
  on public.movie_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'visible');

drop policy if exists "Users delete own movie comments" on public.movie_comments;
create policy "Users delete own movie comments"
  on public.movie_comments for delete
  using (auth.uid() = user_id);

revoke select on public.movie_comments from anon, authenticated;
grant update (rating, body, updated_at) on public.movie_comments to authenticated;
grant delete on public.movie_comments to authenticated;

create or replace function public.get_public_movie_comments(p_movie_slug text)
returns table (
  id uuid,
  movie_slug text,
  author_name text,
  rating smallint,
  body text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.movie_slug, c.author_name, c.rating, c.body, c.created_at, c.updated_at
  from public.movie_comments c
  where c.movie_slug = p_movie_slug and c.status = 'visible'
  order by c.created_at desc
  limit 100;
$$;

revoke all on function public.get_public_movie_comments(text) from public;
grant execute on function public.get_public_movie_comments(text) to anon, authenticated;

create table if not exists public.movie_comment_likes (
  comment_id uuid not null references public.movie_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.movie_comment_likes enable row level security;

drop policy if exists "Users add own comment likes" on public.movie_comment_likes;
create policy "Users add own comment likes"
  on public.movie_comment_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users remove own comment likes" on public.movie_comment_likes;
create policy "Users remove own comment likes"
  on public.movie_comment_likes for delete
  using (auth.uid() = user_id);

revoke select on public.movie_comment_likes from anon, authenticated;
grant insert (comment_id, user_id) on public.movie_comment_likes to authenticated;
grant delete on public.movie_comment_likes to authenticated;

create or replace function public.get_movie_comment_engagement(p_movie_slug text)
returns table (comment_id uuid, likes bigint, liked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as comment_id,
    count(l.user_id) as likes,
    bool_or(l.user_id = auth.uid()) as liked
  from public.movie_comments c
  left join public.movie_comment_likes l on l.comment_id = c.id
  where c.movie_slug = p_movie_slug and c.status = 'visible'
  group by c.id;
$$;

revoke all on function public.get_movie_comment_engagement(text) from public;
grant execute on function public.get_movie_comment_engagement(text) to anon, authenticated;

create or replace function public.submit_movie_comment(
  p_movie_slug text,
  p_rating integer,
  p_body text,
  p_author_name text default null
)
returns public.movie_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_author_name text;
  v_result public.movie_comments;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_movie_slug, ''))) not between 1 and 180 then
    raise exception 'Invalid movie slug';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  if length(trim(coalesce(p_body, ''))) not between 3 and 1000 then
    raise exception 'Comment must be between 3 and 1000 characters';
  end if;
  if (
    select count(*) from public.movie_comments
    where user_id = v_user_id and created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Too many comments. Please wait before posting again.';
  end if;

  v_author_name := left(trim(coalesce(nullif(p_author_name, ''), 'Thành viên KhoPhim')), 60);
  insert into public.movie_comments (user_id, movie_slug, author_name, rating, body)
  values (v_user_id, trim(p_movie_slug), v_author_name, p_rating, trim(p_body))
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.submit_movie_comment(text, integer, text, text) from public;
grant execute on function public.submit_movie_comment(text, integer, text, text) to authenticated;

create table if not exists public.movie_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  request_type text not null check (request_type in ('movie', 'missing_episode', 'source')),
  movie_name text not null check (length(movie_name) between 2 and 180),
  movie_url text check (movie_url is null or length(movie_url) <= 500),
  details text check (details is null or length(details) <= 1000),
  contact text check (contact is null or length(contact) <= 180),
  requester_hash text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists movie_requests_status_created_idx
  on public.movie_requests (status, created_at desc);
create index if not exists movie_requests_requester_created_idx
  on public.movie_requests (requester_hash, created_at desc);

alter table public.movie_requests enable row level security;

drop policy if exists "Users read own movie requests" on public.movie_requests;
create policy "Users read own movie requests"
  on public.movie_requests for select
  using (auth.uid() is not null and auth.uid() = user_id);

grant select on public.movie_requests to authenticated;
revoke insert, update, delete on public.movie_requests from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'movie_comments'
  ) then
    alter publication supabase_realtime add table public.movie_comments;
  end if;
end $$;
