import { expect, test } from '@playwright/test';

test('admin login gate reaches the configured production auth service', async ({ page }) => {
  const statusResponse = page.waitForResponse((response) =>
    response.url().endsWith('/functions/v1/admin-auth')
      && response.request().method() === 'POST',
  );

  await page.goto('/admin/overview', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Khu vực Quản trị' })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  const response = await statusResponse;
  expect(response.status()).toBe(200);
  await expect(page.getByText('Lỗi kết nối khi kiểm tra trạng thái admin.')).toHaveCount(0);
  await expect(page.getByText('Admin authentication is not configured.')).toHaveCount(0);
});
