import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  { name: 'trang chủ', path: '/' },
  { name: 'phim mới', path: '/phim-moi-nhat' },
  { name: 'tìm kiếm', path: '/search?q=Toy%20Story%205' },
  { name: 'thể loại', path: '/the-loai/hanh-dong' },
  { name: 'chi tiết', path: '/xem/minions-and-quai-vat?ep=full&server=0' },
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
  await input.fill('Toy Story 5');
  await page.getByRole('button', { name: 'Tìm kiếm phim', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=Toy(?:%20|\+)Story(?:%20|\+)5/);
  await expect(page.locator('main a[href^="/phim/cau-chuyen-do-choi-5"]').first()).toBeVisible({ timeout: 20_000 });
});

test('player: URL xem phim tải được nguồn phát', async ({ page }) => {
  await page.goto('/xem/minions-and-quai-vat?ep=full&server=0', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/phim\/minions-and-quai-vat/);
  await expect(page.getByRole('heading', { level: 1, name: 'Minions & Quái Vật' })).toBeVisible();
  await expect.poll(async () => page.locator('iframe, video').count(), { timeout: 20_000 }).toBeGreaterThan(0);
});
