import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  'supabase/migrations/20260905033505_build_seo_operations_brain.sql',
  'supabase/migrations/20260905034453_schedule_seo_static_release.sql',
  'supabase/migrations/20260917153000_batch_nightly_seo_releases.sql',
  'supabase/functions/gsc-seo-feedback/index.ts',
  'supabase/functions/admin-seo-studio/index.ts',
  'supabase/functions/seo-static-release/index.ts',
  'src/pages/admin-seo/page.tsx',
  'src/pages/admin-seo-studio/page.tsx',
].map(async (file) => [file, await readFile(file, 'utf8')])));

const failures = [];
const requireText = (file, text, message) => {
  if (!files[file].includes(text)) failures.push(`${file}: ${message}`);
};

requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', 'create table if not exists public.seo_work_items', 'missing persistent SEO work queue');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', 'seo_work_items_one_active_movie_idx', 'queue does not enforce one current task per movie');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', "on conflict (movie_id) where status in ('pending','in_progress')", 'queue cannot retain completed task history');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', 'create or replace function public.refresh_seo_operations_brain', 'missing evidence scoring function');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', "inspection.inspected_at >= now() - interval '14 days'", 'brain trusts stale URL Inspection evidence');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', 'current_recommendation', 'brain trusts historical recommendation labels without recalculation');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', "quality.index_tier in ('playable','ongoing','upcoming')", 'brain is not restricted to approved lifecycle tiers');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', "'daily_focus_limit', 5", 'daily workload is not bounded');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', 'alter table public.seo_work_items enable row level security', 'work queue has no RLS');
requireText('supabase/migrations/20260905033505_build_seo_operations_brain.sql', 'revoke all on function public.refresh_seo_operations_brain', 'privileged brain function is publicly executable');

requireText('supabase/functions/gsc-seo-feedback/index.ts', "from('seo_work_items')", 'dashboard does not load daily work');
requireText('supabase/functions/gsc-seo-feedback/index.ts', "supabase.rpc('refresh_seo_operations_brain'", 'GSC collection does not refresh the brain');
requireText('supabase/functions/gsc-seo-feedback/index.ts', '&& !brainError', 'a failed SEO brain run can be reported as a successful GSC cycle');
requireText('supabase/functions/gsc-seo-feedback/index.ts', 'daily_work_items:workItems || []', 'daily tasks are not returned to the admin dashboard');
requireText('supabase/functions/gsc-seo-feedback/index.ts', 'Object.entries(queryVisibility)', 'query visibility is not serialized as the array expected by the UI');

requireText('src/pages/admin-seo/page.tsx', "useState<'work'", 'dashboard does not open on daily work');
requireText('src/pages/admin-seo/page.tsx', 'data-kp-seo-brain="true"', 'daily brain UI marker is missing');
requireText('src/pages/admin-seo/page.tsx', '5 việc quan trọng nhất hôm nay', 'daily focus is not clear to the operator');
requireText('src/pages/admin-seo/page.tsx', '/admin/seo-studio?movie=', 'work items do not deep-link into SEO Studio');
requireText('src/pages/admin-seo-studio/page.tsx', "params.get('movie')", 'SEO Studio cannot open a selected brain task');
requireText('src/pages/admin-seo-studio/page.tsx', "requestedTask === 'fix_technical'", 'SEO Studio does not route tasks to the relevant editing step');

requireText('supabase/functions/admin-seo-studio/index.ts', "status: 'completed'", 'successful publishing does not complete the work item');
requireText('supabase/functions/admin-seo-studio/index.ts', "from('seo_static_release_requests')", 'publishing does not request a static artifact refresh');
requireText('supabase/functions/seo-static-release/index.ts', 'validDeployHook', 'static release processor accepts arbitrary webhook destinations');
requireText('supabase/functions/seo-static-release/index.ts', 'SITE_RELEASE_URL', 'static release processor cannot confirm production deployment');
requireText('supabase/functions/seo-static-release/index.ts', "action: 'awaiting_deploy_hook'", 'missing deploy-hook configuration does not fail safely');
requireText('supabase/functions/admin-seo-studio/index.ts', "status: 'queued-static'", 'free publish mode does not queue a static Pages release');
requireText('supabase/functions/admin-seo-studio/index.ts', "mode: 'static-build-pending'", 'static profiles are not marked as pending build verification');
requireText('supabase/functions/seo-static-release/index.ts', 'verifyStaticPublication', 'static deploy completion is trusted without verifying public HTML and sitemap');
requireText('supabase/functions/seo-static-release/index.ts', ".limit(mode === 'urgent' ? 10 : 50)", 'pending SEO pages are not batched into one free Pages build');
requireText('supabase/functions/seo-static-release/index.ts', 'public_sitemap_membership', 'static release does not persist the public sitemap evidence used by SEO Studio');
requireText('supabase/functions/seo-static-release/index.ts', 'explicitProfileRelease', 'generic radar rebuilds and versioned SEO publishes are not verified separately');
requireText('supabase/functions/seo-static-release/index.ts', 'VERIFICATION_TIMEOUT_MS', 'a failed public verification can remain processing forever');
requireText('supabase/functions/seo-static-release/index.ts', 'audit persistence failed', 'a release can be marked deployed before its public audit is persisted');
requireText('supabase/functions/admin-seo-studio/index.ts', "payload.index_mode === 'auto'", 'automatic index mode is not resolved before static publication');
requireText('supabase/functions/admin-seo-studio/index.ts', "action === 'release_status'", 'SEO Studio cannot refresh an asynchronous release without reloading the draft');
requireText('supabase/functions/admin-seo-studio/index.ts', "action === 'retry_release'", 'failed static publications have no safe retry path');
requireText('src/pages/admin-seo-studio/page.tsx', 'data-kp-seo-publication-state="true"', 'operator cannot distinguish profile, website, sitemap and Google index states');
requireText('src/pages/admin-seo-studio/page.tsx', 'getSeoReleaseStatus', 'pending static publication is not refreshed automatically');
requireText('supabase/migrations/20260905034453_schedule_seo_static_release.sql', 'process-seo-static-release-requests', 'static release requests are not scheduled');
requireText('supabase/migrations/20260917153000_batch_nightly_seo_releases.sql', "'30 20 * * *'", 'normal SEO releases are not batched at 03:30 Asia/Ho_Chi_Minh');
requireText('supabase/migrations/20260917153000_batch_nightly_seo_releases.sql', "'*/10 * * * *'", 'urgent SEO releases do not have a bounded fast lane');
requireText('supabase/migrations/20260917153000_batch_nightly_seo_releases.sql', 'release_lane', 'release queue does not distinguish nightly and urgent work');
requireText('supabase/functions/seo-static-release/index.ts', "seo_draft_scheduled", 'nightly processor does not atomically materialize approved drafts before the build');
requireText('supabase/functions/seo-static-release/index.ts', "mode === 'urgent'", 'urgent processor can trigger normal nightly releases');

if (failures.length) {
  console.error('SEO operations brain regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('SEO operations brain regression passed.');
