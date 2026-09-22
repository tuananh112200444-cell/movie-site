import { expect, test } from '@playwright/test';

const movie = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'spider-man-brand-new-day',
  name: 'Người Nhện: Khởi Đầu Mới',
  origin_name: 'Spider-Man: Brand New Day',
  title_vi: 'Người Nhện: Khởi Đầu Mới',
  title_en: 'Spider-Man: Brand New Day',
  content: 'Người Nhện: Khởi Đầu Mới mở ra một giai đoạn mới trong hành trình của Peter Parker. Trang phim tổng hợp thông tin phát hành, dàn diễn viên, trailer và những cập nhật chính thức, đồng thời cung cấp bối cảnh cần thiết để người xem hiểu vị trí của tác phẩm trong loạt phim.',
  year: 2026,
  quality: 'HD',
  lang: 'Vietsub',
  trailer_url: 'https://www.youtube.com/embed/example',
  thumb_url: 'https://example.com/poster.jpg',
  poster_url: 'https://example.com/backdrop.jpg',
  actor: ['Tom Holland'],
  director: ['Destin Daniel Cretton'],
  category: [{ id: '', name: 'Hành động', slug: 'hanh-dong' }],
  country: [{ id: '', name: 'Âu Mỹ', slug: 'au-my' }],
  is_published: true,
  updated_at: '2026-08-28T00:00:00Z',
};

const basePayload = {
  movie_id: movie.id,
  slug: movie.slug,
  focus_keyword: 'người nhện khởi đầu mới',
  secondary_keywords: ['Spider-Man: Brand New Day'],
  seo_title: 'Spider-Man: Khởi Đầu Mới (2026) – Thông Tin Phim | KhoPhim',
  meta_description: 'Spider-Man: Khởi Đầu Mới – nội dung, diễn viên, trailer, lịch phát hành và thông tin mới nhất về Spider-Man: Brand New Day.',
  canonical_path: '/phim/spider-man-brand-new-day',
  og_image_url: movie.poster_url,
  index_mode: 'auto',
  intro_content: movie.content,
  review_content: '',
  faq: [],
  topic_links: [],
  movie_patch: {
    name: movie.name, title_vi: movie.title_vi, title_en: movie.title_en, origin_name: movie.origin_name,
    year: movie.year, quality: movie.quality, lang: movie.lang, trailer_url: movie.trailer_url,
    thumb_url: movie.thumb_url, poster_url: movie.poster_url, actor: movie.actor, director: movie.director,
    category: movie.category, country: movie.country,
  },
};

