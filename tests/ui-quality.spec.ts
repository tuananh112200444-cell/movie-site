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

test('banner top is temporarily disabled', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const banner = page.getByTestId('sticky-top-banner');
  await expect(banner).toHaveCount(0);
});

test('trang chủ mobile: icon nội bộ và section thức dậy sau khi quay lại tab', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Chỉ áp dụng cho điện thoại');
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const discovery = page.locator('.home-discovery-band');
  await expect(discovery).toBeVisible();
  await expect(discovery.getByText('Vũ Trụ Đam Mỹ', { exact: true })).toBeVisible();
  await expect(discovery.locator('button svg')).toHaveCount(4);

  // The editorial shelf replaced the legacy "Phim Lẻ Hay" heading.
  const shelfTitle = page.getByRole('heading', { level: 3, name: 'Phim Điện Ảnh Mới Coóng' });
  await shelfTitle.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('kp:page-resumed')));
  await expect(shelfTitle).toBeVisible({ timeout: 10_000 });
  await expect(shelfTitle.locator('xpath=ancestor::section[1]').locator('svg').first()).toBeVisible();
});

test('mobile icons are self-hosted and survive a blocked icon CDN', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'mobile only');
  await page.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const menuButton = page.locator('button[aria-controls="mobile-navigation-drawer"]');
  await expect(menuButton).toBeVisible();
  const menuIcon = menuButton.locator('i.ri-menu-3-line');
  await expect(menuIcon).toBeVisible();

  await expect.poll(() => page.evaluate(async () => {
    await document.fonts.load('22px remixicon');
    return document.fonts.check('22px remixicon');
  })).toBe(true);

  const iconAudit = await menuIcon.evaluate((icon) => {
    const rect = icon.getBoundingClientRect();
    const before = getComputedStyle(icon, '::before');
    return {
      width: rect.width,
      height: rect.height,
      content: before.content,
      fontFamily: before.fontFamily,
    };
  });
  expect(iconAudit.width).toBeGreaterThan(0);
  expect(iconAudit.height).toBeGreaterThan(0);
  expect(iconAudit.content).not.toBe('none');
  expect(iconAudit.fontFamily.toLowerCase()).toContain('remixicon');
  expect(await page.locator('link[href*="cdnjs.cloudflare.com"]').count()).toBe(0);
});

test('release coordinator updates a safe stale tab once without a reload loop', async ({ page }) => {
  let documentLoads = 0;
  page.on('request', request => {
    if (request.resourceType() === 'document') documentLoads += 1;
  });
  await page.route('**/release.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ release_id: 'e2e-new-release', generated_at: new Date().toISOString() }),
  }));
  await page.addInitScript(() => {
    window.addEventListener('kp:before-release-reload', () => {
      sessionStorage.setItem('e2e_release_flush_seen', '1');
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('kp:page-resumed')));
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('kp_release_reload_target_v1'))).toBe('e2e-new-release');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('e2e_release_flush_seen'))).toBe('1');
  await expect.poll(() => documentLoads).toBeGreaterThanOrEqual(2);

  const loadsAfterUpdate = documentLoads;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('kp:page-resumed')));
  await page.waitForTimeout(1800);
  expect(documentLoads).toBe(loadsAfterUpdate);
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

async function mockSourceHealth(page: Page, badHosts: string[]) {
  await page.route('**/functions/v1/player-source-health**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      bad_hosts: badHosts.map(host => ({ host, critical: 3, score: 10, failure_rate: 1 })),
      cluster_outages: [],
    }),
  }));
}

test('player brain bypasses a known-bad host before mounting the first source', async ({ page }) => {
  await mockSourceHealth(page, ['bad-source.example']);
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'Primary', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://bad-source.example/embed/player' }] },
    { server_name: 'Backup', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://healthy-source.example/embed/player' }] },
  ]));

  await page.goto('/xem-phim/e2e-player/tap-1', { waitUntil: 'domcontentloaded' });
  const iframe = page.locator('iframe[title="Phim kiểm thử trình phát"]');
  await expect(iframe).toHaveAttribute('src', /healthy-source\.example/, { timeout: 20_000 });
});

