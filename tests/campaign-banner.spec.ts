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

test('three compact banners per placement are the production default', async ({ page, isMobile }) => {
  await page.goto('/?intro=off');
  const top = page.getByTestId('campaign-top-banner');
  const catfish = page.getByTestId('campaign-catfish');
  await expect(top).toHaveAttribute('data-campaign-style', 'mb66');
  await expect(catfish).toHaveAttribute('data-campaign-style', 'mb66');

  const topPair = isMobile ? top.locator('.campaign-banner-mix__mobile img') : top.getByTestId('campaign-top-desktop-split').locator('img');
  const catfishPair = isMobile ? catfish.locator('.campaign-banner-mix__mobile img') : catfish.getByTestId('campaign-catfish-desktop-split').locator('img');
  await expect(topPair).toHaveCount(3);
  await expect(catfishPair).toHaveCount(3);

  const topBox = await top.boundingBox();
  const catfishBox = await catfish.boundingBox();
  expect(topBox).not.toBeNull();
  expect(catfishBox).not.toBeNull();
  if (isMobile) {
    expect(topBox?.height ?? 0).toBeLessThanOrEqual(118);
    expect(catfishBox?.height ?? 0).toBeLessThanOrEqual(118);

    const firstTopBanner = await topPair.nth(0).boundingBox();
    const secondTopBanner = await topPair.nth(1).boundingBox();
    const firstBottomBanner = await catfishPair.nth(0).boundingBox();
    const secondBottomBanner = await catfishPair.nth(1).boundingBox();
    const topShell = await top.locator('.campaign-banner-v2__shell').boundingBox();
    const topClose = await page.getByRole('button', { name: 'Đóng banner đầu trang' }).boundingBox();
    const bottomClose = await page.getByRole('button', { name: 'Đóng banner catfish' }).boundingBox();
    expect(firstTopBanner).not.toBeNull();
    expect(secondTopBanner?.y ?? 0).toBeGreaterThan((firstTopBanner?.y ?? 0) + 20);
    expect(firstBottomBanner).not.toBeNull();
    expect(secondBottomBanner?.y ?? 0).toBeGreaterThan((firstBottomBanner?.y ?? 0) + 20);
    expect(topShell).not.toBeNull();
    expect(Math.abs((topShell?.width ?? 0) - (catfishBox?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((topShell?.x ?? 0) - (catfishBox?.x ?? 0))).toBeLessThanOrEqual(1);
    expect((topClose?.y ?? 0) + ((topClose?.height ?? 0) / 2)).toBeGreaterThan((topBox?.y ?? 0) + ((topBox?.height ?? 0) / 2));
    expect((bottomClose?.y ?? 0) + (bottomClose?.height ?? 0)).toBeLessThanOrEqual(catfishBox?.y ?? 0);
  } else {
    const topMedia = await top.locator('.campaign-banner-v2__media').boundingBox();
    const catfishMedia = await catfish.locator('.campaign-banner-v2__media').boundingBox();
    expect(topMedia).not.toBeNull();
    expect(catfishMedia).not.toBeNull();
    expect(Math.abs((topMedia?.width ?? 0) - (catfishMedia?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((topMedia?.x ?? 0) - (catfishMedia?.x ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((topMedia?.height ?? 0) - (catfishMedia?.height ?? 0))).toBeLessThanOrEqual(1);
  }
});

test('closed banners stay dismissed while navigating and reloading in the same tab', async ({ page }) => {
  await page.goto('/');
  const skipIntro = page.getByRole('button', { name: 'Bỏ qua màn hình giới thiệu' });
  if (await skipIntro.isVisible()) await skipIntro.click();

  await page.getByRole('button', { name: 'Đóng banner đầu trang' }).click();
  await page.getByRole('button', { name: 'Đóng banner catfish' }).click();

  await expect(page.getByTestId('campaign-top-banner')).toHaveCount(0);
  await expect(page.getByTestId('campaign-catfish')).toHaveCount(0);
  await expect(page.getByText(/Hiện banner|Hiện quảng cáo/i)).toHaveCount(0);

  await page.goto('/phim-moi-cap-nhat?intro=off');
  await expect(page.getByTestId('campaign-top-banner')).toHaveCount(0);
  await expect(page.getByTestId('campaign-catfish')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('campaign-top-banner')).toHaveCount(0);
  await expect(page.getByTestId('campaign-catfish')).toHaveCount(0);

  await page.evaluate(() => {
    sessionStorage.removeItem('kp_campaign_top_banner_dismissed_v1');
    sessionStorage.removeItem('kp_campaign_catfish_banner_dismissed_v1');
  });
  await page.reload();
  await expect(page.getByTestId('campaign-top-banner')).toBeVisible();
  await expect(page.getByTestId('campaign-catfish')).toBeVisible();
});

test('catalog and watch pages keep all campaign placements', async ({ page }) => {
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
  await expect(page.getByTestId('campaign-catfish')).toBeVisible();
  await expect(page.getByTestId('campaign-top-banner')).toHaveAttribute('data-campaign-style', 'mb66');
  await expect(page.getByTestId('campaign-catfish')).toHaveAttribute('data-campaign-style', 'mb66');
  await expect(page.getByTestId('campaign-under-video-banner')).toBeVisible();
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

test('MB66 demo adds the supplied creative without removing the existing campaigns', async ({ page, isMobile }) => {
  await page.goto('/?banner-mb66=1&intro=off');

  const top = page.getByTestId('campaign-top-banner');
  const catfish = page.getByTestId('campaign-catfish');
  const topScope = isMobile ? top.locator('.campaign-banner-mix__mobile') : top.getByTestId('campaign-top-desktop-split');
  const catfishScope = isMobile ? catfish.locator('.campaign-banner-mix__mobile') : catfish.getByTestId('campaign-catfish-desktop-split');
  const topCreative = topScope.locator('[data-campaign-creative="mb66"]');
  const catfishCreative = catfishScope.locator('[data-campaign-creative="mb66"]');

  await expect(top).toHaveAttribute('data-campaign-style', 'mb66');
  await expect(catfish).toHaveAttribute('data-campaign-style', 'mb66');
  await expect(top).toHaveAttribute('data-campaign-name', 'mb66-additive');
  await expect(catfish).toHaveAttribute('data-campaign-name', 'mb66-additive');
  await expect(topScope.locator('img')).toHaveCount(3);
  await expect(catfishScope.locator('img')).toHaveCount(3);
  await expect(topScope.locator('[data-campaign-creative="9922"]')).toBeVisible();
  await expect(topScope.locator('[data-campaign-creative="f8bet"]')).toBeVisible();
  await expect(catfishScope.locator('[data-campaign-creative="9922"]')).toBeVisible();
  await expect(catfishScope.locator('[data-campaign-creative="shbet"]')).toBeVisible();
  await expect(topCreative).toHaveAttribute('href', 'https://bit.ly/qtqctong2c184');
  await expect(catfishCreative).toHaveAttribute('href', 'https://bit.ly/qtqctong2c184');
  await expect(topCreative.locator('img')).toHaveAttribute('src', '/campaign-demo-mb66/mb66-728x90.gif');
  await expect(catfishCreative.locator('img')).toHaveAttribute('src', '/campaign-demo-mb66/mb66-728x90.gif');

  const topMedia = await top.locator('.campaign-banner-v2__media').boundingBox();
  const catfishMedia = await catfish.locator('.campaign-banner-v2__media').boundingBox();
  const topFrame = isMobile ? await top.locator('.campaign-banner-v2__shell').boundingBox() : topMedia;
  const catfishFrame = isMobile ? await catfish.boundingBox() : catfishMedia;
  const catfishClose = await page.getByRole('button', { name: 'Đóng banner catfish' }).boundingBox();
  expect(topMedia).not.toBeNull();
  expect(catfishMedia).not.toBeNull();
  expect(topFrame).not.toBeNull();
  expect(catfishFrame).not.toBeNull();
  expect(catfishClose).not.toBeNull();
  expect(Math.abs((topFrame?.width ?? 0) - (catfishFrame?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((topMedia?.height ?? 0) - (catfishMedia?.height ?? 0))).toBeLessThanOrEqual(2);
  expect(topMedia?.width ?? 0).toBeLessThanOrEqual(isMobile ? 288 : 902);
  expect(topMedia?.height ?? 0).toBeLessThanOrEqual(isMobile ? 118 : 48);
  expect(catfishClose?.y ?? 0).toBeLessThan(catfishFrame?.y ?? 0);
});

test('MB66 demo adds a linked banner directly under the video player', async ({ page, isMobile }) => {
  await page.goto('/xem-phim/mot-bo-phim-minecraft/full?banner-mb66=1&intro=off');

  const player = page.locator('.movie-player-box').first();
  const underVideo = page.getByTestId('campaign-under-video-banner');
  const creative = underVideo.locator('[data-campaign-creative="mb66"]');

  await expect(player).toBeVisible();
  await expect(underVideo).toBeVisible();
  await expect(creative).toHaveAttribute('href', 'https://bit.ly/qtqctong2c184');
  await expect(creative.locator('img')).toHaveAttribute('src', '/campaign-demo-mb66/mb66-728x90.gif');

  const playerBox = await player.boundingBox();
  const bannerBox = await underVideo.boundingBox();
  expect(playerBox).not.toBeNull();
  expect(bannerBox).not.toBeNull();
  expect(bannerBox?.y ?? 0).toBeGreaterThanOrEqual((playerBox?.y ?? 0) + (playerBox?.height ?? 0));
  expect((bannerBox?.y ?? 0) - ((playerBox?.y ?? 0) + (playerBox?.height ?? 0))).toBeLessThanOrEqual(2);
  expect(bannerBox?.width ?? 0).toBeLessThanOrEqual(isMobile ? 328 : 736);
});

test('mixed layout shows both campaigns on desktop and mobile', async ({ page, isMobile }) => {
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
  await expect(page.getByRole('button', { name: 'Đóng banner đầu trang' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đóng banner catfish' })).toBeVisible();
});

test('compact watch demo keeps the player viewport clear', async ({ page, isMobile }) => {
  await page.goto('/xem-phim/vuon-sao-bang-ban-thai/tap-1?banner-compact=1&intro=off');

  await expect(page.getByTestId('campaign-top-banner')).toHaveCount(0);
  const catfish = page.getByTestId('campaign-catfish');
  await expect(catfish).toHaveAttribute('data-campaign-style', 'compact');
  await expect(catfish.locator('img')).toHaveCount(1);

  const box = await catfish.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height ?? 0).toBeLessThanOrEqual(isMobile ? 48 : 72);
});
