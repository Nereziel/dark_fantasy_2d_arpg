// Issue #123 stage 2: SVG item artwork survives stash transfers on small screens.
import { test, expect } from '@playwright/test';

test('stash shows the same item illustration in bag, stored rows and after withdrawal at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Open stash' }).click();
  const stash = page.getByRole('dialog', { name: 'Camp Stash' });
  await expect(stash.locator('[data-stash-bag] .stash-item-ident svg[data-item-art="belt"]'))
    .toBeVisible();
  await stash.getByRole('button', { name: 'Store' }).click();
  await expect(stash.locator('[data-stash-items="0"] .stash-item-ident svg[data-item-art="belt"]'))
    .toBeVisible();
  await expect(stash.locator('[data-stash-bag] svg[data-item-art="belt"]')).toHaveCount(0);
  await stash.getByRole('button', { name: 'Retrieve' }).click();
  await expect(stash.locator('[data-stash-bag] svg[data-item-art="belt"]')).toBeVisible();
});
