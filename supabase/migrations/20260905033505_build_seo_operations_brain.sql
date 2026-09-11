begin;

create table if not exists public.seo_brain_runs (
  id bigint generated always as identity primary key,
  source_gsc_run_id bigint references public.seo_gsc_runs(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','failed')),
  candidate_count integer not null default 0,
  queued_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.seo_work_items (
  id bigint generated always as identity primary key,
  movie_id uuid not null references public.movies(id) on delete cascade,
  slug text not null,
  movie_name text not null,
  task_type text not null check (task_type in (
    'fix_technical','improve_original_content','strengthen_discovery',
    'capture_search_demand','repair_editorial_trust','complete_editorial_profile'
  )),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','dismissed','obsolete')),
  priority_score integer not null check (priority_score between 0 and 100),
  urgency text not null check (urgency in ('critical','high','medium','low')),
  reason text not null,
  required_fields text[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb,
  source_run_id bigint references public.seo_gsc_runs(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_static_release_requests (
  id bigint generated always as identity primary key,
  movie_id uuid references public.movies(id) on delete set null,
  slug text,
  reason text not null,
  requested_version integer,
  status text not null default 'pending' check (status in ('pending','processing','deployed','failed','superseded')),
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  deployed_at timestamptz,
  deployment_url text,
  error_message text
);

create index if not exists seo_brain_runs_started_idx
  on public.seo_brain_runs(started_at desc);
create index if not exists seo_work_items_daily_queue_idx
  on public.seo_work_items(status, priority_score desc, last_seen_at desc)
  where status in ('pending','in_progress');
create index if not exists seo_work_items_task_idx
  on public.seo_work_items(task_type, status, priority_score desc);
alter table public.seo_work_items drop constraint if exists seo_work_items_movie_id_key;
create unique index if not exists seo_work_items_one_active_movie_idx
  on public.seo_work_items(movie_id)
  where status in ('pending','in_progress');
create index if not exists seo_static_release_pending_idx
  on public.seo_static_release_requests(status, requested_at)
  where status in ('pending','processing');
create unique index if not exists seo_static_release_one_pending_movie_idx
  on public.seo_static_release_requests(movie_id)
  where status = 'pending' and movie_id is not null;

alter table public.seo_brain_runs enable row level security;
alter table public.seo_work_items enable row level security;
alter table public.seo_static_release_requests enable row level security;

revoke all on table public.seo_brain_runs, public.seo_work_items, public.seo_static_release_requests
  from public, anon, authenticated;
grant all on table public.seo_brain_runs, public.seo_work_items, public.seo_static_release_requests
  to service_role;

create or replace function public.refresh_seo_operations_brain(p_source_run_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  brain_run_id bigint;
  selected_gsc_run_id bigint;
  candidate_total integer := 0;
  queue_total integer := 0;
  critical_total integer := 0;
  high_total integer := 0;
begin
  select coalesce(
    p_source_run_id,
    (select id from public.seo_gsc_runs where success = true order by started_at desc limit 1)
  ) into selected_gsc_run_id;

  insert into public.seo_brain_runs(source_gsc_run_id)
  values (selected_gsc_run_id)
  returning id into brain_run_id;

  create temporary table seo_brain_candidates on commit drop as
  with latest_query_page_run as (
    select coalesce(
      selected_gsc_run_id,
      (select run_id from public.seo_query_page_metrics order by collected_at desc limit 1)
    ) as run_id
  ),
  query_signals as (
    select
      regexp_replace(metric.page, '^https://khophim\.org/phim/([^?/#]+).*$','\1') as slug,
      sum(metric.impressions)::numeric as impressions,
      sum(metric.clicks)::numeric as clicks,
      sum(metric.position * metric.impressions) / nullif(sum(metric.impressions),0) as weighted_position,
      string_agg(metric.query, ' | ' order by metric.impressions desc) as queries
    from public.seo_query_page_metrics metric
    where metric.run_id = (select run_id from latest_query_page_run)
      and metric.page ~ '^https://khophim\.org/phim/[a-z0-9-]+'
      and lower(metric.query) !~ '(khophim|kho[ ._-]*phim|mhophim|mho[ ._-]*phim|site:khophim|https?://khophim)'
    group by 1
  ),
  inspection_signals as (
    select
      inspection.*,
      case
        when upper(coalesce(inspection.robots_txt_state,'')) ~ '(^|_)(BLOCKED|DISALLOWED)($|_)' then 'robots_blocked'
        when upper(coalesce(inspection.page_fetch_state,'')) ~ '(SOFT_404|BLOCKED|NOT_FOUND|ACCESS_DENIED|SERVER_ERROR|REDIRECT_ERROR|INTERNAL_CRAWL_ERROR|INVALID_URL)' then 'fix_fetch_error'
        when lower(coalesce(inspection.coverage_state,'')) ~ 'duplicate|trùng lặp' then 'review_canonical_duplicate'
        when lower(coalesce(inspection.coverage_state,'')) ~ 'crawled.*not indexed|thu thập dữ liệu.*chưa được lập chỉ mục' then 'improve_original_content'
        when lower(coalesce(inspection.coverage_state,'')) ~ 'discovered.*not indexed|phát hiện.*chưa được lập chỉ mục' then 'strengthen_internal_links_and_content'
        when inspection.verdict = 'PASS' then 'healthy'
        else 'monitor_and_reinspect'
      end as current_recommendation
    from public.seo_url_inspections inspection
    where inspection.inspected_at >= now() - interval '14 days'
  ),
  profile_risk as (
    select
      profile.movie_id,
      (
        lower(coalesce(profile.review_content,'')) ~ '[0-9](?:[.,][0-9])?\s*/\s*10'
        or lower(coalesce(profile.faq::text,'')) ~ '(đỉnh|hay nhất|siêu hay|quá hay|đánh giá ra sao)'
        or exists (
          select 1 from jsonb_array_elements(coalesce(profile.validation_issues,'[]'::jsonb)) issue
          where issue->>'severity' = 'error'
        )
      ) as has_editorial_risk
    from public.movie_seo_profiles profile
    where profile.status = 'published'
  ),
  candidates as (
    select
      quality.movie_id,
      quality.slug,
      movie.name as movie_name,
      case
        when risk.has_editorial_risk then 'repair_editorial_trust'
        when inspection.current_recommendation in ('robots_blocked','fix_fetch_error','review_canonical_duplicate') then 'fix_technical'
        when inspection.current_recommendation = 'improve_original_content' then 'improve_original_content'
        when inspection.current_recommendation = 'strengthen_internal_links_and_content' then 'strengthen_discovery'
        when coalesce(query_signal.impressions,0) >= 3 and coalesce(query_signal.weighted_position,999) between 4 and 40 then 'capture_search_demand'
        else 'complete_editorial_profile'
      end as task_type,
      least(100, greatest(1,
        case
          when risk.has_editorial_risk then 99
          when inspection.current_recommendation in ('robots_blocked','fix_fetch_error') then 98
          when inspection.current_recommendation = 'review_canonical_duplicate' then 94
          when inspection.current_recommendation = 'improve_original_content' then 92
          when inspection.current_recommendation = 'strengthen_internal_links_and_content' then 86
          when coalesce(query_signal.impressions,0) >= 3 and coalesce(query_signal.weighted_position,999) between 4 and 20 then 82
          when coalesce(query_signal.impressions,0) >= 3 and coalesce(query_signal.weighted_position,999) <= 40 then 74
          when quality.index_tier = 'upcoming' then 68
          when quality.index_tier = 'ongoing' then 64
          else 55
        end
        + least(8, floor(ln(greatest(coalesce(query_signal.impressions,0),1)))::integer)
        + case when quality.freshness_score >= 80 then 3 else 0 end
      ))::integer as priority_score,
      case
        when risk.has_editorial_risk or inspection.current_recommendation in ('robots_blocked','fix_fetch_error') then 'critical'
        when inspection.current_recommendation in ('review_canonical_duplicate','improve_original_content','strengthen_internal_links_and_content') then 'high'
        when coalesce(query_signal.impressions,0) >= 3 then 'medium'
        else 'low'
      end as urgency,
      case
        when risk.has_editorial_risk then 'Nội dung đang có điểm số hoặc nhận xét cảm tính chưa đủ căn cứ; cần sửa để bảo vệ độ tin cậy.'
        when inspection.current_recommendation = 'robots_blocked' then 'Google ghi nhận tín hiệu chặn thu thập; cần kiểm tra robots và HTTP ngay.'
        when inspection.current_recommendation = 'fix_fetch_error' then 'Google không tải được trang ổn định; cần sửa lỗi HTTP hoặc render.'
        when inspection.current_recommendation = 'review_canonical_duplicate' then 'Google nghi ngờ URL trùng lặp hoặc chọn canonical khác.'
        when inspection.current_recommendation = 'improve_original_content' then 'Google đã crawl nhưng chưa index; nội dung nguyên bản chưa đủ thuyết phục.'
        when inspection.current_recommendation = 'strengthen_internal_links_and_content' then 'Google đã biết URL nhưng chưa crawl/index; cần tăng nội dung và liên kết nội bộ đúng chủ đề.'
        when coalesce(query_signal.impressions,0) >= 3 then 'Trang đã có nhu cầu tìm kiếm không thương hiệu nhưng vị trí còn thấp; đây là cơ hội tăng hạng gần nhất.'
        when quality.index_tier = 'upcoming' then 'Phim sắp chiếu đã đủ dữ liệu nền; cần hoàn thiện hồ sơ biên tập trước khi nhu cầu tìm kiếm tăng.'
        when quality.index_tier = 'ongoing' then 'Phim đang chiếu có độ mới cao nhưng chưa có hồ sơ biên tập đủ mạnh.'
        else 'Phim đủ điều kiện kỹ thuật nhưng chưa có hồ sơ SEO biên tập hoàn chỉnh.'
      end as reason,
      case
        when risk.has_editorial_risk then array['review_content','faq']::text[]
        when inspection.current_recommendation in ('robots_blocked','fix_fetch_error','review_canonical_duplicate') then array['technical']::text[]
        when inspection.current_recommendation = 'improve_original_content' then array['intro_content','review_content','faq']::text[]
        when inspection.current_recommendation = 'strengthen_internal_links_and_content' then array['intro_content','topic_links']::text[]
        when coalesce(query_signal.impressions,0) >= 3 then array['focus_keyword','seo_title','meta_description','intro_content','topic_links']::text[]
        else array['intro_content','topic_links']::text[]
      end as required_fields,
      jsonb_strip_nulls(jsonb_build_object(
        'quality_score', quality.quality_score,
        'quality_tier', quality.index_tier,
        'content_length', quality.content_length,
        'freshness_score', quality.freshness_score,
        'google_verdict', inspection.verdict,
        'coverage_state', inspection.coverage_state,
        'last_crawl_time', inspection.last_crawl_time,
        'recommendation', inspection.current_recommendation,
        'inspection_age_days', case when inspection.inspected_at is not null then extract(day from now() - inspection.inspected_at)::integer end,
        'non_brand_impressions', query_signal.impressions,
        'non_brand_clicks', query_signal.clicks,
        'weighted_position', round(query_signal.weighted_position::numeric,2),
        'queries', left(query_signal.queries,1000),
        'profile_status', profile.status,
        'profile_score', profile.validation_score,
        'profile_version', profile.version
      )) as evidence
    from public.movie_seo_quality_status quality
    join public.movies movie on movie.id = quality.movie_id
    left join inspection_signals inspection on inspection.movie_id = quality.movie_id
    left join query_signals query_signal on query_signal.slug = quality.slug
    left join public.movie_seo_profiles profile on profile.movie_id = quality.movie_id
    left join profile_risk risk on risk.movie_id = quality.movie_id
    where quality.eligible_for_index = true
      and quality.index_tier in ('playable','ongoing','upcoming')
      and movie.is_published = true
      and movie.superseded_by_movie_id is null
      and (
        (
          profile.status = 'published'
          and profile.index_mode = 'index'
          and profile.validation_score >= 85
          and profile.live_audit->>'passed' = 'true'
        )
        or (
          movie.tmdb_id is not null
          and cardinality(movie.actor) > 0
          and cardinality(movie.director) > 0
          and jsonb_typeof(movie.category) = 'array'
          and jsonb_array_length(movie.category) > 0
          and jsonb_typeof(movie.country) = 'array'
          and jsonb_array_length(movie.country) > 0
          and (
            (
              quality.index_tier in ('playable','ongoing')
              and quality.quality_score >= 85
              and quality.content_length >= 500
            )
            or (
              quality.index_tier = 'upcoming'
              and quality.quality_score >= 88
              and quality.content_length >= 350
              and movie.year between extract(year from now())::integer and extract(year from now())::integer + 2
              and movie.trailer_url ~* '^https://(www\.|m\.)?(youtube\.com/watch\?[^[:space:]]*v=|youtu\.be/|youtube\.com/(embed|shorts)/)'
            )
          )
        )
      )
      and (
        risk.has_editorial_risk
        or inspection.current_recommendation in ('robots_blocked','fix_fetch_error','review_canonical_duplicate','improve_original_content','strengthen_internal_links_and_content')
        or coalesce(query_signal.impressions,0) >= 3
        or profile.movie_id is null
        or profile.status <> 'published'
        or profile.validation_score < 85
      )
      and not exists (
        select 1 from public.seo_work_items completed
        where completed.movie_id = quality.movie_id
          and completed.status = 'completed'
          and completed.completed_at > now() - interval '7 days'
      )
  ),
  ranked as (
    select candidates.*, row_number() over (partition by movie_id order by priority_score desc, task_type) as movie_rank
    from candidates
  )
  select * from ranked where movie_rank = 1;

  select count(*) into candidate_total from seo_brain_candidates;

  update public.seo_work_items item
  set status = 'obsolete', updated_at = now()
  where item.status = 'pending'
    and not exists (select 1 from seo_brain_candidates candidate where candidate.movie_id = item.movie_id);

  insert into public.seo_work_items (
    movie_id, slug, movie_name, task_type, status, priority_score, urgency,
    reason, required_fields, evidence, source_run_id, due_at, last_seen_at, updated_at
  )
  select
    candidate.movie_id,
    candidate.slug,
    candidate.movie_name,
    candidate.task_type,
    'pending',
    candidate.priority_score,
    candidate.urgency,
    candidate.reason,
    candidate.required_fields,
    candidate.evidence,
    selected_gsc_run_id,
    now() + case candidate.urgency
      when 'critical' then interval '1 day'
      when 'high' then interval '3 days'
      when 'medium' then interval '7 days'
      else interval '14 days'
    end,
    now(),
    now()
  from seo_brain_candidates candidate
  on conflict (movie_id) where status in ('pending','in_progress') do update set
    slug = excluded.slug,
    movie_name = excluded.movie_name,
    task_type = excluded.task_type,
    status = case when public.seo_work_items.status = 'in_progress' then 'in_progress' else 'pending' end,
    priority_score = excluded.priority_score,
    urgency = excluded.urgency,
    reason = excluded.reason,
    required_fields = excluded.required_fields,
    evidence = excluded.evidence,
    source_run_id = excluded.source_run_id,
    due_at = excluded.due_at,
    completed_at = null,
    last_seen_at = now(),
    updated_at = now();

  select count(*) into queue_total
  from public.seo_work_items where status in ('pending','in_progress');
  select count(*) into critical_total
  from public.seo_work_items where status in ('pending','in_progress') and urgency = 'critical';
  select count(*) into high_total
  from public.seo_work_items where status in ('pending','in_progress') and urgency = 'high';

  update public.seo_brain_runs set
    finished_at = now(),
    status = 'success',
    candidate_count = candidate_total,
    queued_count = queue_total,
    summary = jsonb_build_object(
      'critical', critical_total,
      'high', high_total,
      'daily_focus_limit', 5,
      'source_gsc_run_id', selected_gsc_run_id
    )
  where id = brain_run_id;

  return jsonb_build_object(
    'success', true,
    'brain_run_id', brain_run_id,
    'source_gsc_run_id', selected_gsc_run_id,
    'candidates', candidate_total,
    'queued', queue_total,
    'critical', critical_total,
    'high', high_total,
    'daily_focus_limit', 5
  );
exception when others then
  update public.seo_brain_runs set
    finished_at = now(), status = 'failed', error_message = sqlerrm
  where id = brain_run_id;
  raise;
end;
$$;

revoke all on function public.refresh_seo_operations_brain(bigint) from public, anon, authenticated;
grant execute on function public.refresh_seo_operations_brain(bigint) to service_role;

comment on table public.seo_work_items is
  'Evidence-backed SEO operating queue. At most one current task per movie; the dashboard presents the top five each day.';
comment on table public.seo_static_release_requests is
  'Requests to rebuild quota-safe static movie HTML and sitemap artifacts after an SEO publish.';
comment on function public.refresh_seo_operations_brain(bigint) is
  'Converts GSC, URL Inspection, lifecycle, content quality and editorial trust signals into a bounded daily SEO work queue.';

commit;
