import { expect, test } from '@playwright/test';
import path from 'node:path';

async function closeAds(page: import('@playwright/test').Page) {
  for (const label of ['Đóng banner đầu trang', 'Đóng banner catfish']) {
    const button = page.getByRole('button', { name: label });
    if (await button.isVisible().catch(() => false)) await button.click();
  }
}

test.describe('follow, community request and personal schedule', () => {
  test('renders a personal schedule with recent update', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem('kp_followed_movies', JSON.stringify([{
        _id: 'demo-follow', slug: 'phim-dang-theo-doi', name: 'Phim Đang Theo Dõi', origin_name: 'Followed Movie',
        thumb_url: '', poster_url: '', year: 2026, episode_current: 'Tập 6', episode_total: '12',
        current_episode: 6, total_episodes: 12, schedule_type: 'custom', next_episode_at: tomorrow,
        next_episode_name: 'Tập 7', followedAt: Date.now() - 1000, checkedAt: Date.now(),
      }]));
      localStorage.setItem('kp_episode_notifications', JSON.stringify([{
        id: 'phim-dang-theo-doi:tap-6', movieSlug: 'phim-dang-theo-doi', movieName: 'Phim Đang Theo Dõi',
        episode: 'Tập 6', previousEpisode: 'Tập 5', createdAt: Date.now(), read: false,
      }]));
    });
    await page.goto('/lich-cua-toi');
    await closeAds(page);
    await expect(page.getByRole('heading', { name: 'Phim sắp ra tập mới' })).toBeVisible();
    await expect(page.getByText('Phim Đang Theo Dõi').first()).toBeVisible();
    await expect(page.getByText('Dự kiến tập 7')).toBeVisible();
    await expect(page.getByText('Đã cập nhật Tập 6')).toBeVisible();
    const suffix = testInfo.project.name.startsWith('mobile') ? 'mobile' : 'desktop';
    await page.screenshot({ path: path.join(process.cwd(), `personal-release-schedule-demo-${suffix}.png`), fullPage: true });
  });

  test('guest submits a movie request and sees confirmation', async ({ page }, testInfo) => {
    await page.route('**/functions/v1/submit-movie-request', async (route) => {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, request: { id: 'demo-request' } }) });
    });
    await page.goto('/yeu-cau-phim');
    await closeAds(page);
    await expect(page.getByRole('heading', { name: 'Gửi yêu cầu cho KhoPhim' })).toBeVisible();
    await page.getByRole('tab', { name: /Thiếu tập/ }).click();
    await page.getByPlaceholder('Tên tiếng Việt hoặc tên gốc').fill('Phim demo thiếu tập');
    await page.getByPlaceholder('https://khophim.org/phim/...').fill('https://khophim.org/phim/phim-demo');
    await page.getByPlaceholder('Ví dụ: thiếu tập 8, tập 6 không phát được...').fill('Thiếu tập 8');
    await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expect(page.getByText(/Đã gửi yêu cầu\. Bạn không cần gửi lại/)).toBeVisible();
    const suffix = testInfo.project.name.startsWith('mobile') ? 'mobile' : 'desktop';
    await page.screenshot({ path: path.join(process.cwd(), `movie-request-demo-${suffix}.png`), fullPage: true });
  });

  test('makes movie following prominent and prefills issue reports', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.removeItem('kp_followed_movies');
      localStorage.removeItem('kp_episode_notifications');
    });
    await page.goto('/phim/tham-tu-lung-danh-conan-vu-an-tien-gia-ultra-30?intro=off');
    await closeAds(page);
    const followButton = page.getByRole('button', { name: /Theo dõi phim/i });
    await expect(followButton).toBeVisible();
    await followButton.click();
    await expect(page.getByRole('button', { name: /Đang theo dõi/ })).toBeVisible();
    await expect(page.getByText('Bạn đang theo dõi phim này')).toBeVisible();

    const suffix = testInfo.project.name.startsWith('mobile') ? 'mobile' : 'desktop';
    await page.screenshot({ path: path.join(process.cwd(), `movie-follow-demo-${suffix}.png`), fullPage: false });

    await page.getByRole('link', { name: 'Báo thiếu tập hoặc nguồn phát' }).click();
    await expect(page).toHaveURL(/\/yeu-cau-phim\?type=missing_episode/);
    await expect(page.getByPlaceholder('Tên tiếng Việt hoặc tên gốc')).toHaveValue('Thám Tử Lừng Danh Conan: Vụ Án Tiền Giả Ultra 30');
    await expect(page.getByPlaceholder('https://khophim.org/phim/...')).toHaveValue(/khophim\.org\/phim\/tham-tu-lung-danh-conan/);

    await page.screenshot({ path: path.join(process.cwd(), `follow-and-request-demo-${suffix}.png`), fullPage: true });
  });
});
