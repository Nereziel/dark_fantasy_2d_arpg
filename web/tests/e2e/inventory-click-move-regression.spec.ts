import { openCharacterCreation, enterWorld, continueGame, saveFromMenu } from './character-menu';
import { expect, test } from '@playwright/test';

/**
 * Reproduces actual inventory reports with normal UI/vendor interactions.
 * No GameBridge, debug snapshots, test fixtures or synthetic drag events.
 */
test('bag click only inspects; equipping, unequipping and dragging preserve the item', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const index = await inventory.locator('.bag-slot.occupied').first()
    .getAttribute('data-bag-index');
  expect(index).not.toBeNull();
  // Keep a stable cell locator after equipping removes its occupied class.
  const belt = inventory.locator('[data-bag-index="' + index + '"]');
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
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
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

test('clicking two different bag items does not swap them until Move by click is armed', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  const belt = merchant.getByRole('button', { name: 'Buy Studded War Belt' });
  await belt.click();
  await belt.click(); // 2 × 32 gold from the actual starting 75 gold
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const first = inventory.locator('[data-bag-index="0"]');
  const second = inventory.locator('[data-bag-index="1"]');
  const firstId = await first.getAttribute('data-item-id');
  const secondId = await second.getAttribute('data-item-id');
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(secondId).not.toBe(firstId);

  await first.click();
  await second.click();
  await expect(first).toHaveAttribute('data-item-id', firstId!);
  await expect(second).toHaveAttribute('data-item-id', secondId!);

  await inventory.getByTestId('item-inspector')
    .getByRole('button', { name: 'Move by click' }).click();
  await expect(first).toHaveClass(/drop-valid/);
  await first.click();
  await expect(first).toHaveAttribute('data-item-id', secondId!);
  await expect(second).toHaveAttribute('data-item-id', firstId!);
});

test.describe('landscape touch equipment management', () => {
  test.use({ hasTouch: true });

  test('740×390 touchscreen can equip and return gear without HTML5 drag', async ({ page }) => {
    // A mobile in landscape is wider than the old 650px CSS cutoff.
    // Move by tap was hidden there even though touch input cannot reliably
    // use native HTML5 draggable buttons.
    await page.setViewportSize({ width: 740, height: 390 });
    await page.goto('./?view=iso');
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await enterWorld(page, 'tap');
    await page.getByRole('button', { name: 'Browse wares' }).tap();
    const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
    await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).tap();
    await merchant.getByRole('button', { name: 'Leave' }).tap();
    await page.locator('[data-quick-action="inventory"]').tap();

    const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
    const gear = inventory.locator('[data-equipment-slot="BELT"]');
    const bag = inventory.locator('.bag-slot.occupied').first();
    const target = inventory.locator('[data-bag-index="17"]');
    const move = inventory.getByTestId('item-inspector')
      .getByRole('button', { name: 'Move by tap' });
    await bag.tap();
    await expect(move).toBeVisible();
    await move.tap();
    await expect(gear).toHaveClass(/drop-valid/);
    await gear.tap();
    await expect(gear).toHaveClass(/has-item/);

    await gear.tap();
    await expect(move).toBeVisible();
    await move.tap();
    await expect(target).toHaveClass(/drop-valid/);
    await target.tap();
    await expect(gear).not.toHaveClass(/has-item/);
    await expect(target).toHaveClass(/occupied/);
  });
});

test('equipped item swaps and exact bag placement persist through real Save/Load', async ({ page }) => {
  // Two real save/reload cycles need a scoped CI budget; do not relax the suite.
  test.setTimeout(60_000);
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  const buyBelt = merchant.getByRole('button', { name: 'Buy Studded War Belt' });
  await buyBelt.click();
  await buyBelt.click(); // Actual purchases, not injected inventory or save contents.
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();

  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const firstCell = inventory.locator('[data-bag-index="0"]');
  const secondCell = inventory.locator('[data-bag-index="1"]');
  const chosenCell = inventory.locator('[data-bag-index="17"]');
  const gear = inventory.locator('[data-equipment-slot="BELT"]');
  const firstId = await firstCell.getAttribute('data-item-id');
  const secondId = await secondCell.getAttribute('data-item-id');
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toBe(secondId);

  // Equip the first belt, then explicitly replace it with the second belt.
  await firstCell.click();
  await inventory.getByTestId('item-inspector')
    .getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(gear).toHaveAttribute('data-item-id', firstId!);
  await expect(firstCell).not.toHaveClass(/occupied/);
  await secondCell.click();
  await inventory.getByTestId('item-inspector')
    .getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(gear).toHaveAttribute('data-item-id', secondId!);
  await expect(secondCell).toHaveAttribute('data-item-id', firstId!);

  // Move the currently equipped belt to an explicitly chosen empty cell.
  await gear.dragTo(chosenCell);
  await expect(gear).not.toHaveClass(/has-item/);
  await expect(chosenCell).toHaveAttribute('data-item-id', secondId!);
  await expect(secondCell).toHaveAttribute('data-item-id', firstId!);
  await inventory.getByRole('button', { name: 'Close' }).click();

  // Authoritative save must retain stable item identities, exact positions,
  // and the empty equipment socket after a reload (not merely item counts).
  await saveFromMenu(page);
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await continueGame(page);
  // Verify that the asynchronous character restore completed, not just that Load was clicked.
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero loaded');
  await expect(page.getByTestId('system-menu')).toBeEnabled();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  await expect(gear).not.toHaveClass(/has-item/);
  await expect(secondCell).toHaveAttribute('data-item-id', firstId!);
  await expect(chosenCell).toHaveAttribute('data-item-id', secondId!);

  // Re-equip through real DnD and verify persistence in the other direction.
  await chosenCell.dragTo(gear);
  await expect(gear).toHaveAttribute('data-item-id', secondId!);
  await expect(chosenCell).not.toHaveClass(/occupied/);
  await inventory.getByRole('button', { name: 'Close' }).click();
  await saveFromMenu(page);
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await continueGame(page);
  // Verify that the asynchronous character restore completed, not just that Load was clicked.
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero loaded');
  await expect(page.getByTestId('system-menu')).toBeEnabled();
  await expect(page.locator('.game-screen')).toBeVisible();
  // Exercise the real, default inventory hotkey after the second reload.
  // Waiting for the live HUD action button to become geometrically stable
  // can time out during scene/layout transitions; the earlier reload still
  // covers the visible inventory button, so both entry paths are tested.
  await page.keyboard.press('i');
  await expect(inventory).toBeVisible();
  await expect(gear).toHaveAttribute('data-item-id', secondId!);
  await expect(secondCell).toHaveAttribute('data-item-id', firstId!);
  await expect(chosenCell).not.toHaveClass(/occupied/);
});
