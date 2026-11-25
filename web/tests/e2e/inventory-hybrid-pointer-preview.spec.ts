import { openCharacterCreation, enterWorld } from './character-menu';
import { expect, test } from '@playwright/test';

/** Hybrid touch + mouse regression: a tap must not permanently disable
 * mouse-hover comparison. No bridge, fixture state or synthetic pointer events.
 */
test.describe('hybrid pointer inventory inspection', () => {
  test.use({ hasTouch: true });

  test('touch tap then mouse hover previews the hovered item without changing item flags', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 390 });
    await page.goto('./?view=iso');
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await enterWorld(page, 'tap');
    await page.getByRole('button', { name: 'Browse wares' }).tap();
    const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
    const buy = merchant.getByRole('button', { name: 'Buy Studded War Belt' });
    await buy.tap();
    await buy.tap();
    await merchant.getByRole('button', { name: 'Leave' }).tap();
    await page.locator('[data-quick-action="inventory"]').tap();

    const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
    const inspector = inventory.getByTestId('item-inspector');
    const first = inventory.locator('[data-bag-index="0"]');
    const second = inventory.locator('[data-bag-index="1"]');
    const firstId = await first.getAttribute('data-item-id');
    const secondId = await second.getAttribute('data-item-id');
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);

    // Both belts have the same name; favorite only the FIRST instance so the
    // inspector's localized favorite action identifies which item is previewed.
    await first.tap();
    await inspector.getByRole('button', { name: 'Favorite', exact: true }).tap();
    await expect(first).toHaveClass(/favorite/);
    await expect(second).not.toHaveClass(/favorite/);
    await expect(inspector.getByRole('button', { name: 'Unfavorite' })).toBeVisible();

    // A subsequent real mouse hover should immediately preview the SECOND
    // belt, even though the last click came from a touchscreen. Previously
    // touchInput remained true until another mouse *click*, so this still
    // displayed the FIRST belt and "Unfavorite".
    await second.hover();
    await expect(inspector.getByRole('button', { name: 'Favorite', exact: true }))
      .toBeVisible();
    await expect(first).toHaveAttribute('data-item-id', firstId!);
    await expect(second).toHaveAttribute('data-item-id', secondId!);

    // Mouse and touch can switch back and forth without altering either item.
    await first.hover();
    await expect(inspector.getByRole('button', { name: 'Unfavorite' })).toBeVisible();
    await second.tap();
    await expect(inspector.getByRole('button', { name: 'Favorite', exact: true }))
      .toBeVisible();
    // The desktop cursor can still be geometrically inside the FIRST slot.
    // Move it within the same slot: pointermove, not pointerenter, must switch
    // the preview back after the interleaved touch.
    await first.hover({ position: { x: 9, y: 9 } });
    await expect(inspector.getByRole('button', { name: 'Unfavorite' })).toBeVisible();
    await expect(second).not.toHaveClass(/favorite/);
  });
});
