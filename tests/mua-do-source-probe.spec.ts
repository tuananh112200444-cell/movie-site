import { expect, test } from '@playwright/test';

test('Mưa Đỏ KKPhim HLS source responds', async ({ page }) => {
  const response = await page.goto(
    'https://s6.kkphimplayer6.com/20251118/obSmOjv7/index.m3u8',
    { waitUntil: 'commit', timeout: 20_000 },
  );
  console.log('KKPhim Mưa Đỏ HLS status:', response?.status() ?? null);
  expect(response?.status()).toBe(200);
});
