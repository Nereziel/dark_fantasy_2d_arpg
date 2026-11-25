import { openCharacterCreation, enterWorld, continueGame, saveFromMenu } from './character-menu';
import { test, expect } from '@playwright/test';

test('world map and minimap conceal unvisited places, support localization and survive reload', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);

  const minimap = page.locator('[data-minimap="active"]');
  await expect(minimap).toBeVisible();
  await expect(minimap.locator('[data-map-marker="town.camp"]')).toHaveCount(1);
  await expect(minimap.locator('[data-marker-kind="optionalPoi"]')).toHaveCount(0);

  await page.keyboard.press('m');
  const dialog = page.getByRole('dialog', { name: 'World Map' });
  await expect(dialog).toBeVisible();
  const map = dialog.locator('[data-map-mode="world"]');
  await expect(map.locator('[data-fog="unexplored"]').first()).toBeVisible();
  await expect(map.locator('[data-map-marker="town.camp"]')).toHaveCount(1);
  await expect(map.locator('[data-marker-kind="optionalPoi"]')).toHaveCount(0);
  // Full-screen map is modal: close it before interacting with the header behind it.
  await dialog.getByTestId('map-close').click();
  await expect(dialog).toHaveCount(0);
  await page.locator('#game-language').selectOption('cs');
  await page.locator('.game-header').getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Mapa světa' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Mapa světa' })).toHaveCount(0);
  await saveFromMenu(page);
  await page.reload();
  await continueGame(page);
  await expect(page.locator('[data-minimap="active"]')).toBeVisible();
  await expect(page.locator('[data-map-marker="town.camp"]').first()).toBeVisible();
  await expect(page.locator('[data-marker-kind="optionalPoi"]')).toHaveCount(0);
});
