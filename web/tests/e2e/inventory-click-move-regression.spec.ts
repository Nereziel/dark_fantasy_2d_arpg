import { expect, test } from '@playwright/test';

/**
 * Reproduces actual inventory reports with normal UI/vendor interactions.
 * No GameBridge, debug snapshots, test fixtures or synthetic drag events.
 */
test('bag click only inspects; equipping, unequipping and dragging preserve the item', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const belt = inventory.locator('.bag-slot.occupied').first();
  const index = await belt.getAttribute('data-bag-index');
  expect(index).not.toBeNull();
  const empty = inventory.locator('[data-bag-index="17"]');
  const gear = inventory.locator('[data-equipment-slot="BELT"]');
  const inspector = inventory.getByTestId('item-inspector');

  // Previously, clicking any empty bag slot with a preselected item silently
  // moved the item instead of simply inspecting/clearing the selection.
  await empty.click();
  await expect(belt).toHaveClass(/occupied/);
  await expect(empty).not.toHaveClass(/occupied/);

  await belt.click();
  await expect(inspector.locator('.item-detail').first()).toContainText('Studded War Belt');
  const equip = inspector.getByRole('button', { name: 'Equip', exact: true });
  await expect(equip).toBeEnabled();
  await equip.click();
  await expect(gear).toHaveClass(/has-item/);
  await expect(belt).not.toHaveClass(/occupied/);

  await gear.click();
  await inspector.getByRole('button', { name: 'Unequip', exact: true }).click();
  await expect(gear).not.toHaveClass(/has-item/);
  await expect(belt).toHaveClass(/occupied/);

  // The browser must be able to drag the very same item back and forth.
  await belt.dragTo(gear);
  await expect(gear).toHaveClass(/has-item/);
  await gear.dragTo(empty);
  await expect(gear).not.toHaveClass(/has-item/);
  await expect(empty).toHaveClass(/occupied/);
  await expect(empty).toHaveAttribute('title', /Studded War Belt/);
});

test('desktop click-to-move fallback supports both directions without accidental swaps', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const bag = inventory.locator('.bag-slot.occupied').first();
  const gear = inventory.locator('[data-equipment-slot="BELT"]');
  const empty = inventory.locator('[data-bag-index="17"]');
  const inspector = inventory.getByTestId('item-inspector');

  await bag.click();
  await inspector.getByRole('button', { name: 'Move by click' }).click();
  await expect(gear).toHaveClass(/drop-valid/);
  await gear.click();
  await expect(gear).toHaveClass(/has-item/);

  await gear.click();
  await inspector.getByRole('button', { name: 'Move by click' }).click();
  await expect(empty).toHaveClass(/drop-valid/);
  await empty.click();
  await expect(gear).not.toHaveClass(/has-item/);
  await expect(empty).toHaveClass(/occupied/);

  // A subsequent ordinary click selects without moving the equipped item.
  const original = inventory.locator('[data-bag-index="0"]');
  await original.click();
  await expect(empty).toHaveClass(/occupied/);
});
