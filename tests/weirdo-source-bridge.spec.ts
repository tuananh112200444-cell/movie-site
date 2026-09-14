import { expect, test } from '@playwright/test';

test('Weirdo public detail merges the verified BLVietsub sibling episodes', async ({ page }) => {
  await page.goto('/phim/glvietsub-weirdo-101-the-series?intro=off');

  await expect(page.getByRole('heading', { name: 'Weirdo 101 The Series', exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('link', { name: 'Tập 3', exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('link', { name: 'Tập 4', exact: true })).toBeVisible();
  await expect(page.getByText(/4 tập\s*·\s*mở trong chế độ xem tập trung/i)).toBeVisible();
});
