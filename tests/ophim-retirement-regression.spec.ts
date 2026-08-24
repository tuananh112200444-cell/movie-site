import { expect, test } from '@playwright/test';

test('Mưa Đỏ loads from Singapore without a retired OPhim playback URL', async ({ page }) => {
  const retiredPlaybackRequests: string[] = [];
  const detailRequests: string[] = [];
  const detailResponses: string[] = [];
  const playbackResponses: Array<{ status: number; url: string }> = [];
  page.on('request', (request) => {
    if (/ophim1\.com|opstream/i.test(request.url())) retiredPlaybackRequests.push(request.url());
    if (/movie-detail-proxy|\/rest\/v1\/(movies|episodes|streams|movie_episodes)|movieApi-/i.test(request.url())) {
      detailRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') {
      const contentType = response.headers()['content-type'] || '';
      if (!/javascript|wasm/i.test(contentType)) {
        const headers = response.headers();
        console.log(`[script-mime] ${response.status()} ${contentType} ${response.url()} cf-mitigated=${headers['cf-mitigated'] || ''} cf-ray=${headers['cf-ray'] || ''} cache=${headers['cf-cache-status'] || ''}`);
      }
    }
    if (response.url().includes('movie-detail-proxy')) {
      detailResponses.push(`${response.status()} ${response.url()}`);
    }
    if (/embed11\.streamc\.xyz|\.m3u8(?:\?|$)/i.test(response.url())) {
      playbackResponses.push({ status: response.status(), url: response.url() });
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('supabase.co') || request.url().includes('/api/')) {
      console.log(`[requestfailed] ${request.url()} ${request.failure()?.errorText || ''}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || /movieApi|fetchMovieDetail|Supabase/i.test(message.text())) {
      console.log(`[browser:${message.type()}] ${message.text()}`);
    }
  });

  const siteBase = process.env.KHOPHIM_E2E_BASE?.replace(/\/$/, '') || '';
  await page.goto(`${siteBase}/phim/mua-do`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('detail requests:', detailRequests);
  console.log('detail responses:', detailResponses);
  await expect(page.getByText('Mưa Đỏ', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.locator('a[href^="/xem-phim/mua-do"]').first().click();
  await expect(page.locator('.movie-player-frame').first()).toBeVisible({ timeout: 20_000 });

  const playbackUrls = await page.locator('.movie-player-frame iframe, .movie-player-frame video, .movie-player-frame source')
    .evaluateAll((nodes) => nodes.flatMap((node) => [
      node.getAttribute('src') || '',
      node.getAttribute('data-src') || '',
    ]).filter(Boolean));

  console.log('playback URLs:', playbackUrls);
  console.log('playback responses:', playbackResponses);
  expect(playbackUrls.length).toBeGreaterThan(0);
  await expect.poll(
    () => playbackResponses.some((response) => response.status >= 200 && response.status < 400),
    { timeout: 15_000 },
  ).toBe(true);
  expect(playbackUrls.join(' ')).not.toMatch(/ophim1\.com|opstream/i);
  expect(retiredPlaybackRequests).toEqual([]);
});
