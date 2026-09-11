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
    const body = JSON.parse(route.request().postData() || '{}') as { action?: string; payload?: Record<string, unknown> };
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
      response = { success: true, status: 'published', validation: { score: 100, issues: [] }, result: { slug: movie.slug } };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
});

test('SEO Studio hoàn thành quy trình chọn phim, chỉnh sửa và xuất bản', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/admin/seo-studio', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'SEO Studio' })).toBeVisible();

  const search = page.getByPlaceholder('Nhập tên phim, tên gốc hoặc slug...');
  await search.fill('Spider-Man');
  await expect(page.getByRole('button', { name: /Người Nhện: Khởi Đầu Mới/ })).toBeVisible();
  await page.getByRole('button', { name: /Người Nhện: Khởi Đầu Mới/ }).click();

  await expect(page.getByRole('button', { name: /1. Dữ liệu phim/ })).toBeVisible();
  await page.getByRole('button', { name: /2. Hiển thị Google/ }).click();
  await expect(page.getByText('SEO Title *')).toBeVisible();
  await expect(page.getByText('Spider-Man: Khởi Đầu Mới (2026) – Thông Tin Phim | KhoPhim').first()).toBeVisible();

  await page.getByRole('button', { name: /3. Nội dung hữu ích/ }).click();
  const intro = page.getByPlaceholder('Giới thiệu phim bằng nội dung do bạn biên soạn...');
  const restoredIntro = `${movie.content} Bản nháp tự động phải tồn tại sau khi trang tải lại.`;
  await intro.fill(restoredIntro);
  await expect(page.getByText('Bản nháp đã tự lưu trên máy này')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Đã khôi phục bản nháp an toàn; hồ sơ đang chạy vẫn được giữ nguyên.')).toBeVisible();
  await expect(page.getByPlaceholder('Giới thiệu phim bằng nội dung do bạn biên soạn...')).toHaveValue(restoredIntro);

  await page.getByRole('button', { name: /5. Kiểm tra & xuất bản/ }).click();
  await expect(page.getByText('Điểm sẵn sàng xuất bản')).toBeVisible();
  await page.getByRole('button', { name: 'Kiểm tra trang thật', exact: true }).click();
  await expect(page.getByText('Trang thật, canonical, schema, ảnh và liên kết đã qua kiểm tra trước xuất bản.')).toBeVisible();
  await expect(page.getByText('Trang phim trả về HTTP 200.')).toBeVisible();
  await page.getByRole('button', { name: 'Xuất bản toàn bộ SEO' }).click();
  await expect(page.getByText('Đã xuất bản và xác minh HTML Googlebot, canonical, robots, schema cùng nội dung SEO thành công.')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  expect(runtimeErrors).toEqual([]);
});
