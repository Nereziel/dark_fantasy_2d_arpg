import { openCharacterCreation } from './character-menu';
import { expect, test } from '@playwright/test';

/** Regression for stale armed move state. Ordinary clicks after Cancel selection
 * or Sort must only inspect; no implicit swaps or surprise repositioning.
 * Uses real merchant purchases and the visible inventory controls.
 */
test('clear selection and sort both disarm move mode before subsequent bag clicks', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  const buy = merchant.getByRole('button', { name: 'Buy Studded War Belt' });
  await buy.click();
  await buy.click(); // Two genuine distinct items paid from the initial 75 gold.
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();

  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const inspector = inventory.getByTestId('item-inspector');
  const first = inventory.locator('[data-bag-index="0"]');
  const second = inventory.locator('[data-bag-index="1"]');
  const firstId = await first.getAttribute('data-item-id');
  const secondId = await second.getAttribute('data-item-id');
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toBe(secondId);

  await first.click();
  await inspector.getByRole('button', { name: 'Move by click' }).click();
  await expect(inspector.getByRole('button', { name: 'Cancel move' }))
    .toHaveAttribute('aria-pressed', 'true');
  await inventory.getByRole('button', { name: 'Clear selection' }).click();

  // Previously, Clear selection kept moveArmed=true. The next two plain bag
  // clicks picked a new source and unexpectedly swapped these item identities.
  await first.click();
  await second.click();
  await expect(first).toHaveAttribute('data-item-id', firstId!);
  await expect(second).toHaveAttribute('data-item-id', secondId!);

  await inspector.getByRole('button', { name: 'Move by click' }).click();
  await expect(inspector.getByRole('button', { name: 'Cancel move' }))
    .toHaveAttribute('aria-pressed', 'true');
  await inventory.getByRole('button', { name: 'Sort' }).click();

  // Sort can intentionally reorder the bag. Capture the authoritative post-sort
  // positions; subsequent normal inspection must not cause any further move.
  const sortedFirst = await first.getAttribute('data-item-id');
  const sortedSecond = await second.getAttribute('data-item-id');
  expect(sortedFirst).toBeTruthy();
  expect(sortedSecond).toBeTruthy();
  await first.click();
  await second.click();
  await expect(first).toHaveAttribute('data-item-id', sortedFirst!);
  await expect(second).toHaveAttribute('data-item-id', sortedSecond!);

  // Explicitly re-arming still allows a deliberate, atomic bag-to-bag swap.
  await inspector.getByRole('button', { name: 'Move by click' }).click();
  await first.click();
  await expect(first).toHaveAttribute('data-item-id', sortedSecond!);
  await expect(second).toHaveAttribute('data-item-id', sortedFirst!);
});
