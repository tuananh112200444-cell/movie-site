import { expect, test, type Browser, type BrowserContextOptions } from '@playwright/test';

const TARGET = process.env.DEVICE_TEST_BASE_URL || 'http://127.0.0.1:4173';

const PROFILES: Array<{
  name: string;
  viewport: { width: number; height: number };
  options?: BrowserContextOptions;
}> = [
  { name: 'android-small', viewport: { width: 360, height: 800 }, options: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: 'android-large', viewport: { width: 412, height: 915 }, options: { isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 } },
  { name: 'iphone', viewport: { width: 390, height: 844 }, options: { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, options: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: 'desktop', viewport: { width: 1366, height: 768 }, options: { isMobile: false, hasTouch: false, deviceScaleFactor: 1 } },
  { name: 'android-landscape', viewport: { width: 844, height: 390 }, options: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
];

const ROUTES = ['/', '/phim-bo', '/search?q=Amadeus', '/phim/em-den-cung-mua'];

async function openProfile(browser: Browser, profile: typeof PROFILES[number]) {
  return browser.newContext({
    viewport: profile.viewport,
    locale: 'vi-VN',
    userAgent: profile.options?.isMobile
      ? 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/150 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
    ...profile.options,
  });
}

test('critical pages fit and remain usable across representative devices', async ({ browser }) => {
  test.setTimeout(180_000);
  const results: Array<Record<string, unknown>> = [];

  for (const profile of PROFILES) {
    const context = await openProfile(browser, profile);
    const page = await context.newPage();
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));

    for (const route of ROUTES) {
      const response = await page.goto(new URL(route, TARGET).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(route === '/' ? 2_500 : 1_000);

      const audit = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight;
        const visible = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const brokenImages = [...document.images]
          .filter((image) => visible(image) && image.complete && image.naturalWidth === 0)
          .map((image) => image.currentSrc || image.src)
          .slice(0, 5);
        const controls = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea')].filter(visible);
        const undersizedPrimaryControls = controls
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '';
            return /menu|tìm|search|đóng|close|fullscreen|toàn màn hình/i.test(label) && (rect.width < 40 || rect.height < 40);
          })
          .map((element) => ({
            label: element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim(),
            rect: element.getBoundingClientRect().toJSON(),
          }));
        const smallFormFonts = [...document.querySelectorAll<HTMLElement>('input, select, textarea')]
          .filter(visible)
          .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 16)
          .length;
        const main = document.querySelector('main')?.getBoundingClientRect();
        return {
          viewportWidth,
          viewportHeight,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > viewportWidth + 1,
          mainOutsideViewport: Boolean(main && (main.left < -1 || main.right > viewportWidth + 1)),
          brokenImages,
          undersizedPrimaryControls,
          smallFormFonts,
        };
      });

      results.push({ profile: profile.name, route, status: response?.status(), ...audit });
      expect(response?.status(), `${profile.name} ${route}`).toBeLessThan(400);
      expect(audit.horizontalOverflow, `${profile.name} ${route}`).toBe(false);
      expect(audit.mainOutsideViewport, `${profile.name} ${route}`).toBe(false);
      expect(audit.brokenImages, `${profile.name} ${route}`).toEqual([]);
      expect(audit.undersizedPrimaryControls, `${profile.name} ${route}`).toEqual([]);
      if (profile.options?.isMobile) {
        expect(audit.smallFormFonts, `${profile.name} ${route}`).toBe(0);
      }
    }

    expect(runtimeErrors, profile.name).toEqual([]);
    await context.close();
  }

  console.log(JSON.stringify(results, null, 2));
});
