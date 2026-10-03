import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('account and device sync demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('kp_favorites', JSON.stringify([
        { _id: 'demo-favorite', slug: 'phim-demo', name: 'Phim demo' },
      ]));
      localStorage.setItem('kp_watch_history', JSON.stringify([
        { _id: 'demo-history', slug: 'tap-demo', name: 'Tập demo', watchedAt: Date.now() },
      ]));
      localStorage.setItem('khophim_comments_phim-demo', JSON.stringify([
        { id: 'demo-comment', name: 'Khách demo', text: 'Bình luận demo', rating: 5, createdAt: new Date().toISOString() },
      ]));
    });
    await page.goto('/tai-khoan');
    await page.getByRole('heading', { name: 'Xem tiếp trên mọi thiết bị' }).waitFor();
    for (const label of ['Đóng banner đầu trang', 'Đóng banner catfish']) {
      const button = page.getByRole('button', { name: label });
      if (await button.isVisible().catch(() => false)) await button.click();
    }
  });

  test('shows local data and switches to registration', async ({ page }, testInfo) => {
    await expect(page.getByText('Dữ liệu đang có trên thiết bị')).toBeVisible();
    await expect(page.getByText('Yêu thích').locator('..').getByText('1')).toBeVisible();
    await expect(page.getByText('Lịch sử').locator('..').getByText('1')).toBeVisible();
    await expect(page.getByText('Bình luận').locator('..').getByText('1')).toBeVisible();

    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByPlaceholder('Tên của bạn')).toBeVisible();
    await expect(page.locator('form').getByRole('button', { name: /Tạo tài khoản/ })).toBeVisible();

    const suffix = testInfo.project.name.startsWith('mobile') ? 'mobile' : 'desktop';
    await page.screenshot({
      path: path.join(process.cwd(), `account-sync-demo-${suffix}.png`),
      fullPage: true,
    });

    await page.goto('/');
    const supportSection = page.locator('.support-banner-demo');
    await expect(supportSection).toBeVisible();
    await supportSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2200);
    await supportSection.screenshot({
      path: path.join(process.cwd(), `support-account-buttons-demo-${suffix}.png`),
    });
    await expect(supportSection.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveAttribute('href', '/tai-khoan');
    const registerLink = supportSection.getByRole('link', { name: 'Đăng ký', exact: true });
    await expect(registerLink).toHaveAttribute('href', '/tai-khoan?mode=signup');
    await registerLink.click();
    await expect(page).toHaveURL(/\/tai-khoan\?mode=signup$/);
    await expect(page.getByPlaceholder('Tên của bạn')).toBeVisible();
  });
});
