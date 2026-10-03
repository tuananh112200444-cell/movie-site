import { expect, test } from '@playwright/test';

test('search opens canonical High Kick season 1 and starts playback', async ({ page }) => {
  await page.goto('/search?q=gia%20%C4%91%C3%ACnh%20l%C3%A0%20s%E1%BB%91%201%20ph%E1%BA%A7n%201&intro=off');
  const result = page.locator('a[href^="/phim/gia-dinh-la-so-1-phan-1"]').first();
  await expect(result).toBeVisible({ timeout: 20_000 });
  await result.click();
  await expect(page.getByRole('heading', { name: /Gia Đình Là Số (?:1|Một).*(?:Phần 1)/i }).first()).toBeVisible({ timeout: 20_000 });
  const watch = page.getByRole('button', { name: /Xem Ngay|Xem$/ }).first();
  await expect(watch).toBeEnabled();
  await watch.click();
  await expect(page).toHaveURL(/\/xem-phim\/gia-dinh-la-so-1-phan-1(?:\/|$)/);
  const player = page.locator('[data-kp-player="hls"]');
  await expect(player).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => player.locator('video').evaluate((element) => {
    const video = element as HTMLVideoElement;
    return video.readyState > 0 && Number.isFinite(video.duration) && video.duration > 60;
  }), { timeout: 30_000 }).toBe(true);
});

test('legacy VSMOV High Kick slug redirects to canonical detail', async ({ page }) => {
  await page.goto('/phim/gia-dinh-la-so-mot-phan-1?intro=off', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/phim\/gia-dinh-la-so-1-phan-1/);
  await expect(page.getByRole('heading', { name: /Gia Đình Là Số (?:1|Một).*(?:Phần 1)/i }).first()).toBeVisible({ timeout: 20_000 });
});
