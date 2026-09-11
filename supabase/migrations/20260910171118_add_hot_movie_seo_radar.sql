begin;

create table if not exists public.seo_hot_movie_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  sources_attempted integer not null default 0,
  sources_succeeded integer not null default 0,
  signals_seen integer not null default 0,
  matched_count integer not null default 0,
  missing_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.seo_hot_movie_candidates (
  id bigint generated always as identity primary key,
  run_id bigint references public.seo_hot_movie_runs(id) on delete set null,
  source text not null check (length(trim(source)) between 2 and 80),
  source_key text not null check (length(trim(source_key)) between 1 and 220),
  title text not null check (length(trim(title)) between 1 and 300),
  normalized_title text not null check (length(trim(normalized_title)) between 1 and 300),
  original_title text,
  release_date date,
  release_year integer,
  source_rank integer check (source_rank is null or source_rank between 1 and 1000),
  demand_score integer not null default 0 check (demand_score between 0 and 100),
  source_url text,
  matched_movie_id uuid references public.movies(id) on delete set null,
  matched_slug text,
  match_status text not null default 'missing'
    check (match_status in ('exact', 'alias', 'fuzzy', 'direct', 'missing', 'ambiguous')),
  match_confidence numeric(5,4) not null default 0
    check (match_confidence between 0 and 1),
  readiness_status text not null default 'import_movie'
    check (readiness_status in (
      'ready', 'import_movie', 'review_identity', 'publish_movie',
      'enrich_content', 'repair_technical', 'release_static'
    )),
  recommended_action text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '36 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_key)
);

create table if not exists public.seo_hot_movie_aliases (
  source text not null default '*',
  normalized_external_title text not null,
  movie_id uuid not null references public.movies(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source, normalized_external_title)
);

create index if not exists seo_hot_movie_candidates_active_priority_idx
  on public.seo_hot_movie_candidates(active, demand_score desc, source_rank, last_seen_at desc);
create index if not exists seo_hot_movie_candidates_movie_idx
  on public.seo_hot_movie_candidates(matched_movie_id, active, demand_score desc)
  where matched_movie_id is not null;
create index if not exists seo_hot_movie_candidates_expiry_idx
  on public.seo_hot_movie_candidates(expires_at)
  where active = true;
create index if not exists seo_hot_movie_runs_started_idx
  on public.seo_hot_movie_runs(started_at desc);

alter table public.seo_hot_movie_runs enable row level security;
alter table public.seo_hot_movie_candidates enable row level security;
alter table public.seo_hot_movie_aliases enable row level security;

revoke all on table public.seo_hot_movie_runs from public, anon, authenticated;
revoke all on table public.seo_hot_movie_candidates from public, anon, authenticated;
revoke all on table public.seo_hot_movie_aliases from public, anon, authenticated;
grant all on table public.seo_hot_movie_runs to service_role;
grant all on table public.seo_hot_movie_candidates to service_role;
grant all on table public.seo_hot_movie_aliases to service_role;
grant usage, select on sequence public.seo_hot_movie_runs_id_seq to service_role;
grant usage, select on sequence public.seo_hot_movie_candidates_id_seq to service_role;

