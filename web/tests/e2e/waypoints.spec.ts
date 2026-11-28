import { openCharacterCreation, enterWorld, continueGame, saveFromMenu, returnToMenu } from './character-menu';
import { test, expect } from '@playwright/test';

test('town waypoint activates only on arrival, survives live resume and resets on new launch', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);

  await page.locator('.game-header').getByRole('button', { name: 'Map', exact: true }).click();
  const initialMap = page.getByRole('dialog', { name: 'World Map' });
  await expect(initialMap.getByText('No activated waypoints yet.')).toBeVisible();
  await expect(initialMap.locator('[data-map-marker="shrine.soul-shrine"]')).toHaveCount(0);
  await initialMap.getByRole('button', { name: 'Close Map' }).click();

  await page.getByRole('button', { name: 'Open waypoint' }).click();
  const waypoint = page.getByRole('dialog', { name: 'Camp Waypoint' });
  await expect(waypoint).toBeVisible();
  await expect(waypoint.locator('[data-waypoint-destination="town.waypoint"]')).toHaveCount(1);
  await expect(waypoint.locator('[data-waypoint-destination="town.waypoint"]')).toBeDisabled();
  await expect(waypoint.locator('[data-waypoint-destination="shrine.soul-shrine"]')).toHaveCount(0);
  await waypoint.getByRole('button', { name: 'Leave' }).click();

  await page.locator('.game-header').getByRole('button', { name: 'Map', exact: true }).click();
  const map = page.getByRole('dialog', { name: 'World Map' });
  await expect(map.locator('[data-map-marker="town.waypoint"]')).toHaveAttribute('data-marker-kind', 'waypoint');
  await expect(map.locator('[data-map-marker="shrine.soul-shrine"]')).toHaveCount(0);
  await map.getByRole('button', { name: 'Close Map' }).click();

  await saveFromMenu(page);
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await returnToMenu(page);
  await continueGame(page);
  await page.locator('.game-header').getByRole('button', { name: 'Map', exact: true }).click();
  const restoredMap = page.getByRole('dialog', { name: 'World Map' });
  await expect(restoredMap.locator('[data-map-marker="town.waypoint"]')).toHaveCount(1);
  await expect(restoredMap.locator('[data-waypoint-destination="town.waypoint"]')).toContainText('Camp Waypoint');
  await expect(restoredMap.locator('[data-map-marker="shrine.soul-shrine"]')).toHaveCount(0);
  await restoredMap.getByRole('button',{name:'Close Map'}).click();
  await page.reload();
  await continueGame(page);
  await page.locator('.game-header').getByRole('button',{name:'Map',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'World Map'}).getByText('No activated waypoints yet.')).toBeVisible();
});
