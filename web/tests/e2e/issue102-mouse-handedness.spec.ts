import { openCharacterCreation, enterWorld } from './character-menu';
// Issue #102: LMB/RMB handedness must survive reloading the v1 override set.
import { test, expect } from '@playwright/test';
import { isoGroundPoint } from './iso-input';

test('primary and secondary mouse bindings swap atomically and persist across reload', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.skill-shortcut').first()).toHaveText('RMB');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const panel = page.getByRole('dialog', { name: 'Input bindings' });
  const primary = panel.locator('.binding-row').filter({ hasText: 'Primary / interact' });
  const secondary = panel.locator('.binding-row').filter({ hasText: 'Secondary skill' });
  await expect(primary.locator('code')).toHaveText('Mouse 0');
  await expect(secondary.locator('code')).toHaveText('Mouse 2');

  const swap = panel.getByTestId('swap-primary-secondary');
  await swap.click();
  await expect(primary.locator('code')).toHaveText('Mouse 2');
  await expect(secondary.locator('code')).toHaveText('Mouse 0');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('aether-ruin-controls-v1') || '[]')
  );
  expect(saved).toEqual(expect.arrayContaining([
    { action: 'PRIMARY', device: 'mouse', button: 2 },
    { action: 'SECONDARY', device: 'mouse', button: 0 }
  ]));
  await panel.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.skill-shortcut').first()).toHaveText('LMB');
  await expect(page.locator('.minimap-overlay button')).toContainText('M');

  // A right click now follows the PRIMARY ground-move route, not the cast route.
  const start = await page.locator('.game-screen').evaluate(node => ({
    x: Number(node.getAttribute('data-player-x')),
    y: Number(node.getAttribute('data-player-y'))
  }));
  const point = await isoGroundPoint(canvas, { x: start.x + 70, y: start.y });
  await page.mouse.click(point.x, point.y, { button: 'right' });
  // Playwright executes locator.evaluate in the browser: pass the origin as an
  // explicit argument rather than capturing the test runner's local variable.
  await expect.poll(async () => page.locator('.game-screen').evaluate((node, origin) =>
    Math.hypot(Number(node.getAttribute('data-player-x')) - origin.x,
      Number(node.getAttribute('data-player-y')) - origin.y), start
  ), { timeout: 10000 }).toBeGreaterThan(3);

  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await expect(page.locator('.skill-shortcut').first()).toHaveText('LMB');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const reopened = page.getByRole('dialog', { name: 'Input bindings' });
  await expect(reopened.locator('.binding-row').filter({ hasText: 'Primary / interact' }).locator('code'))
    .toHaveText('Mouse 2');
  await expect(reopened.locator('.binding-row').filter({ hasText: 'Secondary skill' }).locator('code'))
    .toHaveText('Mouse 0');
  await reopened.getByTestId('swap-primary-secondary').click();
  await expect(reopened.locator('.binding-row').filter({ hasText: 'Primary / interact' }).locator('code'))
    .toHaveText('Mouse 0');
  await reopened.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.skill-shortcut').first()).toHaveText('RMB');
});
