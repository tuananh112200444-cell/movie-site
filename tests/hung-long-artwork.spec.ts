import { expect, test } from '@playwright/test';

const seasons = [
  ['hung-long-phong-ba-phan-1', 'd9047c849f5fb53fe278a581636a9afb'],
  ['hung-long-phong-ba-phan-2', '502aa1fb2315eaaaa9717919d48691b7'],
  ['hung-long-phong-ba-phan-3', 'b2340132485416417145a5cc206de3f4'],
  ['hung-long-phong-ba-phan-4', '8bd4eba1068788972aceeae2fa924c28'],
] as const;

for (const [slug, imageId] of seasons) {
  test(`${slug} renders its repaired portrait artwork`, async ({ page }) => {
    await page.goto(`/phim/${slug}?artwork-fix=20261001`, { waitUntil: 'domcontentloaded' });

    const poster = page.locator('.movie-detail-poster-column img').first();
    await expect(poster).toBeVisible();
    await expect.poll(() => poster.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);

    const rendered = await poster.evaluate((image) => ({
      src: (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src,
      width: (image as HTMLImageElement).naturalWidth,
      height: (image as HTMLImageElement).naturalHeight,
    }));

    expect(rendered.src).toContain(imageId);
    expect(rendered.src).not.toContain('movie-poster-fallback.svg');
    expect(rendered.height).toBeGreaterThan(rendered.width);
  });
}
