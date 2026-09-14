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

test('mixed 9922 and SHBET layout is the production default', async ({ page }) => {
  await page.goto('/?intro=off');
  await expect(page.getByTestId('campaign-top-banner')).toHaveAttribute('data-campaign-style', 'mix');
  await expect(page.getByTestId('campaign-catfish')).toHaveAttribute('data-campaign-style', 'mix');
});

test('closed banners disappear completely and return after a page reload', async ({ page, isMobile }) => {
  await page.goto('/');
  const skipIntro = page.getByRole('button', { name: 'Bỏ qua màn hình giới thiệu' });
  if (await skipIntro.isVisible()) await skipIntro.click();

  if (isMobile) {
    await page.getByRole('button', { name: 'Thu gọn banner đầu trang' }).click();
    await page.getByRole('button', { name: 'Thu gọn banner catfish' }).click();
  }

  await page.getByRole('button', { name: 'Đóng banner đầu trang' }).click();
  await page.getByRole('button', { name: 'Đóng banner catfish' }).click();

  await expect(page.getByTestId('campaign-top-banner')).toHaveCount(0);
  await expect(page.getByTestId('campaign-catfish')).toHaveCount(0);
  await expect(page.getByText(/Hiện banner|Hiện quảng cáo/i)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('campaign-top-banner')).toBeVisible();
  await expect(page.getByTestId('campaign-catfish')).toBeVisible();
});

test('top and catfish banners remain available when navigating away from the homepage', async ({ page }) => {
  await page.goto('/about?intro=off');
  await expect(page.getByTestId('campaign-top-banner')).toBeVisible();
  await expect(page.getByTestId('campaign-catfish')).toBeVisible();

  await page.goto('/phim-moi-cap-nhat?intro=off');
  await expect(page.getByTestId('campaign-top-banner')).toBeVisible();
  await expect(page.getByTestId('campaign-catfish')).toBeVisible();
  await expect(page.getByTestId('campaign-top-banner')).toHaveCount(1);
  await expect(page.getByTestId('campaign-catfish')).toHaveCount(1);

  await page.goto('/phim/vuon-sao-bang-ban-thai?intro=off');
  await expect(page.getByTestId('campaign-top-banner')).toBeVisible();

  await page.goto('/xem-phim/vuon-sao-bang-ban-thai/tap-1?intro=off');
  await expect(page.getByTestId('campaign-top-banner')).toBeVisible();
  await expect(page.getByTestId('campaign-top-banner')).toHaveCount(1);
});

test('alternate campaign demo uses the supplied 728 banner for top and catfish', async ({ page }) => {
  await page.goto('/?banner-v2=1&intro=off');

  const top = page.getByTestId('campaign-top-banner');
  const catfish = page.getByTestId('campaign-catfish');
  await expect(top).toHaveAttribute('data-campaign-style', 'v2');
  await expect(catfish).toHaveAttribute('data-campaign-style', 'v2');
  await expect(top.locator('img')).toHaveAttribute('src', '/campaign-demo-2/728x90.gif');
  await expect(catfish.locator('img')).toHaveAttribute('src', '/campaign-demo-2/728x90.gif');
});

test('SHBET demo chooses wide top and standard catfish assets', async ({ page }) => {
  await page.goto('/?banner-v3=1&intro=off');

  const top = page.getByTestId('campaign-top-banner');
  const catfish = page.getByTestId('campaign-catfish');
  await expect(top).toHaveAttribute('data-campaign-style', 'v3');
  await expect(catfish).toHaveAttribute('data-campaign-style', 'v3');
  await expect(top.locator('img')).toHaveAttribute('src', '/campaign-demo-shbet/top-desktop-1090x66.gif');
  await expect(catfish.locator('img')).toHaveAttribute('src', '/campaign-demo-shbet/catfish-desktop-728x90.gif');
  await expect(top.locator('source')).toHaveAttribute('srcset', '/campaign-demo-shbet/mobile-300x80.gif');
  await expect(catfish.locator('source')).toHaveAttribute('srcset', '/campaign-demo-shbet/mobile-300x80.gif');
});

test('mixed demo splits both campaigns on desktop and swaps them on mobile', async ({ page, isMobile }) => {
  await page.goto('/?banner-mix=1&intro=off');

  const top = page.getByTestId('campaign-top-banner');
  const catfish = page.getByTestId('campaign-catfish');
  await expect(top).toHaveAttribute('data-campaign-style', 'mix');
  await expect(catfish).toHaveAttribute('data-campaign-style', 'mix');

  if (!isMobile) {
    const topSplit = page.getByTestId('campaign-top-desktop-split');
    const catfishSplit = page.getByTestId('campaign-catfish-desktop-split');
    await expect(topSplit.locator('img')).toHaveCount(2);
    await expect(catfishSplit.locator('img')).toHaveCount(2);
    await expect(topSplit.locator('img').nth(0)).toHaveAttribute('src', '/banner-demo/assets/728x90.gif');
    await expect(topSplit.locator('img').nth(1)).toHaveAttribute('src', '/campaign-demo-f8bet/top-728x90.gif');
    await expect(topSplit.locator('[data-campaign-creative="f8bet"]')).toHaveAttribute('href', 'https://bit.ly/4cCE7SB');
    await expect(catfishSplit.locator('img').nth(0)).toHaveAttribute('src', '/banner-demo/assets/728x90.gif');
    await expect(catfishSplit.locator('img').nth(1)).toHaveAttribute('src', '/campaign-demo-shbet/catfish-desktop-728x90.gif');
    await expect(catfishSplit.locator('[data-campaign-creative="shbet"]')).toHaveAttribute('href', 'https://bit.ly/SH2PP21');
    return;
  }

  await expect(top).toHaveAttribute('data-mobile-state', 'expanded');
  await expect(catfish).toHaveAttribute('data-mobile-state', 'expanded');
  await expect(top.locator('.campaign-banner-mix__mobile img')).toHaveCount(2);
  await expect(catfish.locator('.campaign-banner-mix__mobile img')).toHaveCount(2);
  await expect(top.locator('.campaign-banner-mix__mobile [data-campaign-creative="f8bet"]')).toHaveAttribute('href', 'https://bit.ly/4cCE7SB');
  await expect(catfish.locator('.campaign-banner-mix__mobile [data-campaign-creative="shbet"]')).toHaveAttribute('href', 'https://bit.ly/SH2PP21');
  await expect(page.getByRole('button', { name: 'Thu gọn banner đầu trang' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thu gọn banner catfish' })).toBeVisible();

  await page.getByRole('button', { name: 'Thu gọn banner đầu trang' }).click();
  await page.getByRole('button', { name: 'Thu gọn banner catfish' }).click();
  await expect(top).toHaveAttribute('data-mobile-state', 'collapsed');
  await expect(catfish).toHaveAttribute('data-mobile-state', 'collapsed');
  await expect(top.locator('.campaign-banner-mix__mobile img')).toHaveCount(1);
  await expect(catfish.locator('.campaign-banner-mix__mobile img')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Đóng banner đầu trang' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đóng banner catfish' })).toBeVisible();

  await expect(top).toHaveAttribute('data-campaign-name', '9922');
  await expect(catfish).toHaveAttribute('data-campaign-name', 'shbet');

  await expect(top).toHaveAttribute('data-campaign-name', 'f8bet', { timeout: 7000 });
  await expect(catfish).toHaveAttribute('data-campaign-name', '9922');
});
