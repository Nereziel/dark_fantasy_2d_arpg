import { openCharacterCreation, enterWorld, continueGame } from './character-menu';
// F1 — preset UI round trip on a real touch-width HUD. GPL-3.0-only.
import { test, expect } from '@playwright/test';

test('build presets retain saved layout and preview without changing talents', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: /Warrior/ }).click();
  await enterWorld(page);
  await page.getByTestId('edit-hotbar').click();
  const editor = page.getByTestId('hotbar-editor');
  const slot = editor.locator('[data-hotbar-edit-slot="SLOT_1"]');
  await slot.click();
  await editor.locator('[data-hotbar-edit-slot="SLOT_3"]').click();
  await page.getByTestId('build-preset-capture').click();
  await expect(page.getByTestId('build-preset-preview')).toContainText('Talent plan');
  await page.getByTestId('reset-hotbar').click();
  await expect(slot).toHaveAttribute('data-hotbar-edit-ability', 'charge');
  await page.getByTestId('build-preset-apply').click();
  await expect(slot).toHaveAttribute('data-hotbar-edit-ability', 'warCry');
  await page.getByTestId('edit-hotbar').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await continueGame(page);
  await page.getByTestId('edit-hotbar').click();
  await expect(page.getByTestId('build-preset-apply')).toBeEnabled();
  await page.getByTestId('build-preset-clear').click();
  await expect(page.getByTestId('build-preset-apply')).toBeDisabled();
  await expect(slot).toHaveAttribute('data-hotbar-edit-ability', 'warCry');
});
