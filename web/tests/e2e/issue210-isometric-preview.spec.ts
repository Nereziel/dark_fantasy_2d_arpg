// GPL-3.0-only
import { test, expect } from '@playwright/test';

test('isometric preview boots, accepts a pointer and keeps the map controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({ position: { x: bounds!.width * 0.65, y: bounds!.height * 0.42 } });
  await page.keyboard.press('m');
  await expect(page.getByTestId('world-map-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('normal game entry still uses the existing renderer', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.locator('canvas[data-renderer="isometric-preview"]')).toHaveCount(0);
});