test('late source-health refresh never replaces an iframe already committed to the viewer', async ({ page }) => {
  await mockSourceHealth(page, []);
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'Primary', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://stable-viewer.example/embed/player' }] },
    { server_name: 'Backup', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://backup-viewer.example/embed/player' }] },
  ]));

  await page.goto('/xem-phim/e2e-player/tap-1', { waitUntil: 'domcontentloaded' });
  const iframe = page.locator('iframe[title="Phim kiểm thử trình phát"]');
  await expect(iframe).toHaveAttribute('src', /stable-viewer\.example/, { timeout: 20_000 });
  await iframe.evaluate((element) => { (element as HTMLIFrameElement & { __kpIdentity?: string }).__kpIdentity = 'preserved'; });
  await page.waitForTimeout(8_200);
  await page.evaluate(() => {
    localStorage.setItem('khophim.bad-source-hosts.v2', JSON.stringify({ 'stable-viewer.example': Date.now() }));
    window.dispatchEvent(new CustomEvent('kp:source-health-updated'));
  });
  await page.waitForTimeout(1_200);

  await expect(iframe).toHaveAttribute('src', /stable-viewer\.example/);
  expect(await iframe.evaluate((element) => (element as HTMLIFrameElement & { __kpIdentity?: string }).__kpIdentity)).toBe('preserved');
});

test('release coordinator never interrupts an iframe player automatically', async ({ page }) => {
  await page.route('**/release.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ release_id: 'e2e-player-release', generated_at: new Date().toISOString() }),
  }));
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'Embed', server_data: [{ name: 'Tap 1', slug: 'tap-1', link_embed: 'https://example.com/embed/player' }] },
  ]));
  await page.goto('/xem-phim/e2e-player/tap-1', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('iframe').count(), { timeout: 20_000 }).toBeGreaterThan(0);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('kp:page-resumed')));
  await expect(page.getByTestId('release-update-notice')).toBeVisible();
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => sessionStorage.getItem('kp_release_reload_target_v1'))).toBeNull();
  await expect(page).toHaveURL(/\/xem-phim\/e2e-player\/tap-1/);
});

test('release coordinator never interrupts a paused or buffering direct player', async ({ page }) => {
  let documentLoads = 0;
  page.on('request', request => {
    if (request.resourceType() === 'document') documentLoads += 1;
  });
  await page.route('**/release.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ release_id: 'e2e-direct-player-release', generated_at: new Date().toISOString() }),
  }));
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'Direct', server_data: [{ name: 'Tap 1', slug: 'tap-1', link_embed: 'https://media.example.test/buffering.mp4' }] },
  ]));
  await page.goto('/xem-phim/e2e-player/tap-1', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('video').count(), { timeout: 20_000 }).toBeGreaterThan(0);
  const loadsBeforeUpdateCheck = documentLoads;

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('kp:page-resumed')));
  await expect(page.getByTestId('release-update-notice')).toBeVisible();
  await page.waitForTimeout(2200);

  expect(documentLoads).toBe(loadsBeforeUpdateCheck);
  expect(await page.evaluate(() => sessionStorage.getItem('kp_release_reload_target_v1'))).toBeNull();
  await expect(page).toHaveURL(/\/xem-phim\/e2e-player\/tap-1/);
});

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
  const video = page.locator('video').first();
  await expect(video).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    Object.defineProperty(media, 'duration', { configurable: true, value: 500 });
    media.dispatchEvent(new Event('loadedmetadata'));
  });
  await expect.poll(() => video.evaluate((element) => Math.round((element as HTMLVideoElement).currentTime))).toBe(125);
});

