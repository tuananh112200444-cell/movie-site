import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  { name: 'trang chủ', path: '/' },
  { name: 'phim mới', path: '/phim-moi-nhat' },
  { name: 'tìm kiếm', path: '/search?q=Toy%20Story%205' },
  { name: 'thể loại', path: '/the-loai/hanh-dong' },
  { name: 'chi tiết', path: '/phim/minions-and-quai-vat' },
] as const;

async function expectHealthyPage(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  await expect.poll(() => page.locator('h1').count()).toBeGreaterThan(0);

  const audit = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    missingImageAlt: [...document.images].filter((image) => !image.hasAttribute('alt')).length,
    unnamedButtons: [...document.querySelectorAll('button')].filter((button) =>
      !(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent?.trim())
    ).map((button) => button.outerHTML.slice(0, 240)),
    unnamedLinks: [...document.querySelectorAll('a')].filter((link) =>
      !(link.getAttribute('aria-label') || link.getAttribute('title') || link.textContent?.trim())
    ).map((link) => link.outerHTML.slice(0, 240)),
  }));

  expect(audit.horizontalOverflow).toBe(false);
  expect(audit.missingImageAlt).toBe(0);
  expect(audit.unnamedButtons).toEqual([]);
  expect(audit.unnamedLinks).toEqual([]);
}

for (const route of ROUTES) {
  test(`${route.name}: responsive và accessibility cơ bản`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await expectHealthyPage(page);
    expect(runtimeErrors).toEqual([]);
  });
}

test('tìm kiếm: nhập từ khóa và mở đúng kết quả', async ({ page }) => {
  await page.goto('/search', { waitUntil: 'domcontentloaded' });
  const input = page.getByRole('textbox', { name: 'Tìm tên phim, tên gốc, diễn viên...' });
  await input.fill('Khemjira');
  await page.getByRole('button', { name: 'Tìm kiếm phim', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=Khemjira/);
  await expect(page.locator('main a[href^="/phim/khemjira-phai-song-sot"]').first()).toBeVisible({ timeout: 20_000 });
});

test('player: URL xem phim tải được nguồn phát', async ({ page }) => {
  await page.goto('/xem/minions-and-quai-vat?ep=full&server=0', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/xem-phim\/minions-and-quai-vat\/full/);
  await expect(page.getByRole('heading', { level: 1, name: 'Minions & Quái Vật' })).toBeVisible();
  await expect.poll(async () => page.locator('iframe, video').count(), { timeout: 20_000 }).toBeGreaterThan(0);
});

const e2eMovie = (episodes: Array<{ server_name: string; server_data: Array<Record<string, unknown>> }>) => ({
  status: true,
  movie: {
    id: 'e2e-player-movie', slug: 'e2e-player', name: 'Phim kiểm thử trình phát',
    origin_name: 'Player E2E', content: 'Dữ liệu cô lập dành cho kiểm thử.',
    thumb_url: '/brand/khophim-logo-v2-512.png', poster_url: '/brand/khophim-logo-v2-512.png',
    episode_current: 'Tập 1', episode_total: '1 Tập', quality: 'HD', lang: 'Vietsub', year: 2026,
    category: [{ name: 'Kiểm thử', slug: 'kiem-thu' }], country: [], actor: [], director: [],
  },
  episodes,
});

async function mockMovieDetail(page: Page, payload: ReturnType<typeof e2eMovie>) {
  await page.route('**/api/movie-detail**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(payload),
  }));
}

test('player: nguồn trang bị chặn tự chuyển sang nguồn phát được', async ({ page }) => {
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'BLVietsub lỗi', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://blvietsub.com/xem-phim/e2e/tap-1' }] },
    { server_name: 'KhoPhim dự phòng', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://media.example.test/good.mp4' }] },
  ]));
  await page.goto('/xem-phim/e2e-player/tap-1', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('video').count(), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.locator('video').first()).toHaveAttribute('src', /media\.example\.test\/good\.mp4/);
});

test('player: khôi phục tiến độ xem sau khi mở lại trang', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kp_resume_v1', JSON.stringify({
    'e2e-player__tap-1': { time: 125, duration: 500, savedAt: Date.now() },
  })));
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'KhoPhim', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://media.example.test/good.mp4' }] },
  ]));
  await page.goto('/xem-phim/e2e-player/tap-1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Tiếp tục xem dở')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('2:05', { exact: false })).toBeVisible();
});

test('player mobile: fullscreen gọi API và khóa xoay ngang', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Chỉ áp dụng cho điện thoại');
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: async function () {
        (window as Window & { __kpFullscreenRequested?: boolean }).__kpFullscreenRequested = true;
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this });
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
    const orientation = { lock: async (mode: string) => {
      (window as Window & { __kpOrientationLock?: string }).__kpOrientationLock = mode;
    } };
    try { Object.defineProperty(screen, 'orientation', { configurable: true, value: orientation }); } catch { /* noop */ }
  });
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'Embed', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://player.example.test/embed/e2e' }] },
  ]));
  await page.goto('/xem-phim/e2e-player/tap-1', { waitUntil: 'domcontentloaded' });
  const fullscreen = page.locator('[data-kp-fullscreen="true"]').first();
  await expect(fullscreen).toBeVisible({ timeout: 20_000 });
  await fullscreen.click();
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __kpFullscreenRequested?: boolean }).__kpFullscreenRequested))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as Window & { __kpOrientationLock?: string }).__kpOrientationLock)).toBe('landscape');
});
