import { test, expect } from '@playwright/test';
import { enterWorld } from './character-menu';
import { campMovementTarget, heroPoint } from './iso-input';

// Cheap real-browser gate: menu, game boot, renderer and input. Longer
// character/save/combat scenarios remain in the explicit full suite.
test('CI smoke: create a hero and move in the isometric world', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByTestId('new-character').click();
  await page.getByTestId('character-name').fill('CI Smoke');
  await page.locator('[data-class-id="WARRIOR"]').click();
  await enterWorld(page);
  await expect(page.locator('.game-screen')).toBeVisible();
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  await expect(canvas).toBeVisible();
  const spawn = await heroPoint(page);
  const target = await campMovementTarget(page, canvas);
  await page.mouse.click(target.x, target.y);
  await expect.poll(async () => {
    const p = await heroPoint(page);
    return Math.hypot(p.x - spawn.x, p.y - spawn.y);
  }, { timeout: 8000 }).toBeGreaterThan(20);
});