test.beforeEach(async ({ page }) => {
  let publishedProfile: Record<string, unknown> | null = null;
  await page.addInitScript(() => {
    sessionStorage.setItem('kp_admin_token', 'e2e-admin-token');
    sessionStorage.setItem('kp_admin_token_exp', String(Math.floor(Date.now() / 1000) + 3600));
  });

  await page.route('**/functions/v1/admin-seo-studio', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}') as { action?: string; mode?: string; payload?: Record<string, unknown> };
    let response: unknown = {};
    if (body.action === 'search') response = { items: [movie] };
    if (body.action === 'load') {
      const baseline = publishedProfile ? { ...basePayload, ...publishedProfile } : basePayload;
      response = {
        movie,
        profile: publishedProfile,
        review: null,
        quality: { eligible_for_index: true, index_tier: 'upcoming', quality_score: 92, reasons: [], signals: ['upcoming'] },
        suggestions: {
          title: basePayload.seo_title,
          description: basePayload.meta_description,
          canonical_path: basePayload.canonical_path,
        },
        safe_edit: {
          baseline,
          baseline_version: Number(publishedProfile?.version || 0),
          baseline_validation: { score: 100, issues: [] },
          fields: { intro_content: { status: 'needs_attention', protected: false, reason: 'Cần bổ sung nội dung.' } },
          draft: null,
          history_available: Boolean(publishedProfile),
        },
      };
    }
    if (body.action === 'validate') response = { score: 100, issues: [{ code: 'ready', severity: 'success', section: 'technical', message: 'Trang đã sẵn sàng xuất bản và index.' }] };
    if (body.action === 'suggest' && body.mode === 'deep') response = {
      ai_available: true,
      provider: 'gemini',
      model: 'gemini-test',
      mode: 'deep',
      summary: 'Đã xác minh và bổ sung dữ liệu phim còn thiếu trước khi viết SEO.',
      proposed_payload: {
        ...basePayload,
        movie_patch: {
          ...basePayload.movie_patch,
          actor: ['Tom Holland', 'Zendaya'],
          country: [{ id: 'US', name: 'Âu Mỹ', slug: 'au-my' }],
        },
      },
      validation: { score: 100, issues: [{ code: 'ready', severity: 'success', section: 'technical', message: 'Nội dung và tài nguyên đã qua cổng xuất bản.' }] },
      changed_fields: ['movie_patch.actor', 'movie_patch.country'],
      evidence: [],
      warnings: [],
      completion: { complete: true, repaired_in_second_pass: false, remaining_issues: [], ai_fixable_remaining: [], requires_data_enrichment: [], limitations: [] },
      fact_enrichment: {
        patch: { actor: ['Tom Holland', 'Zendaya'], country: [{ id: 'US', name: 'Âu Mỹ', slug: 'au-my' }] },
        verified_fields: ['movie_patch.actor', 'movie_patch.country'],
        unresolved_fields: [],
        sources: ['TMDB khớp tên và năm phát hành'],
        tmdb_status: 'verified',
        message: 'Đã xác minh và bổ sung 2 trường dữ liệu phim vào bản nháp.',
      },
      preserved_fields: ['slug', 'canonical_path', 'index_mode', 'movie_patch'],
      generated_at: '2026-09-17T00:00:00Z',
    };
    if (body.action === 'suggest' && body.mode !== 'deep') response = {
      ai_available: true,
      provider: 'gemini',
      model: 'gemini-test',
      mode: 'quick',
      summary: 'Đã sửa mô tả nhưng review vẫn chưa đủ dữ kiện để hoàn tất an toàn.',
      proposed_payload: { ...basePayload, meta_description: 'Người Nhện: Khởi Đầu Mới – nội dung, diễn viên, đạo diễn, trailer và thông tin phát hành được cập nhật tại KhoPhim.', review_content: 'Bản nhận xét còn ngắn.' },
      validation: { score: 97, issues: [{ code: 'thin_review', severity: 'warning', section: 'content', message: 'Review đang ngắn; nên bổ sung nhận xét thực sự hữu ích.' }] },
      changed_fields: ['meta_description', 'review_content'],
      evidence: [],
      warnings: ['AI vẫn còn 1 mục có thể cải thiện; hệ thống không đánh dấu hoàn thành.'],
      completion: {
        complete: false,
        repaired_in_second_pass: true,
        remaining_issues: [{ code: 'thin_review', severity: 'warning', section: 'content', message: 'Review đang ngắn; nên bổ sung nhận xét thực sự hữu ích.' }],
        ai_fixable_remaining: ['thin_review'],
        requires_data_enrichment: [],
        limitations: ['AI vẫn còn 1 mục có thể cải thiện; hệ thống không đánh dấu hoàn thành.'],
      },
      preserved_fields: ['slug', 'canonical_path', 'index_mode', 'movie_patch'],
      generated_at: '2026-09-17T00:00:00Z',
    };
    if (body.action === 'inspect') response = {
      validation: { score: 100, issues: [{ code: 'ready', severity: 'success', section: 'technical', message: 'Nội dung và tài nguyên đã qua cổng xuất bản.' }] },
      live_audit: {
        passed: true,
        checked_at: '2026-08-28T00:00:00Z',
        url: 'https://khophim.org/phim/spider-man-brand-new-day',
        status: 200,
        checks: [
          { code: 'http_200', passed: true, message: 'Trang phim trả về HTTP 200.' },
          { code: 'canonical', passed: true, message: 'Canonical chính xác.' },
        ],
      },
    };
    if (body.action === 'save') response = { success: true, status: 'draft', validation: { score: 100, issues: [] } };
    if (body.action === 'publish') {
      publishedProfile = {
        ...(body.payload ?? {}),
        status: 'published',
        validation_score: 100,
        version: 2,
        live_audit: {
          passed: true,
          checked_at: '2026-08-28T01:00:00Z',
          url: 'https://khophim.org/phim/spider-man-brand-new-day',
          status: 200,
          checks: [
            { code: 'http_200', passed: true, message: 'Trang phim trả về HTTP 200.' },
            { code: 'robots_index', passed: true, message: 'Robots cho phép index.' },
          ],
        },
        updated_at: '2026-08-28T01:00:00Z',
      };
      response = {
        success: true,
        status: 'published-indexable',
        validation: { score: 100, issues: [] },
        result: { slug: movie.slug },
        public_discovery: { indexable: true, in_sitemap: true, checked_at: '2026-08-28T01:00:00Z' },
      };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
});

test('SEO Studio hoàn thành quy trình chọn phim, chỉnh sửa và xuất bản', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/admin/seo-studio', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'SEO Studio' })).toBeVisible();
  const closeCampaignBanner = page.getByRole('button', { name: 'Đóng banner catfish' });
  if (await closeCampaignBanner.isVisible()) await closeCampaignBanner.click();

  const search = page.getByPlaceholder('Nhập tên phim, tên gốc hoặc slug...');
  await search.fill('Spider-Man');
  await expect(page.getByRole('button', { name: /Người Nhện: Khởi Đầu Mới/ })).toBeVisible();
  await page.getByRole('button', { name: /Người Nhện: Khởi Đầu Mới/ }).click();

  await page.locator('[data-testid="campaign-catfish"]').evaluateAll((elements) => elements.forEach((element) => element.remove()));
  await page.getByRole('button', { name: /Mở chỉnh sâu khi cần/ }).click();
  await expect(page.getByRole('button', { name: /1. Chẩn đoán/ })).toBeVisible();
  await page.getByRole('button', { name: /2. AI & biên tập/ }).click();
  const intro = page.getByPlaceholder('Giới thiệu phim bằng nội dung do bạn biên soạn...');
  const restoredIntro = `${movie.content} Bản nháp tự động phải tồn tại sau khi trang tải lại.`;
  if (await intro.isDisabled()) await page.getByRole('button', { name: 'Mở sửa' }).first().click();
  await intro.fill(restoredIntro);
  await expect(page.getByText('Bản nháp đã tự lưu trên máy này')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Đã khôi phục bản nháp an toàn; hồ sơ đang chạy vẫn được giữ nguyên.')).toBeVisible();
  const reloadedCampaignBanner = page.getByRole('button', { name: 'Đóng banner catfish' });
  if (await reloadedCampaignBanner.isVisible()) await reloadedCampaignBanner.click();
  await page.locator('[data-testid="campaign-catfish"]').evaluateAll((elements) => elements.forEach((element) => element.remove()));
  await page.getByRole('button', { name: /Mở chỉnh sâu khi cần/ }).click();
  await expect(page.getByPlaceholder('Giới thiệu phim bằng nội dung do bạn biên soạn...')).toHaveValue(restoredIntro);

  await page.getByRole('button', { name: /3. Kiểm tra & xuất bản/ }).click();
  await expect(page.getByText('Điểm sẵn sàng')).toBeVisible();
  await page.getByRole('button', { name: /Cho phép index/ }).click();
  await page.getByRole('button', { name: 'Kiểm tra trang thật', exact: true }).click();
  await expect(page.getByText('Trang thật, canonical, schema, ảnh và liên kết đã qua kiểm tra trước xuất bản.')).toBeVisible();
  await expect(page.getByText('Trang phim trả về HTTP 200.')).toBeVisible();
  await page.getByRole('button', { name: 'Xuất bản & đưa vào sitemap Google' }).click();
  await expect(page.getByText('Đã xuất bản: URL công khai cho phép Google index và đã có trong sitemap SEO Studio.')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  expect(runtimeErrors).toEqual([]);
});

test('SEO Studio không báo hoàn thành khi AI vẫn để lại cảnh báo có thể sửa', async ({ page }) => {
  await page.goto('/admin/seo-studio', { waitUntil: 'domcontentloaded' });
  const search = page.getByPlaceholder('Nhập tên phim, tên gốc hoặc slug...');
  await search.fill('Spider-Man');
  await page.getByRole('button', { name: /Người Nhện: Khởi Đầu Mới/ }).click();
  await page.locator('[data-testid="campaign-catfish"]').evaluateAll((elements) => elements.forEach((element) => element.remove()));
  await page.getByRole('button', { name: /Để trợ lý làm toàn bộ/ }).click();
  await expect(page.getByText('AI chưa hoàn tất — còn 1 mục cần xử lý')).toBeVisible();
  await expect(page.getByText('Review đang ngắn; nên bổ sung nhận xét thực sự hữu ích.')).toBeVisible();
  await expect(page.getByText(/AI đã hoàn thành — bạn chỉ cần duyệt thay đổi/)).toHaveCount(0);
});

test('SEO Studio tự áp dụng dữ kiện phim đã được xác minh vào bản nháp riêng', async ({ page }) => {
  await page.goto('/admin/seo-studio', { waitUntil: 'domcontentloaded' });
  const search = page.getByPlaceholder('Nhập tên phim, tên gốc hoặc slug...');
  await search.fill('Spider-Man');
  await page.getByRole('button', { name: /Người Nhện: Khởi Đầu Mới/ }).click();
  await page.locator('[data-testid="campaign-catfish"]').evaluateAll((elements) => elements.forEach((element) => element.remove()));
  await page.getByRole('button', { name: /Mở chỉnh sâu khi cần/ }).click();
  await page.getByRole('button', { name: /2. AI & biên tập/ }).click();
  await page.getByRole('button', { name: 'Chuyên sâu' }).click();
  await page.getByRole('button', { name: /Trợ lý AI chuẩn bị toàn bộ bản nháp/ }).click();
  await expect(page.getByText('Đã xác minh và bổ sung 2 trường dữ liệu phim vào bản nháp.')).toBeVisible();
  await expect(page.getByText(/Tom Holland, Zendaya/).first()).toBeVisible();
  await expect(page.getByText(/Âu Mỹ/).first()).toBeVisible();
});
