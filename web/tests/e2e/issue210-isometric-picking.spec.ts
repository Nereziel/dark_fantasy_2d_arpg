import { openCharacterCreation, enterWorld } from './character-menu';
// GPL-3.0-only — actual isometric canvas picking, no debug commands or injected loot.
import { test, expect } from '@playwright/test';
import { WARDEN_POSITION } from '../../src/game/world/npcs';
import { CRYPT_GATE, CRYPT_EXIT } from '../../src/game/world/generator';
import { isoGroundPoint } from './iso-input';

test('canvas NPC picking opens the Warden dialogue', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  const point = await isoGroundPoint(canvas, WARDEN_POSITION);
  // Hit the upright body rather than a DOM interaction button.
  await page.mouse.move(point.x, point.y - 16);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(point.x, point.y - 16);
  await expect(page.getByRole('dialog', { name: 'Warden Vesna' })).toBeVisible({ timeout: 10000 });
});

test('canvas portal picking enters the crypt and returns to camp', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  const game = page.locator('.game-screen');
  const seed = await game.getAttribute('data-world-seed');
  // Approach via an exposed waypoint before selecting the portal, since
  // the side HUD may cover the entrance from the original camp spawn.
  const approach = await isoGroundPoint(canvas, { x: 545, y: 430 });
  await page.mouse.click(approach.x, approach.y, { button: 'middle' });
  await expect.poll(async () => Number(await game.getAttribute('data-player-x')), { timeout: 8000 }).toBeGreaterThan(520);
  const entrance = await isoGroundPoint(canvas, CRYPT_GATE);
  await page.mouse.move(entrance.x, entrance.y);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(entrance.x, entrance.y);
  await expect(game).toHaveAttribute('data-zone', 'crypt', { timeout: 20000 });
  await expect(page.getByText('Crypt guardians')).toBeVisible();
  // Wait for the zone-specific ground rebuild rather than clicking the old camera.
  await expect(canvas).toHaveAttribute('data-render-zone', 'crypt');
  const exit = await isoGroundPoint(canvas, CRYPT_EXIT);
  await page.mouse.move(exit.x, exit.y);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(exit.x, exit.y);
  await expect(game).toHaveAttribute('data-zone', 'wilderness', { timeout: 20000 });
  await expect(game).toHaveAttribute('data-world-seed', seed!);
  await expect(canvas).toHaveAttribute('data-render-zone', 'wilderness');
  await expect(canvas).toHaveAttribute('data-ground-chunks', '24');
});

test('canvas loot picking collects a naturally defeated enemy drop', async ({ page }) => {
  test.setTimeout(85000);
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: /Paladin/ }).click();
  await enterWorld(page);
  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  const dialogue = page.getByRole('dialog', { name: 'Warden Vesna' });
  await dialogue.getByRole('button', { name: 'Accept quest' }).click();
  await dialogue.getByRole('button', { name: 'Leave' }).click();
  await page.locator('.enemy-roster button:not([disabled]):not(.bossTarget)').first().click();
  const loot = page.getByTestId('nearby-loot');
  await expect(loot).toBeVisible({ timeout: 55000 });
  const first = loot.locator('[data-loot-id]').first();
  const id = await first.getAttribute('data-loot-id');
  expect(id).toBeTruthy();
  const drop = loot.locator('[data-loot-id="' + id + '"]');
  const itemId = await drop.getAttribute('data-loot-item-id');
  expect(itemId).toBeTruthy();
  const world = await drop.evaluate(node => ({
    x: Number(node.getAttribute('data-loot-x')), y: Number(node.getAttribute('data-loot-y'))
  }));
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  const point = await isoGroundPoint(canvas, world);
  await page.mouse.move(point.x, point.y);
  await expect(canvas).toHaveCSS('cursor', 'grab');
  await page.mouse.click(point.x, point.y);
  await expect(drop).toHaveCount(0, { timeout: 12000 });
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(page.getByRole('dialog', { name: 'Inventory & Equipment' }).locator('.bag-slot.occupied[data-item-id="' + itemId + '"]')).toBeVisible();
});