create or replace function public.match_seo_hot_movie_candidate(
  p_source text,
  p_title text,
  p_release_year integer default null
)
returns table (
  movie_id uuid,
  slug text,
  movie_name text,
  movie_year integer,
  is_published boolean,
  match_method text,
  confidence numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  title_key text := public.kp_search_normalize(coalesce(p_title, ''));
  matched_rows integer := 0;
begin
  if length(title_key) < 3 then
    return;
  end if;

  -- Reviewed aliases are authoritative and must avoid the catalogue-wide
  -- fuzzy scan. This is also how renamed Vietnamese theatrical titles map to
  -- an English/original catalogue entry without risking the wrong edition.
  return query
    select
      movie.id as movie_id,
      movie.slug,
      movie.name as movie_name,
      movie.year as movie_year,
      coalesce(movie.is_published, false) as is_published,
      'alias'::text as match_method,
      1.0::numeric as confidence
    from public.seo_hot_movie_aliases alias
    join public.movies movie on movie.id = alias.movie_id
    where alias.source in (coalesce(nullif(trim(p_source), ''), '*'), '*')
      and alias.normalized_external_title = title_key
      and movie.superseded_by_movie_id is null
    order by case when alias.source = p_source then 0 else 1 end, movie.slug
    limit 3;
  get diagnostics matched_rows = row_count;
  if matched_rows > 0 then return; end if;

  -- Exact normalized names are safe even for an unpublished trailer record.
  -- Use the precomputed search document so one signal does not normalize six
  -- fields across the whole movie catalogue.
  return query
    select
      movie.id as movie_id,
      movie.slug,
      movie.name as movie_name,
      movie.year as movie_year,
      coalesce(movie.is_published, false) as is_published,
      'exact'::text as match_method,
      1.0::numeric as confidence
    from public.movie_search_documents document
    join public.movies movie on movie.id = document.movie_id
    where movie.superseded_by_movie_id is null
      and (
        document.normalized_name = title_key
        or (
          title_key like '% %'
          and (
            document.normalized_name like title_key || ' %'
            or document.normalized_name like '% ' || title_key
            or document.normalized_name like '% ' || title_key || ' %'
          )
        )
      )
      and (
        p_release_year is null
        or movie.year is null
        or abs(movie.year - p_release_year) <= 2
      )
    order by
      coalesce(movie.is_published, false) desc,
      case when p_release_year is not null and movie.year = p_release_year then 0 else 1 end,
      movie.updated_at desc nulls last,
      movie.slug
    limit 3;
  get diagnostics matched_rows = row_count;
  if matched_rows > 0 then return; end if;

  -- Fuzzy matching uses the existing partial GIN trigram index and is limited
  -- to published search documents. Ambiguous results remain review-only in
  -- the Edge Function and are never auto-linked.
  return query
  with candidates as (
    select
      document.movie_id,
      document.slug,
      document.normalized_name,
      extensions.similarity(document.normalized_name, title_key)::numeric as confidence
    from public.movie_search_documents document
    where document.is_published = true
      and document.normalized_name operator(extensions.%) title_key
    order by extensions.similarity(document.normalized_name, title_key) desc
    limit 24
  )
  select
    movie.id as movie_id,
    movie.slug,
    movie.name as movie_name,
    movie.year as movie_year,
    coalesce(movie.is_published, false) as is_published,
    'fuzzy'::text as match_method,
    round(candidate.confidence, 4) as confidence
  from candidates candidate
  join public.movies movie on movie.id = candidate.movie_id
  where candidate.confidence >= 0.72
    and movie.superseded_by_movie_id is null
    and (
      p_release_year is null
      or movie.year is null
      or abs(movie.year - p_release_year) <= 2
    )
  order by
    candidate.confidence desc,
    case when p_release_year is not null and movie.year = p_release_year then 0 else 1 end,
    movie.slug
  limit 3;
end;
$$;

revoke all on function public.match_seo_hot_movie_candidate(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.match_seo_hot_movie_candidate(text, text, integer)
  to service_role;

create or replace function public.refresh_seo_hot_movie_work_items()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_total integer := 0;
  inserted_total integer := 0;
  release_total integer := 0;
begin
  create temporary table hot_work on commit drop as
  with strongest as (
    select distinct on (candidate.matched_movie_id)
      candidate.*
    from public.seo_hot_movie_candidates candidate
    where candidate.active = true
      and candidate.expires_at > now()
      and candidate.matched_movie_id is not null
      and candidate.match_status in ('direct', 'alias', 'exact', 'fuzzy')
    order by candidate.matched_movie_id, candidate.demand_score desc, candidate.source_rank nulls last
  )
  select
    candidate.matched_movie_id as movie_id,
    candidate.matched_slug as slug,
    candidate.title as movie_name,
    case candidate.readiness_status
      when 'repair_technical' then 'fix_technical'
      when 'release_static' then 'fix_technical'
      when 'enrich_content' then 'improve_original_content'
      when 'publish_movie' then 'complete_editorial_profile'
      when 'review_identity' then 'complete_editorial_profile'
      else 'capture_search_demand'
    end as task_type,
    greatest(72, candidate.demand_score)::integer as priority_score,
    case
      when candidate.readiness_status in ('repair_technical', 'release_static') then 'critical'
      when coalesce(candidate.source_rank, 999) <= 5 or candidate.demand_score >= 88 then 'high'
      else 'medium'
    end as urgency,
    case candidate.readiness_status
      when 'repair_technical' then 'Phim đang hot nhưng trang thật lỗi HTTP, robots hoặc canonical; cần sửa trước khi nhu cầu giảm.'
      when 'release_static' then 'Phim đang hot và đủ dữ liệu nhưng chưa có trong artifact/sitemap production.'
      when 'enrich_content' then 'Phim đang hot nhưng nội dung hoặc metadata chưa đạt cổng phát hành SEO.'
      when 'publish_movie' then 'Phim đang hot đã có trong kho nhưng chưa được xuất bản đúng vòng đời.'
      when 'review_identity' then 'Tín hiệu phim hot có khả năng khớp sai phiên bản; cần xác nhận danh tính trước khi SEO.'
      else 'Phim đang có nhu cầu thị trường; cần tối ưu cụm từ tên phim và liên kết nội bộ khi tín hiệu còn nóng.'
    end as reason,
    case candidate.readiness_status
      when 'repair_technical' then array['technical']::text[]
      when 'release_static' then array['technical']::text[]
      when 'enrich_content' then array['intro_content', 'review_content', 'faq', 'topic_links']::text[]
      when 'publish_movie' then array['intro_content', 'topic_links']::text[]
      when 'review_identity' then array['technical']::text[]
      else array['focus_keyword', 'seo_title', 'meta_description', 'intro_content', 'topic_links']::text[]
    end as required_fields,
    jsonb_build_object(
      'source', candidate.source,
      'source_rank', candidate.source_rank,
      'demand_score', candidate.demand_score,
      'source_url', candidate.source_url,
      'match_status', candidate.match_status,
      'match_confidence', candidate.match_confidence,
      'readiness_status', candidate.readiness_status,
      'observed_at', candidate.last_seen_at,
      'hot_movie_evidence', candidate.evidence
    ) as evidence
  from strongest candidate;

  -- Remove work created only by an earlier radar match when that signal no
  -- longer maps safely. Work that existed before the radar keeps its original
  -- evidence and status; only the expired hot-movie annotation is removed.
  update public.seo_work_items item
  set status = 'obsolete', updated_at = now()
  where item.status = 'pending'
    and item.evidence ? 'hot_movie'
    and (item.evidence - 'hot_movie') = '{}'::jsonb
    and not exists (select 1 from hot_work hot where hot.movie_id = item.movie_id);

  update public.seo_work_items item
  set evidence = item.evidence - 'hot_movie', updated_at = now()
  where item.status in ('pending', 'in_progress')
    and item.evidence ? 'hot_movie'
    and (item.evidence - 'hot_movie') <> '{}'::jsonb
    and not exists (select 1 from hot_work hot where hot.movie_id = item.movie_id);

  update public.seo_static_release_requests request
  set
    status = 'superseded',
    error_message = 'Radar match expired or became ambiguous.',
    processing_started_at = null
  where request.status = 'pending'
    and request.reason = 'hot_movie_radar_release'
    and not exists (
      select 1 from hot_work hot
      where hot.movie_id = request.movie_id and hot.task_type = 'fix_technical'
    );

  update public.seo_work_items item
  set
    task_type = case when hot.priority_score > item.priority_score then hot.task_type else item.task_type end,
    priority_score = greatest(item.priority_score, hot.priority_score),
    urgency = case
      when item.urgency = 'critical' or hot.urgency = 'critical' then 'critical'
      when item.urgency = 'high' or hot.urgency = 'high' then 'high'
      else 'medium'
    end,
    reason = case when hot.priority_score > item.priority_score then hot.reason else item.reason end,
    required_fields = case when hot.priority_score > item.priority_score then hot.required_fields else item.required_fields end,
    evidence = coalesce(item.evidence, '{}'::jsonb) || jsonb_build_object('hot_movie', hot.evidence),
    last_seen_at = now(),
    due_at = least(coalesce(item.due_at, now() + interval '7 days'), now() + interval '2 days'),
    updated_at = now()
  from hot_work hot
  where item.movie_id = hot.movie_id
    and item.status in ('pending', 'in_progress');
  get diagnostics updated_total = row_count;

  insert into public.seo_work_items (
    movie_id, slug, movie_name, task_type, status, priority_score, urgency,
    reason, required_fields, evidence, due_at, last_seen_at, updated_at
  )
  select
    hot.movie_id, hot.slug, hot.movie_name, hot.task_type, 'pending', hot.priority_score,
    hot.urgency, hot.reason, hot.required_fields,
    jsonb_build_object('hot_movie', hot.evidence),
    now() + case when hot.urgency = 'critical' then interval '1 day' else interval '2 days' end,
    now(), now()
  from hot_work hot
  where not exists (
    select 1 from public.seo_work_items item
    where item.movie_id = hot.movie_id and item.status in ('pending', 'in_progress')
  );
  get diagnostics inserted_total = row_count;

  insert into public.seo_static_release_requests (movie_id, slug, reason, status)
  select
    hot.movie_id,
    hot.slug,
    'hot_movie_radar_release',
    'pending'
  from hot_work hot
  join public.movies movie on movie.id = hot.movie_id
  join public.movie_seo_quality_status quality on quality.movie_id = hot.movie_id
  where hot.task_type = 'fix_technical'
    and movie.is_published = true
    and quality.eligible_for_index = true
    and quality.quality_score >= 85
    and quality.content_length >= 500
    and not exists (
      select 1 from public.seo_static_release_requests request
      where request.movie_id = hot.movie_id and request.status in ('pending', 'processing')
    );
  get diagnostics release_total = row_count;

  return jsonb_build_object(
    'success', true,
    'updated_work_items', updated_total,
    'inserted_work_items', inserted_total,
    'queued_static_releases', release_total
  );
end;
$$;

revoke all on function public.refresh_seo_hot_movie_work_items()
  from public, anon, authenticated;
grant execute on function public.refresh_seo_hot_movie_work_items()
  to service_role;

insert into public.seo_hot_movie_aliases (source, normalized_external_title, movie_id, note)
select seed.source, public.kp_search_normalize(seed.external_title), movie.id, seed.note
from (values
  ('box_office_vietnam', 'Hope Vùng Tử Địa', 'hope-2026', 'Vietnamese theatrical title'),
  ('box_office_vietnam', 'Spider Man 4: Khởi Đầu Mới', 'spider-man-brand-new-day-2026', 'Vietnamese theatrical title'),
  ('box_office_vietnam', 'Chiikawa: Bí Mật Đảo Người Cá', 'chiikawa-the-movie-the-secret-of-the-mermaid-island-2026', 'Vietnamese theatrical title'),
  ('box_office_vietnam', 'Insidious 6: Quỷ Quyệt Ranh Giới Vô Định', 'quy-quyet-6-ranh-gioi-vo-dinh', 'Vietnamese theatrical title'),
  ('box_office_vietnam', 'The Odyssey', 'the-odyssey-2026', 'Preferred canonical 2026 record'),
  ('box_office_vietnam', 'Harry Potter Và Hòn Đá Phù Thủy', 'harry-potter-va-hon-da-phu-thuy', '2026 theatrical re-release uses the 2001 film page'),
  ('netflix_vietnam', 'Anora', 'anora-lo-lem-thoi-hien-dai', 'Vietnam Netflix title')
) as seed(source, external_title, movie_slug, note)
join public.movies movie on movie.slug = seed.movie_slug
on conflict (source, normalized_external_title) do update set
  movie_id = excluded.movie_id,
  note = excluded.note,
  updated_at = now();

do $hot_movie_radar_schedule$
declare
  target_job_id bigint;
  command_text text := $cmd$
    select net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/seo-hot-movie-radar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'CRON_SECRET'
          order by created_at desc
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    );
  $cmd$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  select jobid into target_job_id
  from cron.job
  where jobname = 'refresh-seo-hot-movie-radar'
  limit 1;

  if target_job_id is null then
    perform cron.schedule(
      'refresh-seo-hot-movie-radar',
      '12 */6 * * *',
      command_text
    );
  else
    perform cron.alter_job(
      job_id := target_job_id,
      schedule := '12 */6 * * *',
      command := command_text,
      active := true
    );
  end if;
end;
$hot_movie_radar_schedule$;

comment on table public.seo_hot_movie_runs is
  'Run history for the bounded SEO hot-movie radar.';
comment on table public.seo_hot_movie_candidates is
  'Current cinema, streaming and first-party demand signals matched to KhoPhim catalogue readiness.';
comment on table public.seo_hot_movie_aliases is
  'Reviewed mappings from external market titles to canonical KhoPhim movies; prevents title-only identity mistakes.';
comment on function public.match_seo_hot_movie_candidate(text, text, integer) is
  'Returns at most three reviewed/exact/fuzzy catalogue matches for a hot-movie signal.';
comment on function public.refresh_seo_hot_movie_work_items() is
  'Promotes matched hot-movie signals into the existing bounded SEO operations queue without overriding stronger tasks.';

commit;
