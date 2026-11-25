import { openCharacterCreation, enterWorld } from './character-menu';
import { expect, test } from '@playwright/test';

/** All inspector actions must target the item most recently previewed by a
 * real mouse hover. Leaving a slot for the inspector must not silently fall
 * back to an older selection; transfers still require explicit Move.
 */
test('hovered item remains the inspector action target after cursor leaves the bag or gear', async ({ page }) => {
  // Many real pointer actions in one transaction sequence; avoid truncating
  // the scenario on a slow renderer. Individual assertions remain unchanged.
  test.setTimeout(60_000);
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  const belt = merchant.getByRole('button', { name: 'Buy Studded War Belt' });
  await belt.click();
  await belt.click(); // Two real 32-gold purchases with distinct, stable IDs.
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();

  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const inspector = inventory.getByTestId('item-inspector');
  const first = inventory.locator('[data-bag-index="0"]');
  const second = inventory.locator('[data-bag-index="1"]');
  const target = inventory.locator('[data-bag-index="17"]');
  const gear = inventory.locator('[data-equipment-slot="BELT"]');
  const firstId = await first.getAttribute('data-item-id');
  const secondId = await second.getAttribute('data-item-id');
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toBe(secondId);

  // Initially the inspector has selected FIRST. Simply hovering SECOND,
  // then clicking Favorite in the inspector, must favorite SECOND (not FIRST).
  await second.hover();
  await expect(inspector.getByRole('button', { name: 'Favorite', exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Favorite', exact: true }).click();
  await expect(first).not.toHaveClass(/favorite/);
  await expect(second).toHaveClass(/favorite/);

  // The inspector's subsequent Unfavorite must use the same inspected ID.
  await second.hover();
  await inspector.getByRole('button', { name: 'Unfavorite' }).click();
  await expect(second).not.toHaveClass(/favorite/);
  await expect(first).toHaveAttribute('data-item-id', firstId!);

  // The two-step move source must also be the just-inspected SECOND belt,
  // rather than the first item that happened to be initially selected.
  await second.hover();
  await inspector.getByRole('button', { name: 'Move by click' }).click();
  await expect(target).toHaveClass(/drop-valid/);
  await target.click();
  await expect(target).toHaveAttribute('data-item-id', secondId!);
  await expect(first).toHaveAttribute('data-item-id', firstId!);
  await expect(second).not.toHaveClass(/occupied/);

  // Hover FIRST to equip through the inspector without first selecting it.
  await first.hover();
  await inspector.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(gear).toHaveAttribute('data-item-id', firstId!);
  await expect(first).not.toHaveClass(/occupied/);

  // With SECOND now the selected bag item, hovering the EQUIPPED first belt
  // and moving to Unequip must not switch the inspector back to SECOND.
  await target.click();
  await gear.hover();
  await inspector.getByRole('button', { name: 'Unequip', exact: true }).click();
  await expect(gear).not.toHaveClass(/has-item/);
  await expect(first).toHaveAttribute('data-item-id', firstId!);
  await expect(target).toHaveAttribute('data-item-id', secondId!);
});
