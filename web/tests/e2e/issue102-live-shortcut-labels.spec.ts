// Issue #102: visual keyboard shortcuts must follow the same bindings as gameplay.
import { expect, test } from '@playwright/test';

test('combat and quick-action hints update on rebind and after page reload', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.phaser-container canvas')).toBeVisible();

  await expect(page.locator('.potion-key')).toHaveText('Q');
  await expect(page.locator('[data-quick-action="inventory"] .quick-key')).toHaveText('I');
  await expect(page.locator('[data-quick-action="talents"] .quick-key')).toHaveText('T');
  await expect(page.locator('.skill-shortcut')).toContainText(['RMB', '1', '2', '3', '4', '5', '6']);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const controls = page.getByRole('dialog', { name: 'Input bindings' });
  const remap = async (label: string, key: string, code: string) => {
    const row = controls.locator('.binding-row').filter({ hasText: label });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Change' }).click();
    await page.keyboard.press(key);
    await expect(row.locator('code')).toHaveText(code);
  };
  await remap('Skill 2', 'z', 'KeyZ');
  await remap('Potion', 'v', 'KeyV');
  await remap('Inventory', 'o', 'KeyO');
  await remap('Talents', 'p', 'KeyP');
  await controls.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');

  await expect(page.locator('.potion-key')).toHaveText('V');
  await expect(page.locator('[data-quick-action="inventory"] .quick-key')).toHaveText('O');
  await expect(page.locator('[data-quick-action="talents"] .quick-key')).toHaveText('P');
  await expect(page.locator('.skill-shortcut')).toContainText(['RMB', '1', 'Z', '3', '4', '5', '6']);

  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.potion-key')).toHaveText('V');
  await expect(page.locator('[data-quick-action="inventory"] .quick-key')).toHaveText('O');
  await expect(page.locator('[data-quick-action="talents"] .quick-key')).toHaveText('P');
  await expect(page.locator('.skill-shortcut')).toContainText(['RMB', '1', 'Z', '3', '4', '5', '6']);
});
