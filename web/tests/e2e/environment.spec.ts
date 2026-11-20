import { test, expect } from '@playwright/test';

test('environment objects preserve the original camp, map and fog of war', async ({page})=>{
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button',{name:'Enter the world'}).click();
  await expect(page.locator('.game-screen')).toBeVisible();
  // The hidden wall is never visible before the in-world lever is activated.
  await expect(page.locator('[data-environment-object="env.hiddenWall"]')).toHaveCount(0);
  await page.locator('.game-header').getByRole('button',{name:'Map',exact:true}).click();
  const map=page.getByRole('dialog',{name:'World Map'});
  await expect(map).toBeVisible();
  await expect(map.locator('[data-map-marker="env.hiddenWall"]')).toHaveCount(0);
  await map.getByRole('button',{name:'Close Map'}).click();
  await expect(page.locator('.game-screen')).toBeVisible();
});
