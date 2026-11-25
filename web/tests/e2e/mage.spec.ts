import { openCharacterCreation, enterWorld, continueGame } from './character-menu';
import { test, expect } from '@playwright/test';

test('Mage extra spells, cooldowns and character-only reload work in both locales', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: /Mage/ }).click();
  await enterWorld(page);

  await expect(page.getByText('Mage · Level 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fireball' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Frost Nova' })).toBeVisible();
  const extra = page.locator('[data-mage-ability]');
  await expect(extra).toHaveCount(5);
  await expect(page.locator('[data-mage-ability="chainLightning"]')).toBeVisible();
  await expect(page.locator('[data-mage-ability="meteor"]')).toBeVisible();
  await expect(page.locator('[data-mage-ability="teleport"]')).toBeVisible();
  await expect(page.locator('[data-mage-ability="blizzard"]')).toBeVisible();

  const barrier = page.locator('[data-mage-ability="arcaneBarrier"]');
  await expect(barrier).toBeEnabled();
  await barrier.click();
  await expect(barrier).toBeDisabled();

  await page.locator('#game-language').selectOption('cs');
  await expect(barrier).toHaveAttribute('aria-label', 'Arkanická bariéra');
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('status')).toContainText('Postava uložena');
  await page.reload();
  await continueGame(page);
  await expect(page.locator('[data-mage-ability]')).toHaveCount(5);
  await expect(page.locator('[data-mage-ability="arcaneBarrier"]')).toBeEnabled();
});