test('player: đổi nguồn giữa phim giữ nguyên thời gian đang xem', async ({ page }) => {
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'Nguồn A', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://media.example.test/a.mp4' }] },
    { server_name: 'Nguồn B', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://media.example.test/b.mp4' }] },
  ]));
  await page.goto('/xem-phim/e2e-player/tap-1', { waitUntil: 'domcontentloaded' });
  const firstVideo = page.locator('video').first();
  await expect(firstVideo).toBeVisible({ timeout: 20_000 });
  await firstVideo.evaluate((element) => {
    const media = element as HTMLVideoElement;
    Object.defineProperty(media, 'duration', { configurable: true, value: 500 });
    media.currentTime = 180;
    media.dispatchEvent(new Event('timeupdate'));
  });
  await expect.poll(() => page.evaluate(() => {
    const resume = JSON.parse(localStorage.getItem('kp_resume_v1') || '{}');
    return Math.round(resume['e2e-player__tap-1']?.time || 0);
  })).toBe(180);

  await page.getByRole('button', { name: 'Đổi nguồn', exact: false }).click();
  const backupButton = page.getByRole('button', { name: 'Dự phòng 2, 1 tập', exact: true });
  await expect(backupButton).toBeVisible();
  await backupButton.click();
  await expect(page.locator('video').first()).toHaveAttribute('src', /media\.example\.test\/b\.mp4/);
  await page.waitForTimeout(100);
  const switchedVideo = page.locator('video').first();
  await expect(switchedVideo).toHaveAttribute('data-resume-at', '180');
  await switchedVideo.evaluate((element) => {
    const media = element as HTMLVideoElement;
    Object.defineProperty(media, 'duration', { configurable: true, value: 500 });
    media.dispatchEvent(new Event('loadedmetadata'));
  });
  await expect.poll(() => switchedVideo.evaluate((element) => Math.round((element as HTMLVideoElement).currentTime))).toBe(180);
});

test('xem tiếp mobile: giữ đúng trang khi fullscreen, phát và lưu tiến độ', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Chỉ áp dụng cho điện thoại');
  await page.addInitScript(() => {
    localStorage.setItem('kp_watch_history', JSON.stringify([{
      _id: 'e2e-player-movie', slug: 'e2e-player', name: 'Phim kiểm thử trình phát',
      origin_name: 'Player E2E', thumb_url: '/brand/khophim-logo-v2-512.png',
      poster_url: '/brand/khophim-logo-v2-512.png', year: 2026, quality: 'HD', lang: 'Vietsub',
      episode_current: 'Tập 1', lastEpSlug: 'tap-1', lastEpName: 'Tập 1', watchedAt: Date.now(),
      watchedTime: 125, watchedDuration: 500,
    }]));
    localStorage.setItem('kp_resume_v1', JSON.stringify({
      'e2e-player__tap-1': { time: 125, duration: 500, savedAt: Date.now() },
    }));
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: async function () {
        (window as Window & { __kpFullscreenRequested?: boolean }).__kpFullscreenRequested = true;
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this });
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
  });
  await mockMovieDetail(page, e2eMovie([
    { server_name: 'KhoPhim', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_embed: 'https://media.example.test/good.mp4' }] },
  ]));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const continueLink = page.locator('.continue-watching-panel a[href="/xem-phim/e2e-player/tap-1"]');
  await expect(continueLink).toBeVisible();
  await continueLink.click();
  await expect(page).toHaveURL(/\/xem-phim\/e2e-player\/tap-1$/);
  const video = page.locator('video').first();
  await expect(video).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-kp-fullscreen="true"]').first().click();
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __kpFullscreenRequested?: boolean }).__kpFullscreenRequested))).toBe(true);
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    Object.defineProperty(media, 'duration', { configurable: true, value: 500 });
    media.currentTime = 180;
    media.dispatchEvent(new Event('timeupdate'));
    void media.play().catch(() => {});
  });

  await expect(page).toHaveURL(/\/xem-phim\/e2e-player\/tap-1$/);
  await expect.poll(() => page.evaluate(() => {
    const history = JSON.parse(localStorage.getItem('kp_watch_history') || '[]');
    const resume = JSON.parse(localStorage.getItem('kp_resume_v1') || '{}');
    return { historyTime: history[0]?.watchedTime, resumeTime: resume['e2e-player__tap-1']?.time };
  })).toEqual({ historyTime: 180, resumeTime: 180 });
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
