import { test, expect } from '@playwright/test';

test('world event UI keeps undiscovered optional events hidden, including on the map', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button',{name:'Enter the world'}).click();
  await expect(page.locator('.game-screen')).toBeVisible();
  await expect(page.locator('[data-world-events]')).toHaveCount(0);

  await page.locator('.game-header').getByRole('button',{name:'Map',exact:true}).click();
  const map=page.getByRole('dialog',{name:'World Map'});
  await expect(map).toBeVisible();
  await expect(map.locator('[data-map-marker^="wild.event."]')).toHaveCount(0);
  await map.getByRole('button',{name:'Close Map'}).click();
  await expect(page.locator('[data-world-events]')).toHaveCount(0);
});
