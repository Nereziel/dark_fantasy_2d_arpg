import { openCharacterCreation, enterWorld } from './character-menu';
import { test, expect } from '@playwright/test';

test('rebinding Ctrl+M changes map gameplay shortcut and HUD, persisting after reload', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const panel = page.getByRole('dialog', { name: 'Input bindings' });
  const map = panel.locator('.binding-row').filter({ hasText: 'Map' });
  await map.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('Control+m');
  await expect(map.locator('code')).toHaveText('Ctrl+M');
  await panel.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.minimap-caption')).toContainText('Ctrl+M');
  await page.keyboard.press('m');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  await page.keyboard.press('Control+m');
  await expect(page.getByTestId('world-map-dialog')).toBeVisible();
  await page.keyboard.press('Control+m');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(
    localStorage.getItem('aether-ruin-controls-v1') || '[]'
  ));
  expect(saved).toEqual(expect.arrayContaining([
    { action: 'MAP', device: 'keyboard', code: 'KeyM', modifiers: { ctrl: true } }
  ]));

  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await expect(page.locator('.minimap-caption')).toContainText('Ctrl+M');
  await page.keyboard.press('Control+m');
  await expect(page.getByTestId('world-map-dialog')).toBeVisible();
});

test('Shift+1 potion overrides regular skill 1 while Shift still holds position', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.locator('[data-potion-id="resistance"]').click();
  await expect(page.getByTestId('use-potion')).toContainText('1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const panel = page.getByRole('dialog', { name: 'Input bindings' });
  const potion = panel.locator('.binding-row').filter({ hasText: 'Potion' });
  await potion.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('Shift+1');
  await expect(potion.locator('code')).toHaveText('Shift+1');
  await panel.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.potion-key')).toHaveText('Shift+1');

  const game = page.locator('.game-screen');
  await page.keyboard.down('Shift');
  await expect(game).toHaveAttribute('data-hold-position', 'true');
  await page.keyboard.press('1');
  await expect(page.getByTestId('use-potion')).toContainText('0');
  await expect(game).toHaveAttribute('data-hold-position', 'true');
  await page.keyboard.up('Shift');
  await expect(game).toHaveAttribute('data-hold-position', 'false');
});

test('standalone modifier captured on keyup, not prematurely on keydown', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const panel = page.getByRole('dialog', { name: 'Input bindings' });
  const potion = panel.locator('.binding-row').filter({ hasText: 'Potion' });
  await potion.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.down('Control');
  await expect(panel.locator('.capture-hint')).toBeVisible();
  await page.keyboard.up('Control');
  await expect(potion.locator('code')).toHaveText('ControlLeft');
  await expect(panel.locator('.capture-hint')).toHaveCount(0);
});

test('Ctrl+M HOLD_POSITION releases when Ctrl is lifted before M', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const panel = page.getByRole('dialog', { name: 'Input bindings' });
  const hold = panel.locator('.binding-row').filter({ hasText: 'Hold position' });
  await hold.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('Control+m');
  await expect(hold.locator('code')).toHaveText('Ctrl+M');
  await panel.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  const game = page.locator('.game-screen');
  await page.keyboard.down('Control');
  await page.keyboard.down('m');
  await expect(game).toHaveAttribute('data-hold-position', 'true');
  await page.keyboard.up('Control');
  await expect(game).toHaveAttribute('data-hold-position', 'false');
  await page.keyboard.up('m');
  await expect(game).toHaveAttribute('data-hold-position', 'false');
});
