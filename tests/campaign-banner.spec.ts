import { expect, test } from '@playwright/test';

test('banner top stays attached below the navigation while scrolling', async ({ page }) => {
  await page.goto('/');

  const skipIntro = page.getByRole('button', { name: 'Bỏ qua màn hình giới thiệu' });
  if (await skipIntro.isVisible()) {
    await skipIntro.click();
  }

  const header = page.locator('.kp-main-header');
  const banner = page.getByTestId('campaign-top-banner');

  await expect(header).toBeVisible();
  await expect(banner).toBeVisible();

  const before = await banner.boundingBox();
  expect(before).not.toBeNull();

  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  const after = await banner.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(await header.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
});

test('closed banners disappear completely and return after a page reload', async ({ page }) => {
  await page.goto('/');
  const skipIntro = page.getByRole('button', { name: 'Bỏ qua màn hình giới thiệu' });
  if (await skipIntro.isVisible()) await skipIntro.click();

  await page.getByRole('button', { name: 'Đóng banner đầu trang' }).click();
  await page.getByRole('button', { name: 'Đóng banner catfish' }).click();

  await expect(page.getByTestId('campaign-top-banner')).toHaveCount(0);
  await expect(page.getByTestId('campaign-catfish')).toHaveCount(0);
  await expect(page.getByText(/Hiện banner|Hiện quảng cáo/i)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('campaign-top-banner')).toBeVisible();
  await expect(page.getByTestId('campaign-catfish')).toBeVisible();
});
