import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('landscape touch stash supports explicit transfer across tabs and back to backpack with Save/Load', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 390 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).tap();
  await page.getByRole('button', { name: 'Browse wares' }).tap();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).tap();
  await merchant.getByRole('button', { name: 'Leave' }).tap();
  await page.getByRole('button', { name: 'Open stash' }).tap();

  const stash = page.getByRole('dialog', { name: 'Camp Stash' });
  const bagItem = stash.locator('[data-stash-bag] [data-item-id]');
  const id = await bagItem.first().getAttribute('data-item-id');
  expect(id).toBeTruthy();
  await bagItem.getByRole('button', { name: 'Select for move' }).tap();
  await expect(stash.getByRole('button', { name: 'Cancel move' })).toBeVisible();
  await expect(stash.locator('[data-stash-tab="2"]')).toHaveClass(/drop-ready/);

  // A tap on the tab itself is an explicit destination action while the
  // pending move is armed; touch does not depend on HTML5 DragEvent.
  await stash.locator('[data-stash-tab="2"]').tap();
  const stored = stash.locator('[data-stash-items="2"] [data-item-id]');
  await expect(stored).toHaveAttribute('data-item-id', id!);
  await expect(stash.locator('[data-stash-bag] [data-item-id]')).toHaveCount(0);
  await expect(stash.getByRole('button', { name: 'Cancel move' })).toHaveCount(0);

  // Transfer to a different stash tab, then withdraw into backpack.
  await stored.getByRole('button', { name: 'Select for move' }).tap();
  await expect(stash.locator('[data-stash-tab="1"]')).toHaveClass(/drop-ready/);
  await stash.locator('[data-stash-tab="1"]').tap();
  const moved = stash.locator('[data-stash-items="1"] [data-item-id]');
  await expect(moved).toHaveAttribute('data-item-id', id!);
  await moved.getByRole('button', { name: 'Select for move' }).tap();
  await expect(stash.getByRole('button', { name: 'To backpack' })).toBeEnabled();
  await stash.getByRole('button', { name: 'To backpack' }).tap();
  await expect(stash.locator('[data-stash-bag] [data-item-id]')).toHaveAttribute('data-item-id', id!);
  await expect(stash.locator('[data-stash-items="1"] [data-item-id]')).toHaveCount(0);

  // Explicit selection can always be cancelled without any transaction.
  await bagItem.getByRole('button', { name: 'Select for move' }).tap();
  await stash.getByRole('button', { name: 'Cancel move' }).tap();
  await expect(stash.locator('[data-stash-bag] [data-item-id]')).toHaveAttribute('data-item-id', id!);
  await stash.getByRole('button', { name: 'Leave' }).tap();

  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).tap();
  await page.getByRole('button', { name: 'Open stash' }).tap();
  const reloaded = page.getByRole('dialog', { name: 'Camp Stash' });
  await expect(reloaded.locator('[data-stash-bag] [data-item-id]')).toHaveAttribute('data-item-id', id!);
  await reloaded.locator('[data-stash-tab="1"]').tap();
  await expect(reloaded.locator('[data-stash-items="1"] [data-item-id]')).toHaveCount(0);
  await reloaded.locator('[data-stash-tab="2"]').tap();
  await expect(reloaded.locator('[data-stash-items="2"] [data-item-id]')).toHaveCount(0);
});
