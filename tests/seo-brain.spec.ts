import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('kp_admin_token', 'e2e-admin-token');
    sessionStorage.setItem('kp_admin_token_exp', String(Math.floor(Date.now() / 1000) + 3600));
  });
  await page.route('**/functions/v1/gsc-seo-feedback', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latest_run: { started_at: '2026-09-05T01:00:00Z', success: true, pages_collected: 123, queries_collected: 1494, urls_inspected: 25, indexed_urls: 1 },
        inspections: [], top_pages: [], top_queries: [], query_visibility: [],
        latest_brain_run: { id: 3, started_at: '2026-09-05T03:40:00Z', status: 'success', candidate_count: 303, queued_count: 303 },
        static_release_requests: [],
        daily_work_items: [{
          id: 1,
          movie_id: '08aedd5f-459e-497b-9069-8a5379ec8018',
          slug: 'spider-man-brand-new-day-2026',
          movie_name: 'Người Nhện: Khởi Đầu Mới',
          task_type: 'repair_editorial_trust',
          status: 'pending',
          priority_score: 99,
          urgency: 'critical',
          reason: 'Nội dung đang có điểm số hoặc nhận xét cảm tính chưa đủ căn cứ.',
          required_fields: ['review_content', 'faq'],
          evidence: { quality_score: 100 },
          last_seen_at: '2026-09-05T03:40:00Z',
        }],
      }),
    });
  });
});

test('Bộ não SEO hiển thị đúng 5 việc ưu tiên và dẫn vào đúng bước SEO Studio', async ({ page }) => {
  await page.goto('/admin/seo', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('5 việc quan trọng nhất hôm nay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Người Nhện: Khởi Đầu Mới' })).toBeVisible();
  const action = page.getByRole('link', { name: /Xóa nhận xét chưa có căn cứ/ });
  await expect(action).toHaveAttribute('href', '/admin/seo-studio?movie=spider-man-brand-new-day-2026&task=repair_editorial_trust');
  await expect(page.getByText('Bài đánh giá', { exact: true })).toBeVisible();
  await expect(page.getByText('FAQ', { exact: true })).toBeVisible();
});
