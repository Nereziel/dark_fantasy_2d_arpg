import { openCharacterCreation } from './character-menu';
import { expect, test } from '@playwright/test';

/** Regression for a deliberately protected item. The UI should never offer an
 * active action that the authoritative inventory planner will silently reject.
 * No debug bridge, injected game state or synthetic drag events.
 */
test('favorite and locked items cannot be dropped until explicitly unprotected', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();

  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const index = await inventory.locator('.bag-slot.occupied').first()
    .getAttribute('data-bag-index');
  expect(index).not.toBeNull();
  // Stable cell locator: its occupied class disappears after a real drop.
  const item = inventory.locator('[data-bag-index="' + index + '"]');
  const id = await item.getAttribute('data-item-id');
  expect(id).toBeTruthy();
  await item.click();
  const inspector = inventory.getByTestId('item-inspector');
  const drop = inspector.getByRole('button', { name: 'Drop', exact: true });
  await expect(drop).toBeEnabled();

  await inspector.getByRole('button', { name: 'Favorite', exact: true }).click();
  await expect(drop).toBeDisabled();
  await expect(inspector.locator('.invalid-equip[role="status"]'))
    .toContainText('Locked or favorite items cannot be dropped');
  await expect(item).toHaveAttribute('data-item-id', id!);

  await inspector.getByRole('button', { name: 'Unfavorite', exact: true }).click();
  await expect(drop).toBeEnabled();
  await inspector.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(drop).toBeDisabled();
  await expect(item).toHaveAttribute('data-item-id', id!);

  await inspector.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(drop).toBeEnabled();
  await drop.click();
  await expect(item).not.toHaveClass(/occupied/);
  await expect(inventory.locator('[data-item-id="' + id + '"]')).toHaveCount(0);
});
