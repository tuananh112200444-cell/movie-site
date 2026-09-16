import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  'src/pages/admin-seo-studio/page.tsx',
  'src/components/base/SEO.tsx',
  'src/services/seoStudioService.ts',
  'src/components/feature/MovieSeoProfileContent.tsx',
  'src/pages/movie-detail/page.tsx',
  'src/router/config.tsx',
  'supabase/functions/admin-seo-studio/index.ts',
  'supabase/functions/static-seo-catalog/index.ts',
  'supabase/functions/sitemap-seo-studio/index.ts',
  'supabase/migrations/20260828170000_complete_movie_seo_studio.sql',
  'supabase/migrations/20260828103000_add_movie_seo_studio.sql',
  'supabase/migrations/20260905030000_add_safe_seo_studio_editing.sql',
  'scripts/generate-static-movie-pages.mjs',
  'scripts/verify-seo-deployment.mjs',
  'scripts/production-smoke.mjs',
  'functions/[[path]].js',
].map(async (file) => [file, await readFile(file, 'utf8')])));

function expect(file, patterns) {
  const source = files[file];
  for (const [pattern, message] of patterns) {
    if (!source.includes(pattern)) throw new Error(`${file}: ${message}`);
  }
}

expect('src/router/config.tsx', [
  ["path: '/admin/seo-studio'", 'missing protected SEO Studio route'],
  ['<AdminGuard><AdminSeoStudioPage /></AdminGuard>', 'SEO Studio is not protected by AdminGuard'],
]);
expect('src/pages/admin-seo-studio/page.tsx', [
  ['Dữ liệu phim', 'missing movie step'],
  ['Hiển thị Google', 'missing SERP step'],
  ['Nội dung hữu ích', 'missing content step'],
  ['Cụm chủ đề', 'missing internal-link step'],
  ['Kiểm tra & xuất bản', 'missing publish step'],
  ['Xuất bản toàn bộ SEO', 'missing atomic publish action'],
  ['Kiểm tra trang thật', 'missing live page inspection workflow'],
  ['tự giữ trang ở noindex', 'missing fail-closed publish explanation'],
  ['LOCAL_DRAFT_PREFIX', 'SEO Studio does not persist an automatic local draft'],
  ['readNewerLocalDraft', 'SEO Studio cannot restore interrupted edits'],
  ['setAssistantApplied(restoredHasChanges)', 'restored AI drafts incorrectly restart the workflow at the beginning'],
  ['restoredHasChanges ? null : result.profile?.live_audit', 'restored draft incorrectly reuses the published version live audit'],
  ['Bản nháp đã tự lưu trên máy này', 'SEO Studio does not show draft persistence status'],
  ["refreshed.profile?.status !== 'published'", 'SEO Studio does not confirm the server publish state'],
  ['data-kp-safe-edit="true"', 'SEO Studio has no visible safe-edit mode'],
  ['Chế độ chỉnh sửa an toàn đang bật', 'SEO Studio does not explain protected editing'],
  ['isFieldLocked', 'good SEO fields are not locked by default'],
  ['Khôi phục bản đang chạy', 'SEO Studio cannot discard risky changes'],
  ['hasScoreRegression', 'SEO Studio does not warn when the new draft scores worse'],
  ['Trợ lý AI SEO của bạn', 'missing AI-assisted editorial workflow'],
  ['AI không tự xuất bản', 'AI workflow does not state the publish boundary'],
  ['selectedAiFields', 'AI suggestions cannot be reviewed field by field'],
  ['applyAiSuggestion', 'AI suggestions cannot be selectively applied to a draft'],
  ['Các mục tốt chỉ thay đổi khi bạn tự chọn', 'good SEO fields are not protected from default AI selection'],
  ['Dữ liệu phim đang đạt — không cần sửa', 'already-good movie data is not collapsed by default'],
  ['Gợi ý từ dữ liệu có sẵn', 'SEO Studio disguises its non-AI fallback as AI'],
  ['SEO Worker đang không chạy trên website thật', 'operator cannot see when the SEO Worker is unavailable'],
  ['error.liveAudit', 'failed pre-publish live audit is not shown to the operator'],
  ['Hôm nay chỉ cần làm một việc', 'SEO Studio does not identify one clear next action for a non-technical operator'],
  ['data-kp-seo-next-action="true"', 'SEO Studio has no stable priority-action surface'],
  ['getPriorityAction', 'SEO Studio does not prioritize blocking issues before editorial improvements'],
  ['Chế độ đơn giản', 'SEO Studio cannot hide advanced controls for a focused daily workflow'],
  ['Để trợ lý AI làm bản nháp', 'SEO Studio has no single assistant action from the daily workflow'],
  ['Trợ lý AI chuẩn bị toàn bộ bản nháp', 'SEO Studio does not make the AI copilot responsible for the full safe draft'],
  ['bạn chỉ duyệt phần thay đổi', 'SEO Studio does not clearly retain human review before applying AI work'],
  ['applySuggestionFields(result, safeDefaults)', 'AI recommendations are not automatically copied into the private draft'],
  ['đã tự điền ${safeDefaults.length} mục còn yếu vào bản nháp', 'operator cannot tell that AI changes are already present in the draft'],
  ['VALIDATION_FIELD_MAP', 'safe-edit field states do not refresh after AI changes the draft'],
  ['Lỗi bắt buộc', 'SEO Studio still presents stale baseline issues as current blocking errors'],
  ['data-kp-unified-seo-workbench="true"', 'SEO Studio has no unified daily AI workbench'],
  ['SEO AI Workspace · một luồng duy nhất', 'SEO Studio still presents its primary workflow as disconnected tools'],
  ['Nút hành động sẽ chuyển', 'unified workbench does not explain its review and publish sequence'],
  ['Duyệt ${selectedAiFields.length} thay đổi & tiếp tục', 'unified workbench hides the next action after AI finishes'],
  ["'Xuất bản SEO'", 'unified workbench does not expose a clear publish action after live verification'],
  ["loaded.ai_provider === 'gemini'", 'SEO Studio does not disclose the active server-side AI provider'],
]);
expect('src/services/seoStudioService.ts', [
  ["callAdmin('publish'", 'missing authenticated publish call'],
  ["callAdmin<SeoAiSuggestionResult>('suggest'", 'missing authenticated AI suggestion call'],
  ['worker_status?:', 'SEO Studio load result does not expose live Worker status'],
  [".eq('status', 'published')", 'public reader may expose drafts'],
]);
expect('supabase/functions/admin-seo-studio/index.ts', [
  ['verifyAdminRequest(req)', 'admin endpoint is not authenticated'],
  ["action === 'save' || action === 'publish'", 'missing save/publish workflow'],
  ["from('movie_seo_profile_drafts')", 'saving a draft can still mutate the published profile'],
  ['regressionIssues(', 'server does not compare the draft with the live baseline'],
  ['protected_field_changed_', 'server does not protect verified fields'],
  ['valuable_list_shrunk_', 'server does not block destructive list reductions'],
  ['valuable_intro_shrunk', 'server does not block destructive content shortening'],
  ['unsupported_rating_claim', 'unverified editorial ratings are not blocked'],
  ["db.rpc('rollback_movie_seo_profile'", 'failed publishing cannot restore the previous good version'],
  ["status: 'completed'", 'successful publishing does not complete the current SEO brain task'],
  ["from('seo_static_release_requests')", 'successful publishing does not request a static artifact refresh'],
  ["db.rpc('publish_movie_seo_profile'", 'publish is not delegated to atomic database RPC'],
  ["payload.index_mode === 'index'", 'validation/index contract unexpectedly changed'],
  ["action === 'inspect'", 'missing authenticated live inspection action'],
  ["inspectLivePage(payload, publishedVersion, 'pending')", 'publish does not verify the pending noindex Googlebot document'],
  ["inspectLivePage(payload, verifiedVersion, 'final')", 'publish does not verify the final Googlebot document'],
  ["phase === 'pending'", 'publish verification is not fail-closed before index'],
  ['X-KhoPhim-SEO-Inspect-Secret', 'live inspection does not use the authenticated edge renderer'],
  ["status === 403", 'live inspection does not distinguish an anti-bot block from an SEO content error'],
  ["index_mode: 'noindex'", 'failed live publish does not fail closed'],
  ['remoteValidationIssues', 'publish does not verify duplicate metadata and public resources'],
  ["action === 'suggest'", 'missing protected AI suggestion action'],
  ["https://api.openai.com/v1/responses", 'AI suggestion does not use the Responses API'],
  ["type: 'json_schema'", 'AI output is not constrained by Structured Outputs'],
  ['AI_EDITABLE_FIELDS', 'AI fields are not explicitly allowlisted'],
  ["index_mode: baseline.index_mode", 'AI can change the index directive'],
  ["canonical_path: `/phim/${slug}`", 'AI can change canonical identity'],
  ['allowedTopicPaths', 'AI can invent internal-link destinations'],
  ['store: false', 'AI request is stored unnecessarily'],
  ['fallbackAiSuggestion', 'SEO Studio has no safe fallback when AI is unavailable'],
  ["Deno.env.get('GEMINI_API_KEY')", 'SEO Studio cannot use a server-side Gemini key'],
  ['requestGeminiSuggestion', 'SEO Studio has no Gemini editorial request path'],
  ["'x-goog-api-key': GEMINI_API_KEY", 'Gemini key is not kept in the server-to-server request header'],
  ['responseJsonSchema: AI_SUGGESTION_SCHEMA', 'Gemini response is not constrained to the SEO suggestion schema'],
  ['Phải xử lý hết lỗi bắt buộc trong current_validation', 'AI is not instructed to resolve the current blocking validation errors'],
  ["gemini-3.5-flash-lite", 'quick SEO drafts do not use the low-latency Gemini model'],
  ['modelCandidates', 'Gemini overload has no bounded model fallback'],
  ['suggestion = fallbackAiSuggestion', 'Gemini overload leaves the operator without a safe draft'],
  ['seoWorkerStatus()', 'SEO Studio does not check Worker availability before editorial work'],
  ['seo_worker_preflight_failed', 'publishing can mutate a good profile while the SEO Worker is unavailable'],
]);
const studioEndpoint = files['supabase/functions/admin-seo-studio/index.ts'];
if (studioEndpoint.indexOf('const prePublishAudit = await inspectLivePage(payload)') < 0
  || studioEndpoint.indexOf('const prePublishAudit = await inspectLivePage(payload)') > studioEndpoint.indexOf("db.rpc('publish_movie_seo_profile'")) {
  throw new Error('SEO Worker preflight must run before the atomic publish RPC.');
}
expect('scripts/verify-seo-deployment.mjs', [
  ["/sitemap-seo-studio.xml'", 'deployment audit does not distinguish the dynamic SEO Studio sitemap from the intentionally static root sitemap'],
  ["response.headers.get('x-sitemap-proxy') !== 'cloudflare-pages'", 'deployment audit accepts a static fallback as a healthy SEO Studio sitemap'],
  ["/internal/seo-studio-inspect?slug=", 'deployment audit does not verify the protected SEO Studio inspection route'],
  ["/api/time", 'deployment audit does not verify the Pages Worker health route'],
]);
if (files['scripts/production-smoke.mjs'].includes("'sitemap-movies-recent.xml','feed.xml'")) {
  throw new Error('production smoke still requires the runtime-only RSS feed inside the sitemap index.');
}
const aiSchema = files['supabase/functions/admin-seo-studio/index.ts'].split('const AI_SUGGESTION_SCHEMA = {')[1]?.split('function aiPatchFromSuggestion')[0] || '';
if (!aiSchema || aiSchema.includes('maxLength:')) {
  throw new Error('AI Structured Outputs schema contains an unsupported maxLength keyword; length must be enforced after generation.');
}
expect('supabase/migrations/20260828103000_add_movie_seo_studio.sql', [
  ['enable row level security', 'SEO profile table has no RLS'],
  ["using (status = 'published')", 'drafts are publicly readable'],
  ['publish_movie_seo_profile', 'missing atomic publish function'],
  ['refresh_movie_seo_quality', 'publish does not refresh SEO quality'],
]);
expect('src/components/feature/MovieSeoProfileContent.tsx', [
  ['profile.seo_title', 'published title override is not used'],
  ["'@type': 'FAQPage'", 'FAQ schema is missing'],
  ['profile?.topic_links.map', 'topic cluster is not rendered'],
  ['preserveSchema', 'manual profile can remove the movie schema'],
  ['getIncomingSeoTopicLinks', 'movie topic links are not reciprocal'],
  ['profile.intro_content.trim()', 'published editorial introduction is not visible after hydration'],
  ['profile.review_content.trim()', 'published editorial review is not visible after hydration'],
]);
expect('src/components/base/SEO.tsx', [
  ['if (!schemaJson && !preserveSchema)', 'schema preservation contract is missing'],
]);
expect('src/pages/movie-detail/page.tsx', [
  ['<MovieSeoProfileContent', 'movie page is not connected to the published profile'],
]);
expect('supabase/functions/static-seo-catalog/index.ts', [
  [".from('movie_seo_profiles')", 'static crawler catalogue ignores manual profiles'],
  ['Trailer/upcoming pages can also have a verified editorial profile', 'static upcoming pages can lag behind a verified SEO Studio publish'],
  ["profile?.index_mode === 'index'", 'manual index approval is not gated'],
  [".eq('live_audit->>passed', 'true')", 'static catalogue accepts profiles that failed the live audit'],
]);
expect('scripts/generate-static-movie-pages.mjs', [
  ['profile?.seo_title', 'static HTML ignores custom SEO title'],
  ["'@type': 'FAQPage'", 'static HTML lacks FAQ schema'],
  ['sitemap-seo-studio.xml', 'static root sitemap omits SEO Studio sitemap'],
  ['data-kp-seo-profile-version', 'static fail-open HTML lacks the SEO profile version marker'],
  ['profile?.review_content', 'static fail-open HTML omits the editorial review'],
  ['kp-static-movie-data', 'static movie HTML does not embed the fast information bootstrap'],
]);
expect('supabase/functions/sitemap-seo-studio/index.ts', [
  [".eq('index_mode', 'index')", 'manual sitemap includes non-approved URLs'],
  [".gte('validation_score', 85)", 'manual sitemap lacks quality threshold'],
  [".eq('live_audit->>passed', 'true')", 'manual sitemap accepts profiles that failed the live audit'],
]);
expect('functions/[[path]].js', [
  ["pathname === '/sitemap-seo-studio.xml'", 'Cloudflare does not route the SEO Studio sitemap'],
  ['fetchPublishedMovieSeoProfile(slug)', 'Googlebot prerender does not read the live published profile'],
  ['__seo-studio-prerender/${profileVersion}', 'published profile version is not part of the edge cache key'],
  ['data-kp-seo-profile-version', 'Googlebot HTML has no published profile marker'],
  ['profileAuditPassed', 'Googlebot can index a manual profile before its live audit passes'],
  ['Number(seoProfile.validation_score || 0) >= 85', 'Googlebot manual-index threshold is inconsistent'],
  ["pathname === '/internal/seo-studio-inspect'", 'Cloudflare is missing the authenticated SEO inspection route'],
  ['renderSeoStudioInspection(request, context)', 'SEO inspection route is not connected'],
]);
expect('supabase/migrations/20260828170000_complete_movie_seo_studio.sql', [
  ['movie_seo_topic_links', 'missing reciprocal topic edge table'],
  ['live_audit', 'missing persistent post-publish audit state'],
  ['validation score must be at least 80', 'database publish gate is too weak'],
]);
expect('supabase/migrations/20260905030000_add_safe_seo_studio_editing.sql', [
  ['movie_seo_profile_drafts', 'missing private draft table'],
  ['movie_seo_profile_versions', 'missing recoverable SEO version history'],
  ['draft.baseline_version <> current_version', 'database publish does not reject stale drafts'],
  ['Canonical movie identity cannot be changed', 'database does not protect canonical identity'],
  ['rollback_movie_seo_profile', 'missing atomic recovery function'],
]);

console.log('SEO Studio regression checks passed.');
