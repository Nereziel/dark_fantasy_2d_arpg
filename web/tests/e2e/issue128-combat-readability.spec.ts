// Issue #128: reduced motion and readable combat overlays must not affect controls.
// GPL-3.0-only.
import { test, expect } from '@playwright/test';

test('reduced-motion mobile combat keeps authoritative abilities and canvas responsive', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('./');
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
