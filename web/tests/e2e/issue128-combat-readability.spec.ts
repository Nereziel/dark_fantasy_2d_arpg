// Issue #128: reduced motion and readable combat overlays must not affect controls.
// GPL-3.0-only.
import { test, expect } from '@playwright/test';

test('reduced-motion mobile combat keeps authoritative abilities and canvas responsive', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('.phaser-container canvas');
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const warCry = page.getByRole('button', { name: 'War Cry' });
  await expect(warCry).toBeEnabled();
  await warCry.click();
  await expect(warCry).toBeDisabled();
  await expect(page.locator('.game-screen')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
  await expect(canvas).toBeVisible();
});

test('combat alerts and class actions remain within the 320–430px mobile canvas layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('.phaser-container canvas');
  const dock = page.getByTestId('combat-dock');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(canvas).toBeVisible();
    await expect(dock).toBeVisible();
    const bounds = await Promise.all([canvas.boundingBox(), dock.boundingBox()]);
    expect(bounds[0]).not.toBeNull();
    expect(bounds[1]).not.toBeNull();
    for (const box of bounds) {
      if (!box) continue;
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    await expect(dock.getByRole('button', { name: 'War Cry' })).toBeVisible();
  }
});
