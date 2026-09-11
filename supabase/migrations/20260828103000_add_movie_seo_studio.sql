create table if not exists public.movie_seo_profiles (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  slug text not null unique,
  focus_keyword text not null default '',
  secondary_keywords text[] not null default '{}',
  seo_title text not null default '',
  meta_description text not null default '',
  canonical_path text not null default '',
  og_image_url text not null default '',
  index_mode text not null default 'auto',
  intro_content text not null default '',
  review_content text not null default '',
  faq jsonb not null default '[]'::jsonb,
  topic_links jsonb not null default '[]'::jsonb,
  movie_patch jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  validation_score integer not null default 0,
  validation_issues jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movie_seo_profiles_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint movie_seo_profiles_index_mode_check check (index_mode in ('auto', 'index', 'noindex')),
  constraint movie_seo_profiles_status_check check (status in ('draft', 'published')),
  constraint movie_seo_profiles_score_check check (validation_score between 0 and 100),
  constraint movie_seo_profiles_faq_array_check check (jsonb_typeof(faq) = 'array'),
  constraint movie_seo_profiles_topic_links_array_check check (jsonb_typeof(topic_links) = 'array'),
  constraint movie_seo_profiles_movie_patch_object_check check (jsonb_typeof(movie_patch) = 'object')
);

create index if not exists movie_seo_profiles_status_updated_idx
  on public.movie_seo_profiles (status, updated_at desc);
create index if not exists movie_seo_profiles_focus_keyword_idx
  on public.movie_seo_profiles (lower(focus_keyword));

alter table public.movie_seo_profiles enable row level security;

drop policy if exists movie_seo_profiles_public_published on public.movie_seo_profiles;
create policy movie_seo_profiles_public_published
  on public.movie_seo_profiles
  for select
  to anon, authenticated
  using (status = 'published');

revoke all on table public.movie_seo_profiles from public, anon, authenticated;
grant select on table public.movie_seo_profiles to anon, authenticated;
grant all on table public.movie_seo_profiles to service_role;

create or replace function public.publish_movie_seo_profile(p_movie_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile public.movie_seo_profiles%rowtype;
  movie_row public.movies%rowtype;
  patch jsonb;
  now_value timestamptz := now();
  review_words integer := 0;
begin
  select * into profile
  from public.movie_seo_profiles
  where movie_id = p_movie_id
  for update;

  if not found then
    raise exception 'SEO profile not found';
  end if;

  select * into movie_row
  from public.movies
  where id = p_movie_id
  for update;

  if not found then
    raise exception 'Movie not found';
  end if;

  if profile.validation_score < 70 then
    raise exception 'SEO validation score must be at least 70';
  end if;

  if profile.index_mode = 'index' and profile.validation_score < 80 then
    raise exception 'Manual indexing requires an SEO validation score of at least 80';
  end if;

  patch := coalesce(profile.movie_patch, '{}'::jsonb);

  update public.movies
  set
    name = coalesce(nullif(trim(patch->>'name'), ''), movie_row.name),
    title_vi = coalesce(nullif(trim(patch->>'title_vi'), ''), movie_row.title_vi),
    title_en = coalesce(nullif(trim(patch->>'title_en'), ''), movie_row.title_en),
    origin_name = coalesce(nullif(trim(patch->>'origin_name'), ''), movie_row.origin_name),
    content = profile.intro_content,
    year = case when coalesce(patch->>'year', '') ~ '^\d{4}$' then (patch->>'year')::integer else movie_row.year end,
    quality = coalesce(nullif(trim(patch->>'quality'), ''), movie_row.quality),
    lang = coalesce(nullif(trim(patch->>'lang'), ''), movie_row.lang),
    trailer_url = coalesce(nullif(trim(patch->>'trailer_url'), ''), movie_row.trailer_url),
    thumb_url = coalesce(nullif(trim(patch->>'thumb_url'), ''), movie_row.thumb_url),
    poster_url = coalesce(nullif(trim(patch->>'poster_url'), ''), movie_row.poster_url),
    actor = case
      when jsonb_typeof(patch->'actor') = 'array' then array(select jsonb_array_elements_text(patch->'actor'))
      else movie_row.actor
    end,
    director = case
      when jsonb_typeof(patch->'director') = 'array' then array(select jsonb_array_elements_text(patch->'director'))
      else movie_row.director
    end,
    category = case
      when jsonb_typeof(patch->'category') = 'array' then patch->'category'
      else movie_row.category
    end,
    country = case
      when jsonb_typeof(patch->'country') = 'array' then patch->'country'
      else movie_row.country
    end,
    is_published = true,
    updated_at = now_value
  where id = p_movie_id;

  if length(trim(profile.review_content)) > 0 then
    review_words := cardinality(regexp_split_to_array(trim(profile.review_content), '\s+'));
    insert into public.movie_reviews (
      slug, movie_name, origin_name, content, word_count,
      generated_at, updated_at
    ) values (
      profile.slug,
      coalesce(nullif(trim(patch->>'name'), ''), movie_row.name),
      coalesce(nullif(trim(patch->>'origin_name'), ''), movie_row.origin_name),
      profile.review_content,
      review_words,
      coalesce(profile.published_at, now_value),
      now_value
    )
    on conflict (slug) do update set
      movie_name = excluded.movie_name,
      origin_name = excluded.origin_name,
      content = excluded.content,
      word_count = excluded.word_count,
      updated_at = excluded.updated_at;
  end if;

  update public.movie_seo_profiles
  set
    status = 'published',
    published_at = now_value,
    updated_at = now_value,
    version = version + 1
  where movie_id = p_movie_id;

  perform public.refresh_movie_seo_quality(p_movie_id);
  delete from public.movie_api_cache where slug = profile.slug;
  delete from public.home_page_cache where true;

  return jsonb_build_object(
    'success', true,
    'movie_id', p_movie_id,
    'slug', profile.slug,
    'published_at', now_value,
    'version', profile.version + 1
  );
end;
$$;

revoke all on function public.publish_movie_seo_profile(uuid) from public, anon, authenticated;
grant execute on function public.publish_movie_seo_profile(uuid) to service_role;

comment on table public.movie_seo_profiles is
  'Single source of truth for the manual movie SEO Studio. Drafts stay private; only published profiles are public.';
comment on function public.publish_movie_seo_profile(uuid) is
  'Atomically publishes the approved SEO profile, movie metadata, review and SEO quality refresh.';
