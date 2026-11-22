// Issue #102: MAP and TALENTS are user-configurable actions, not hardcoded
// KeyM/KeyT shortcuts. Also ensures old bindings stop triggering after rebind.
import { expect, test } from '@playwright/test';

test('rebound map and talent hotkeys work to open/close and survive reload', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.phaser-container canvas')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const controls = page.getByRole('dialog', { name: 'Input bindings' });
  await expect(controls).toBeVisible();

  const mapRow = controls.locator('.binding-row').filter({ hasText: 'Map' });
  await expect(mapRow).toHaveCount(1);
  await mapRow.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('o');
  await expect(mapRow.locator('code')).toHaveText('KeyO');

  const talentsRow = controls.locator('.binding-row').filter({ hasText: 'Talents' });
  await expect(talentsRow).toHaveCount(1);
  await talentsRow.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('p');
  await expect(talentsRow.locator('code')).toHaveText('KeyP');

  await controls.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-shield')).toHaveCount(0);
  await page.keyboard.press('m');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  await page.keyboard.press('o');
  await expect(page.getByTestId('world-map-dialog')).toBeVisible();
  await page.keyboard.press('o');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);

  await page.keyboard.press('t');
  await expect(page.locator('.talent-dialog')).toHaveCount(0);
  await page.keyboard.press('p');
  await expect(page.locator('.talent-dialog')).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.locator('.talent-dialog')).toHaveCount(0);

  // Both bindings are stored separately from the character/world save.
  const overrides = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('aether-ruin-controls-v1') || '[]')
  );
  expect(overrides).toEqual(expect.arrayContaining([
    { action: 'MAP', device: 'keyboard', code: 'KeyO' },
    { action: 'TALENTS', device: 'keyboard', code: 'KeyP' }
  ]));

  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.keyboard.press('o');
  await expect(page.getByTestId('world-map-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  await page.keyboard.press('p');
  await expect(page.locator('.talent-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.talent-dialog')).toHaveCount(0);
});
