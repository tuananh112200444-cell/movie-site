begin;

create table if not exists public.movie_seo_profile_drafts (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  baseline_version integer not null default 0,
  unlocked_fields text[] not null default '{}',
  validation_score integer not null default 0 check (validation_score between 0 and 100),
  validation_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_issues) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movie_seo_profile_drafts_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.movie_seo_profile_versions (
  id bigint generated always as identity primary key,
  movie_id uuid not null references public.movies(id) on delete cascade,
  source_version integer not null,
  replacement_version integer not null,
  profile_snapshot jsonb not null,
  movie_snapshot jsonb not null,
  review_snapshot jsonb,
  topic_links_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (movie_id, replacement_version)
);

create index if not exists movie_seo_profile_versions_movie_idx
  on public.movie_seo_profile_versions(movie_id, created_at desc);

alter table public.movie_seo_profile_drafts enable row level security;
alter table public.movie_seo_profile_versions enable row level security;
revoke all on table public.movie_seo_profile_drafts, public.movie_seo_profile_versions from public, anon, authenticated;
grant all on table public.movie_seo_profile_drafts, public.movie_seo_profile_versions to service_role;

create or replace function public.publish_movie_seo_profile(p_movie_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft public.movie_seo_profile_drafts%rowtype;
  profile public.movie_seo_profiles%rowtype;
  movie_row public.movies%rowtype;
  payload jsonb;
  patch jsonb;
  current_version integer := 0;
  next_version integer := 1;
  now_value timestamptz := now();
  review_text text := '';
  review_words integer := 0;
begin
  select * into draft
  from public.movie_seo_profile_drafts
  where movie_id = p_movie_id
  for update;
  if not found then raise exception 'Safe SEO draft not found'; end if;

  select * into movie_row
  from public.movies
  where id = p_movie_id
  for update;
  if not found then raise exception 'Movie not found'; end if;

  select * into profile
  from public.movie_seo_profiles
  where movie_id = p_movie_id
  for update;
  if found then current_version := profile.version; end if;

  if draft.baseline_version <> current_version then
    raise exception 'SEO profile changed after this draft was opened';
  end if;
  if draft.validation_score < 80 then
    raise exception 'SEO validation score must be at least 80 before publishing';
  end if;
  if exists (
    select 1 from jsonb_array_elements(draft.validation_issues) issue
    where issue->>'severity' = 'error'
  ) then
    raise exception 'Safe SEO draft still contains blocking validation errors';
  end if;

  payload := draft.payload;
  patch := coalesce(payload->'movie_patch', '{}'::jsonb);
  if payload->>'slug' <> movie_row.slug or payload->>'canonical_path' <> ('/phim/' || movie_row.slug) then
    raise exception 'Canonical movie identity cannot be changed';
  end if;
  if payload->>'index_mode' = 'index' and draft.validation_score < 85 then
    raise exception 'Manual indexing requires an SEO validation score of at least 85';
  end if;

  next_version := current_version + 1;
  if current_version > 0 and profile.status = 'published' then
    insert into public.movie_seo_profile_versions (
      movie_id, source_version, replacement_version, profile_snapshot, movie_snapshot,
      review_snapshot, topic_links_snapshot
    ) values (
      p_movie_id,
      current_version,
      next_version,
      to_jsonb(profile),
      to_jsonb(movie_row),
      (select to_jsonb(review_row) from public.movie_reviews review_row where review_row.slug = profile.slug limit 1),
      coalesce((select jsonb_agg(to_jsonb(link_row) order by link_row.id) from public.movie_seo_topic_links link_row where link_row.source_movie_id = p_movie_id), '[]'::jsonb)
    ) on conflict (movie_id, replacement_version) do nothing;
  end if;

  insert into public.movie_seo_profiles (
    movie_id, slug, focus_keyword, secondary_keywords, seo_title, meta_description,
    canonical_path, og_image_url, index_mode, intro_content, review_content, faq,
    topic_links, movie_patch, status, validation_score, validation_issues, version,
    published_at, live_audit, last_audited_at, updated_at
  ) values (
    p_movie_id,
    movie_row.slug,
    coalesce(payload->>'focus_keyword', ''),
    array(select jsonb_array_elements_text(coalesce(payload->'secondary_keywords', '[]'::jsonb))),
    coalesce(payload->>'seo_title', ''),
    coalesce(payload->>'meta_description', ''),
    '/phim/' || movie_row.slug,
    coalesce(payload->>'og_image_url', ''),
    coalesce(payload->>'index_mode', 'auto'),
    coalesce(payload->>'intro_content', ''),
    coalesce(payload->>'review_content', ''),
    coalesce(payload->'faq', '[]'::jsonb),
    coalesce(payload->'topic_links', '[]'::jsonb),
    patch,
    'published',
    draft.validation_score,
    draft.validation_issues,
    next_version,
    coalesce(profile.published_at, now_value),
    '{}'::jsonb,
    null,
    now_value
  ) on conflict (movie_id) do update set
    slug = excluded.slug,
    focus_keyword = excluded.focus_keyword,
    secondary_keywords = excluded.secondary_keywords,
    seo_title = excluded.seo_title,
    meta_description = excluded.meta_description,
    canonical_path = excluded.canonical_path,
    og_image_url = excluded.og_image_url,
    index_mode = excluded.index_mode,
    intro_content = excluded.intro_content,
    review_content = excluded.review_content,
    faq = excluded.faq,
    topic_links = excluded.topic_links,
    movie_patch = excluded.movie_patch,
    status = 'published',
    validation_score = excluded.validation_score,
    validation_issues = excluded.validation_issues,
    version = excluded.version,
    published_at = coalesce(public.movie_seo_profiles.published_at, excluded.published_at),
    live_audit = '{}'::jsonb,
    last_audited_at = null,
    updated_at = excluded.updated_at;

  update public.movies
  set
    name = coalesce(nullif(trim(patch->>'name'), ''), movie_row.name),
    title_vi = coalesce(nullif(trim(patch->>'title_vi'), ''), movie_row.title_vi),
    title_en = coalesce(nullif(trim(patch->>'title_en'), ''), movie_row.title_en),
    origin_name = coalesce(nullif(trim(patch->>'origin_name'), ''), movie_row.origin_name),
    content = coalesce(payload->>'intro_content', movie_row.content),
    year = case when coalesce(patch->>'year', '') ~ '^\d{4}$' then (patch->>'year')::integer else movie_row.year end,
    quality = coalesce(nullif(trim(patch->>'quality'), ''), movie_row.quality),
    lang = coalesce(nullif(trim(patch->>'lang'), ''), movie_row.lang),
    trailer_url = coalesce(nullif(trim(patch->>'trailer_url'), ''), movie_row.trailer_url),
    thumb_url = coalesce(nullif(trim(patch->>'thumb_url'), ''), movie_row.thumb_url),
    poster_url = coalesce(nullif(trim(patch->>'poster_url'), ''), movie_row.poster_url),
    actor = case when jsonb_array_length(coalesce(patch->'actor', '[]'::jsonb)) > 0 then array(select jsonb_array_elements_text(patch->'actor')) else movie_row.actor end,
    director = case when jsonb_array_length(coalesce(patch->'director', '[]'::jsonb)) > 0 then array(select jsonb_array_elements_text(patch->'director')) else movie_row.director end,
    category = case when jsonb_array_length(coalesce(patch->'category', '[]'::jsonb)) > 0 then patch->'category' else movie_row.category end,
    country = case when jsonb_array_length(coalesce(patch->'country', '[]'::jsonb)) > 0 then patch->'country' else movie_row.country end,
    is_published = true,
    updated_at = now_value
  where id = p_movie_id;

  review_text := coalesce(payload->>'review_content', '');
  if length(trim(review_text)) > 0 then
    review_words := cardinality(regexp_split_to_array(trim(review_text), '\s+'));
    insert into public.movie_reviews (slug, movie_name, origin_name, content, word_count, generated_at, updated_at)
    values (
      movie_row.slug,
      coalesce(nullif(trim(patch->>'name'), ''), movie_row.name),
      coalesce(nullif(trim(patch->>'origin_name'), ''), movie_row.origin_name),
      review_text,
      review_words,
      coalesce(profile.published_at, now_value),
      now_value
    ) on conflict (slug) do update set
      movie_name = excluded.movie_name,
      origin_name = excluded.origin_name,
      content = excluded.content,
      word_count = excluded.word_count,
      updated_at = excluded.updated_at;
  else
    delete from public.movie_reviews where slug = movie_row.slug;
  end if;

  delete from public.movie_seo_topic_links where source_movie_id = p_movie_id;
  insert into public.movie_seo_topic_links (source_movie_id, source_slug, target_path, title, anchor, description, updated_at)
  select
    p_movie_id,
    movie_row.slug,
    item->>'url',
    left(trim(item->>'title'), 180),
    left(coalesce(nullif(trim(item->>'anchor'), ''), trim(item->>'title')), 180),
    left(coalesce(trim(item->>'description'), ''), 320),
    now_value
  from jsonb_array_elements(coalesce(payload->'topic_links', '[]'::jsonb)) item
  where coalesce(item->>'url', '') ~ '^/[A-Za-z0-9]'
    and coalesce(item->>'url', '') !~ '^//'
    and item->>'url' <> ('/phim/' || movie_row.slug)
    and length(trim(coalesce(item->>'title', ''))) > 0
  on conflict (source_movie_id, target_path) do update set
    title = excluded.title,
    anchor = excluded.anchor,
    description = excluded.description,
    updated_at = excluded.updated_at;

  delete from public.movie_seo_profile_drafts where movie_id = p_movie_id;
  perform public.refresh_movie_seo_quality(p_movie_id);
  delete from public.movie_api_cache where slug = movie_row.slug;
  delete from public.home_page_cache where true;

  return jsonb_build_object(
    'success', true,
    'movie_id', p_movie_id,
    'slug', movie_row.slug,
    'published_at', now_value,
    'version', next_version,
    'previous_version', current_version,
    'topic_edges', (select count(*) from public.movie_seo_topic_links where source_movie_id = p_movie_id)
  );
end;
$$;

create or replace function public.rollback_movie_seo_profile(p_movie_id uuid, p_failed_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  history public.movie_seo_profile_versions%rowtype;
  profile_snapshot jsonb;
  movie_snapshot jsonb;
  restored_version integer := p_failed_version + 1;
  now_value timestamptz := now();
begin
  perform 1 from public.movie_seo_profiles where movie_id = p_movie_id for update;
  select * into history
  from public.movie_seo_profile_versions
  where movie_id = p_movie_id and replacement_version <= p_failed_version
  order by replacement_version desc
  limit 1;
  if not found then return jsonb_build_object('restored', false); end if;

  profile_snapshot := history.profile_snapshot;
  movie_snapshot := history.movie_snapshot;
  update public.movie_seo_profiles set
    slug = profile_snapshot->>'slug',
    focus_keyword = profile_snapshot->>'focus_keyword',
    secondary_keywords = array(select jsonb_array_elements_text(coalesce(profile_snapshot->'secondary_keywords', '[]'::jsonb))),
    seo_title = profile_snapshot->>'seo_title',
    meta_description = profile_snapshot->>'meta_description',
    canonical_path = profile_snapshot->>'canonical_path',
    og_image_url = profile_snapshot->>'og_image_url',
    index_mode = profile_snapshot->>'index_mode',
    intro_content = profile_snapshot->>'intro_content',
    review_content = profile_snapshot->>'review_content',
    faq = coalesce(profile_snapshot->'faq', '[]'::jsonb),
    topic_links = coalesce(profile_snapshot->'topic_links', '[]'::jsonb),
    movie_patch = coalesce(profile_snapshot->'movie_patch', '{}'::jsonb),
    status = profile_snapshot->>'status',
    validation_score = (profile_snapshot->>'validation_score')::integer,
    validation_issues = coalesce(profile_snapshot->'validation_issues', '[]'::jsonb),
    version = restored_version,
    published_at = (profile_snapshot->>'published_at')::timestamptz,
    live_audit = coalesce(profile_snapshot->'live_audit', '{}'::jsonb),
    last_audited_at = nullif(profile_snapshot->>'last_audited_at', '')::timestamptz,
    updated_at = now_value
  where movie_id = p_movie_id;

  update public.movies set
    name = movie_snapshot->>'name',
    title_vi = movie_snapshot->>'title_vi',
    title_en = movie_snapshot->>'title_en',
    origin_name = movie_snapshot->>'origin_name',
    content = movie_snapshot->>'content',
    year = nullif(movie_snapshot->>'year', '')::integer,
    quality = movie_snapshot->>'quality',
    lang = movie_snapshot->>'lang',
    trailer_url = movie_snapshot->>'trailer_url',
    thumb_url = movie_snapshot->>'thumb_url',
    poster_url = movie_snapshot->>'poster_url',
    actor = array(select jsonb_array_elements_text(coalesce(movie_snapshot->'actor', '[]'::jsonb))),
    director = array(select jsonb_array_elements_text(coalesce(movie_snapshot->'director', '[]'::jsonb))),
    category = coalesce(movie_snapshot->'category', '[]'::jsonb),
    country = coalesce(movie_snapshot->'country', '[]'::jsonb),
    is_published = coalesce((movie_snapshot->>'is_published')::boolean, true),
    updated_at = now_value
  where id = p_movie_id;

  delete from public.movie_reviews where slug = profile_snapshot->>'slug';
  if history.review_snapshot is not null and history.review_snapshot <> 'null'::jsonb then
    insert into public.movie_reviews (slug, movie_name, origin_name, content, word_count, generated_at, updated_at)
    values (
      history.review_snapshot->>'slug',
      history.review_snapshot->>'movie_name',
      history.review_snapshot->>'origin_name',
      history.review_snapshot->>'content',
      coalesce((history.review_snapshot->>'word_count')::integer, 0),
      coalesce((history.review_snapshot->>'generated_at')::timestamptz, now_value),
      now_value
    ) on conflict (slug) do update set
      movie_name = excluded.movie_name,
      origin_name = excluded.origin_name,
      content = excluded.content,
      word_count = excluded.word_count,
      updated_at = excluded.updated_at;
  end if;

  delete from public.movie_seo_topic_links where source_movie_id = p_movie_id;
  insert into public.movie_seo_topic_links (source_movie_id, source_slug, target_path, title, anchor, description, created_at, updated_at)
  select
    p_movie_id,
    item->>'source_slug',
    item->>'target_path',
    item->>'title',
    item->>'anchor',
    coalesce(item->>'description', ''),
    coalesce((item->>'created_at')::timestamptz, now_value),
    now_value
  from jsonb_array_elements(coalesce(history.topic_links_snapshot, '[]'::jsonb)) item;

  delete from public.movie_seo_profile_drafts where movie_id = p_movie_id;
  perform public.refresh_movie_seo_quality(p_movie_id);
  delete from public.movie_api_cache where slug = profile_snapshot->>'slug';
  delete from public.home_page_cache where true;
  return jsonb_build_object('restored', true, 'version', restored_version, 'restored_from_version', history.source_version);
end;
$$;

revoke all on function public.publish_movie_seo_profile(uuid) from public, anon, authenticated;
revoke all on function public.rollback_movie_seo_profile(uuid, integer) from public, anon, authenticated;
grant execute on function public.publish_movie_seo_profile(uuid) to service_role;
grant execute on function public.rollback_movie_seo_profile(uuid, integer) to service_role;

comment on table public.movie_seo_profile_drafts is
  'Private safe-edit drafts. Saving a draft never changes the published SEO profile.';
comment on table public.movie_seo_profile_versions is
  'Recoverable snapshots captured before every SEO Studio publish.';

commit;
