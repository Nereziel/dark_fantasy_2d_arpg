import { openCharacterCreation, enterWorld } from './character-menu';
// Issue #102: a mouse-bound potion must affect authoritative gameplay.
import { test, expect } from '@playwright/test';

test('mouse-bound potion is usable and mapping persists after reload', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  await expect(canvas).toBeVisible();
  await page.locator('[data-potion-id="resistance"]').click();
  await expect(page.getByTestId('use-potion')).toContainText('1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const panel = page.getByRole('dialog', { name: 'Input bindings' });
  const secondary = panel.locator('.binding-row').filter({ hasText: 'Secondary skill' });
  await secondary.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('y');
  await expect(secondary.locator('code')).toHaveText('KeyY');
  const potion = panel.locator('.binding-row').filter({ hasText: 'Potion' });
  await potion.getByRole('button', { name: 'Change' }).click();
  await page.mouse.click(180, 180, { button: 'right' });
  await expect(potion.locator('code')).toHaveText('Mouse 2');
  await panel.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.potion-key')).toHaveText('RMB');
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.click(rect!.x + rect!.width / 2 - 80,
    rect!.y + rect!.height / 2 + 75, { button: 'right' });
  await expect(page.getByTestId('use-potion')).toContainText('0');
  await expect(page.getByTestId('use-potion')).toBeDisabled();
  const overrides = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('aether-ruin-controls-v1') || '[]')
  );
  expect(overrides).toEqual(expect.arrayContaining([
    { action: 'POTION', device: 'mouse', button: 2 },
    { action: 'SECONDARY', device: 'keyboard', code: 'KeyY' }
  ]));
  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await expect(page.locator('.potion-key')).toHaveText('RMB');
  await expect(page.locator('.skill-shortcut').first()).toHaveText('Y');
});
