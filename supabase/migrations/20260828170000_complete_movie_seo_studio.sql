alter table public.movie_seo_profiles
  add column if not exists live_audit jsonb not null default '{}'::jsonb,
  add column if not exists last_audited_at timestamptz;

create table if not exists public.movie_seo_topic_links (
  id bigint generated always as identity primary key,
  source_movie_id uuid not null references public.movies(id) on delete cascade,
  source_slug text not null,
  target_path text not null,
  title text not null,
  anchor text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movie_seo_topic_links_source_slug_check check (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint movie_seo_topic_links_target_path_check check (target_path ~ '^/[A-Za-z0-9][A-Za-z0-9_./?=&%+#-]*$'),
  constraint movie_seo_topic_links_unique_edge unique (source_movie_id, target_path)
);

create index if not exists movie_seo_topic_links_target_path_idx
  on public.movie_seo_topic_links (target_path, updated_at desc);
create index if not exists movie_seo_topic_links_source_slug_idx
  on public.movie_seo_topic_links (source_slug, updated_at desc);

alter table public.movie_seo_topic_links enable row level security;

drop policy if exists movie_seo_topic_links_public_read on public.movie_seo_topic_links;
create policy movie_seo_topic_links_public_read
  on public.movie_seo_topic_links
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.movie_seo_profiles profile
      where profile.movie_id = source_movie_id
        and profile.status = 'published'
        and profile.index_mode <> 'noindex'
    )
  );

revoke all on table public.movie_seo_topic_links from public, anon, authenticated;
grant select on table public.movie_seo_topic_links to anon, authenticated;
grant all on table public.movie_seo_topic_links to service_role;

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
  next_version integer := 0;
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

  if exists (
    select 1
    from jsonb_array_elements(coalesce(profile.validation_issues, '[]'::jsonb)) issue
    where issue->>'severity' = 'error'
  ) then
    raise exception 'SEO profile still contains blocking validation errors';
  end if;

  if profile.validation_score < 80 then
    raise exception 'SEO validation score must be at least 80 before publishing';
  end if;

  if profile.index_mode = 'index' and profile.validation_score < 85 then
    raise exception 'Manual indexing requires an SEO validation score of at least 85';
  end if;

  patch := coalesce(profile.movie_patch, '{}'::jsonb);
  next_version := profile.version + 1;

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

  delete from public.movie_seo_topic_links where source_movie_id = p_movie_id;
  insert into public.movie_seo_topic_links (
    source_movie_id, source_slug, target_path, title, anchor, description, updated_at
  )
  select
    p_movie_id,
    profile.slug,
    item->>'url',
    left(trim(item->>'title'), 180),
    left(coalesce(nullif(trim(item->>'anchor'), ''), trim(item->>'title')), 180),
    left(coalesce(trim(item->>'description'), ''), 320),
    now_value
  from jsonb_array_elements(coalesce(profile.topic_links, '[]'::jsonb)) item
  where coalesce(item->>'url', '') ~ '^/[A-Za-z0-9]'
    and coalesce(item->>'url', '') !~ '^//'
    and item->>'url' <> ('/phim/' || profile.slug)
    and length(trim(coalesce(item->>'title', ''))) > 0
  on conflict (source_movie_id, target_path) do update set
    title = excluded.title,
    anchor = excluded.anchor,
    description = excluded.description,
    updated_at = excluded.updated_at;

  update public.movie_seo_profiles
  set
    status = 'published',
    published_at = now_value,
    updated_at = now_value,
    version = next_version,
    live_audit = '{}'::jsonb,
    last_audited_at = null
  where movie_id = p_movie_id;

  perform public.refresh_movie_seo_quality(p_movie_id);
  delete from public.movie_api_cache where slug = profile.slug;
  delete from public.home_page_cache where true;

  return jsonb_build_object(
    'success', true,
    'movie_id', p_movie_id,
    'slug', profile.slug,
    'published_at', now_value,
    'version', next_version,
    'topic_edges', (select count(*) from public.movie_seo_topic_links where source_movie_id = p_movie_id)
  );
end;
$$;

revoke all on function public.publish_movie_seo_profile(uuid) from public, anon, authenticated;
grant execute on function public.publish_movie_seo_profile(uuid) to service_role;

comment on table public.movie_seo_topic_links is
  'Published SEO Studio topic edges. Movie-to-movie targets are rendered back to the source automatically.';
comment on column public.movie_seo_profiles.live_audit is
  'Last post-publish live Googlebot HTML audit produced by admin-seo-studio.';
