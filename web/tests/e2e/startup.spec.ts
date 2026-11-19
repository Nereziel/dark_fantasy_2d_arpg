import { test, expect } from '@playwright/test';

test('switches Czech/English in the menu and game without losing the scene', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Aether & Ruin' })).toBeVisible();

  await page.locator('#menu-language').selectOption('cs');
  await expect(page.getByRole('button', { name: 'Vstoupit do světa' })).toBeVisible();

  await page.getByRole('button', { name: 'Vstoupit do světa' }).click();
  await expect(page.locator('.game-hud')).toBeVisible();
  await expect(page.locator('.phaser-container canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Poražení nepřátelé')).toBeVisible();
  await expect(page.locator('.enemy-name')).toHaveText('Přízrak');

  await page.locator('#game-language').selectOption('en');
  await expect(page.getByText('Enemies defeated')).toBeVisible();
  await expect(page.locator('.enemy-name')).toHaveText('Wraith');
  await expect(page.locator('.enemy-roster button')).toHaveCount(3);
  await expect(page.locator('.enemy-roster-title')).toContainText('3/3');
  const skeleton = page.locator('.enemy-roster button').filter({ hasText: 'Skeleton Warrior' });
  await skeleton.click();
  await expect(skeleton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.enemy-name')).toHaveText('Skeleton Warrior');
  await expect(page.locator('.game-hud')).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Game saved');
  await page.reload();
  await expect(page.locator('#menu-language')).toHaveValue('en');
});

test('creates a Rogue, opens localized inventory, saves and reloads its class', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  const rogue = page.getByRole('button', { name: /Rogue/ });
  await expect(rogue).toBeVisible();
  await rogue.click();
  await expect(rogue).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.getByText('Rogue · Level 1')).toBeVisible();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  await expect(page.getByRole('dialog', { name: 'Inventory & Equipment' })).toBeVisible();
  await expect(page.getByText('Helmet')).toBeVisible();
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByRole('dialog', { name: 'Inventář a výbava' })).toBeVisible();
  await page.getByRole('button', { name: 'Zavřít' }).click();
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('status')).toContainText('Hra uložena');
  await page.reload();
  await expect(page.locator('#menu-language')).toHaveValue('cs');
  await page.getByRole('button', { name: 'Načíst' }).click();
  await expect(page.getByText('Tulák · Úroveň 1')).toBeVisible();
});

test('casts a Paladin ability and localizes effects without restarting the game', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: /Paladin/ }).click();
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const skill = page.getByRole('button', { name: 'Consecration' });
  await expect(skill).toBeEnabled();
  await skill.click();
  await expect(skill).toBeDisabled();
  await expect(page.locator('.effect-chip.beneficial')).toContainText('Consecration');
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByRole('button', { name: 'Posvěcená půda' })).toBeDisabled();
  await expect(page.locator('.effect-chip.beneficial')).toContainText('Posvěcení');
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('status')).toContainText('Hra uložena');
  await page.reload();
  await page.getByRole('button', { name: 'Načíst' }).click();
  await expect(page.getByText('Paladin · Úroveň 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Posvěcená půda' })).toBeDisabled();
});
