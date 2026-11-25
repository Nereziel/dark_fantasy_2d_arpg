import { openCharacterCreation } from './character-menu';
// Issue #128: boss/elite roster stays reachable on small screens without
// masking the bottom dock, minimap close control or inventory overlay.
// GPL-3.0-only.
import { test, expect } from '@playwright/test';

test('mobile enemy HUD stays ahead of minimap and clear of combat dock', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();

  const right = page.locator('.hud-right-column');
  const roster = right.locator('.enemy-roster');
  const minimap = right.locator('.minimap-overlay');
  const dock = page.getByTestId('combat-dock');
  await expect(roster).toBeVisible();
  await expect(minimap).toBeVisible();
  await expect(roster.locator('button[data-threat]')).not.toHaveCount(0);

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(roster).toBeVisible();
    await expect(minimap).toBeVisible();
    const [r, map, d, column] = await Promise.all([
      roster.boundingBox(), minimap.boundingBox(), dock.boundingBox(),
      right.boundingBox()
    ]);
    expect(r && map && d && column).toBeTruthy();
    if (!r || !map || !d || !column) continue;
    expect(r.x).toBeGreaterThanOrEqual(-1);
    expect(r.x + r.width).toBeLessThanOrEqual(width + 1);
    expect(r.y).toBeGreaterThanOrEqual(column.y - 1);
    expect(r.y + r.height).toBeLessThanOrEqual(map.y + 1);
    expect(r.y + r.height).toBeLessThanOrEqual(d.y + 1);
    expect(column.y + column.height).toBeLessThanOrEqual(d.y + 1);
    const constrained = await roster.evaluate(node => ({
      overflow: getComputedStyle(node).overflowY,
      innerWidth: node.clientWidth,
      outerWidth: node.scrollWidth
    }));
    expect(constrained.overflow).toMatch(/auto|scroll/);
    // A translated long modifier must wrap rather than widen the entire HUD.
    expect(constrained.outerWidth).toBeLessThanOrEqual(constrained.innerWidth + 1);
  }

  await dock.getByRole('button', { name: 'Inventory (I)' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  await expect(inventory).toBeVisible();
  await expect(inventory.getByRole('button', { name: 'Close' })).toBeVisible();
  await inventory.getByRole('button', { name: 'Close' }).click();
  await expect(inventory).toHaveCount(0);
  await expect(roster).toBeVisible();
});
