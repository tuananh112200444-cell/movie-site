import { expect, test } from '@playwright/test';

const promotedSlug = 'tham-tu-lung-danh-conan-vu-an-tien-gia-ultra-30';
const retiredSlug = 'tham-tu-lung-danh-conan-vu-an-mang-so-30';
const promotedTitle = 'Thám Tử Lừng Danh Conan: Vụ Án Tiền Giả Ultra 30';

test('preferred Conan Ultra 30 version has a complete information page', async ({ page, isMobile }) => {
  await page.goto(`/phim/${promotedSlug}?intro=off`);

  await expect(page.getByRole('heading', { name: promotedTitle, exact: true }).first()).toBeVisible();
  await expect(page.getByText('Detective Conan: The Counterfeit Case of Ultra 30', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('2026', { exact: true }).first()).toBeVisible();

  if (isMobile) {
    await page.getByRole('button', { name: 'Mở rộng thông tin phim' }).click();
  }
  await expect(page.getByText('Nhật Bản', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  const poster = page.locator('.movie-detail-poster-column img').first();
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
});

test('old Conan URLs redirect visitors to the preferred version', async ({ page }) => {
  await page.goto(`/phim/${retiredSlug}?intro=off`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/phim/${promotedSlug}`));

  await page.goto(`/xem-phim/${retiredSlug}/full?intro=off`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/xem-phim/${promotedSlug}/full`));
});

test('preferred Conan version leads the homepage hero, cinema shelf and cinema catalogue', async ({ page, request }) => {
  const fallbackResponse = await request.get('/home-fallback.json');
  expect(fallbackResponse.ok()).toBeTruthy();
  const fallback = await fallbackResponse.json();
  expect(fallback.sections['phim-chieu-rap'][0].slug).toBe(promotedSlug);

  const homeApiResponse = await request.get('/api/home?sections=phim-chieu-rap');
  expect(homeApiResponse.ok()).toBeTruthy();
  const homeApi = await homeApiResponse.json();
  expect(homeApi.sections['phim-chieu-rap'][0].slug).toBe(promotedSlug);

  await page.goto('/?intro=off');
  await expect(page.locator('.editorial-hero h2')).toHaveText(promotedTitle);
  await expect(page.locator(`[data-editorial-section="01"] a[href^="/phim/${promotedSlug}"]`).first()).toBeVisible();

  await page.goto('/phim-chieu-rap?intro=off');
  await expect(page.locator(`a[href^="/phim/${promotedSlug}"]`).first()).toBeVisible();
});

test('preferred VSMOV source loads the full movie and supports seeking', async ({ page }) => {
  await page.goto(`/xem-phim/${promotedSlug}/full?intro=off`);
  const player = page.locator('[data-kp-player="hls"]');
  await expect(player).toBeVisible();

  const video = player.locator('video');
  await expect.poll(() => video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    return media.readyState > 0 && Number.isFinite(media.duration) && media.duration > 5_000;
  }), { timeout: 30_000 }).toBe(true);

  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    media.pause();
    media.currentTime = 60;
  });
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), {
    timeout: 15_000,
  }).toBeGreaterThan(55);
});
