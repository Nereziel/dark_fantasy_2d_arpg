import { test, expect } from '@playwright/test';

test('switches Czech/English in the menu and in game without losing the scene', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Aether & Ruin' })).toBeVisible();

  await page.locator('#menu-language').selectOption('cs');
  await expect(page.getByRole('button', { name: 'Vstoupit do světa' })).toBeVisible();

  await page.getByRole('button', { name: 'Vstoupit do světa' }).click();
  await expect(page.locator('.game-hud')).toBeVisible();
  await expect(page.getByText('Poražení nepřátelé')).toBeVisible();

  await page.locator('#game-language').selectOption('en');
  await expect(page.getByText('Enemies defeated')).toBeVisible();
  await expect(page.locator('.game-hud')).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Game saved');
  await page.reload();
  await expect(page.locator('#menu-language')).toHaveValue('en');
});
