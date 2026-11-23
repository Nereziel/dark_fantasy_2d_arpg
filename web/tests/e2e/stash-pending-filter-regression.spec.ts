import { expect, test } from '@playwright/test';

// Touch regression: changing a stash view filter must never retain an armed
// transfer that can silently move an item no longer visible to the player.
test.describe('touch stash view changes cancel pending transfers', () => {
  test.use({ hasTouch: true });

  test('editing search cancels a backpack deposit before tapping another tab', async ({ page }) => {
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
    const bag = stash.locator('[data-stash-bag] [data-item-id]');
    const id = await bag.getAttribute('data-item-id');
    expect(id).toBeTruthy();
    await bag.getByRole('button', { name: 'Select for move' }).tap();
    await expect(stash.getByRole('button', { name: 'Cancel move' })).toBeVisible();
    await expect(stash.locator('[data-stash-tab="2"]')).toHaveClass(/drop-ready/);

    await stash.getByRole('searchbox', { name: 'Find item' }).fill('not-this-belt');
    await expect(stash.getByRole('button', { name: 'Cancel move' })).toHaveCount(0);
    await expect(stash.locator('[data-stash-tab="2"]')).not.toHaveClass(/drop-ready/);

    // Tab selection is now navigation, not a deposit of the previously armed item.
    await stash.locator('[data-stash-tab="2"]').tap();
    await expect(stash.locator('[data-stash-tab="2"]')).toHaveAttribute('aria-selected', 'true');
    await expect(bag).toHaveAttribute('data-item-id', id!);
    await expect(stash.locator('[data-stash-items="2"] [data-item-id]')).toHaveCount(0);
  });

  test('category and sort changes cancel stored-item transfers but explicit re-arm still works', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto('./');
    await page.locator('#menu-language').selectOption('en');
    await page.getByRole('button', { name: 'Enter the world' }).tap();
    await page.getByRole('button', { name: 'Browse wares' }).tap();
    const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
    await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).tap();
    await merchant.getByRole('button', { name: 'Leave' }).tap();
    await page.getByRole('button', { name: 'Open stash' }).tap();

    const stash = page.getByRole('dialog', { name: 'Camp Stash' });
    await stash.getByRole('button', { name: 'Store' }).tap();
    const stored = stash.locator('[data-stash-items="0"] [data-item-id]');
    const id = await stored.getAttribute('data-item-id');
    expect(id).toBeTruthy();
    await stored.getByRole('button', { name: 'Select for move' }).tap();
    await expect(stash.locator('[data-stash-tab="1"]')).toHaveClass(/drop-ready/);

    // The armor belt disappears from the filtered list, so it must no longer
    // be armed as a transferable source.
    await stash.getByRole('combobox', { name: 'Category' }).selectOption('weapon');
    await expect(stash.locator('[data-stash-items="0"] [data-item-id]')).toHaveCount(0);
    await expect(stash.getByRole('button', { name: 'Cancel move' })).toHaveCount(0);
    await stash.locator('[data-stash-tab="1"]').tap();
    await expect(stash.locator('[data-stash-items="1"] [data-item-id]')).toHaveCount(0);

    await stash.locator('[data-stash-tab="0"]').tap();
    await stash.getByRole('combobox', { name: 'Category' }).selectOption('');
    await expect(stored).toHaveAttribute('data-item-id', id!);
    await stored.getByRole('button', { name: 'Select for move' }).tap();
    await stash.getByRole('combobox', { name: 'Order' }).selectOption('name');
    await expect(stash.getByRole('button', { name: 'Cancel move' })).toHaveCount(0);
    await expect(stash.locator('[data-stash-tab="1"]')).not.toHaveClass(/drop-ready/);
    await stash.locator('[data-stash-tab="1"]').tap();
    await expect(stash.locator('[data-stash-items="1"] [data-item-id]')).toHaveCount(0);

    // Moving is still available after explicitly selecting the visible source again.
    await stash.locator('[data-stash-tab="0"]').tap();
    await stored.getByRole('button', { name: 'Select for move' }).tap();
    await stash.locator('[data-stash-tab="1"]').tap();
    await expect(stash.locator('[data-stash-items="1"] [data-item-id]'))
      .toHaveAttribute('data-item-id', id!);
    await expect(stash.locator('[data-stash-items="0"] [data-item-id]')).toHaveCount(0);
  });
});
