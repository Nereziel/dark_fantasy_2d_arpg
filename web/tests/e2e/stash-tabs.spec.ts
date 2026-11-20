import { test, expect } from '@playwright/test';

test('multi-tab stash transfers, filters and persists stable item IDs in character v11', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Open stash' }).click();
  const stash = page.getByRole('dialog', { name: 'Camp Stash' });
  await expect(stash.getByRole('tab')).toHaveCount(3);
  await stash.locator('[data-stash-tab="1"]').click();
  await stash.getByRole('button', { name: 'Store' }).click();
  await expect(stash).toContainText('Stash (1/24)');
  const first = stash.locator('[data-stash-items="1"] [data-item-id]');
  const itemId = await first.getAttribute('data-item-id');
  expect(itemId).toBeTruthy();
  await stash.getByRole('combobox', { name: 'Category' }).selectOption('armor');
  await expect(first).toHaveCount(1);
  await stash.getByRole('searchbox', { name: 'Find item' }).fill('helm');
  await expect(stash).toContainText('No items match the current filters.');
  await stash.getByRole('searchbox', { name: 'Find item' }).fill('');
  await stash.getByRole('combobox', { name: 'Category' }).selectOption('');
  await stash.getByRole('button', { name: 'Organize this tab' }).click();
  await expect(stash.locator('[data-stash-items="1"] [data-item-id]')).toHaveAttribute('data-item-id', itemId!);
  await stash.getByRole('combobox', { name: 'Move to tab: ' + itemId }).selectOption('2');
  await expect(stash).toContainText('Stash (0/24)');
  await stash.locator('[data-stash-tab="2"]').click();
  await expect(stash.locator('[data-stash-items="2"] [data-item-id]')).toHaveAttribute('data-item-id', itemId!);
  await stash.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByRole('button', { name: 'Open stash' }).click();
  const recovered = page.getByRole('dialog', { name: 'Camp Stash' });
  await recovered.locator('[data-stash-tab="2"]').click();
  await expect(recovered.locator('[data-stash-items="2"] [data-item-id]'))
    .toHaveAttribute('data-item-id', itemId!);
  await recovered.getByRole('button', { name: 'Retrieve' }).click();
  await expect(recovered).toContainText('Stash (0/24)');
  await expect(recovered).toContainText('Backpack (1/24)');
  await expect(recovered.locator('[data-stash-bag] [data-item-id]'))
    .toHaveAttribute('data-item-id', itemId!);
});
