import { openCharacterCreation } from './character-menu';
// Issue #123: rendered item art, stable comparison and touch-safe loot filters.
// GPL-3.0-only.
import { test, expect } from '@playwright/test';

test('inventory uses real SVG artwork for bag, equipped gear and the inspector', async ({ page }) => {
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
  const belt = inventory.locator('.bag-slot.occupied').first();
  const icon = belt.locator('svg[data-item-art="belt"][data-icon-kind="belt"]');
  await expect(icon).toBeVisible();
  const bounds = await icon.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(24);
  expect(bounds!.height).toBeGreaterThanOrEqual(24);
  await belt.hover();
  await expect(inventory.locator('.item-detail').first().locator('svg[data-item-art="belt"]')).toBeVisible();
  const before = inventory.getByTestId('item-stat-comparison');
  await expect(before.locator('[data-stat="critChance"]')).toBeVisible();
  await expect(before.locator('[data-stat="blockChance"]')).toBeVisible();
  await belt.dragTo(inventory.locator('[data-equipment-slot="BELT"]'));
  await expect(inventory.locator('[data-equipment-slot="BELT"] svg[data-item-art="belt"]')).toBeVisible();
  await inventory.getByRole('button', { name: 'Close' }).click();
});

test.describe('touch item preview and loot-label preferences', () => {
  test.use({ hasTouch: true });

  test('320–430px preview is illustrated and compares side by side before deliberate equip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto('./?view=iso');
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await page.getByRole('button', { name: 'Enter the world' }).click();
    await page.getByRole('button', { name: 'Browse wares' }).click();
    const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
    await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
    await merchant.getByRole('button', { name: 'Leave' }).click();
    await page.getByRole('button', { name: 'Inventory (I)' }).click();

    const modal = page.getByRole('dialog', { name: 'Inventory & Equipment' });
    const bag = modal.locator('.bag-slot.occupied').first();
    const inspector = modal.getByTestId('item-inspector');
    const move = inspector.getByRole('button', { name: 'Move by tap' });
    await bag.tap();
    await expect(move).toBeVisible();
    await expect(inspector.locator('svg[data-item-art="belt"]')).toBeVisible();
    await expect(inspector.locator('.comparison-grid .item-detail')).toHaveCount(2);
    for (const viewport of [
      { width: 430, height: 932 },
      { width: 390, height: 740 },
      { width: 320, height: 568 }
    ]) {
      await page.setViewportSize(viewport);
      await expect(bag.locator('svg[data-item-art="belt"]')).toBeVisible();
      await expect(inspector).toBeInViewport({ ratio: 0.75 });
      await expect(move).toBeVisible();
      const cards = await inspector.locator('.item-detail').all();
      const first = await cards[0]!.boundingBox();
      const second = await cards[1]!.boundingBox();
      expect(first && second).toBeTruthy();
      if (first && second) {
        expect(first.x + first.width).toBeLessThanOrEqual(second.x + 2);
        expect(second.x + second.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
    await move.tap();
    await modal.locator('[data-equipment-slot="HELMET"]').tap();
    await expect(inspector.locator('.placement-error[role="status"]'))
      .toContainText('This item is not compatible with that equipment slot.');
    await expect(modal.locator('[data-equipment-slot="HELMET"] svg[data-item-art="belt"]'))
      .toHaveCount(0);
    await modal.locator('[data-equipment-slot="BELT"]').tap();
    await expect(modal.locator('[data-equipment-slot="BELT"] svg[data-item-art="belt"]')).toBeVisible();
    await modal.getByRole('button', { name: 'Close' }).tap();
  });

  test('ground loot label filter stores sanitized preferences without discarding the bag item', async ({ page }) => {
    await page.goto('./?view=iso');
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await page.getByRole('button', { name: 'Enter the world' }).click();
    await page.getByRole('button', { name: 'Browse wares' }).click();
    const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
    await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
    await merchant.getByRole('button', { name: 'Leave' }).click();
    await page.getByRole('button', { name: 'Inventory (I)' }).click();
    const modal = page.getByRole('dialog', { name: 'Inventory & Equipment' });
    const filter = modal.getByTestId('ground-loot-filter');
    await filter.getByLabel('Minimum rarity').selectOption('MYTHIC');
    await filter.getByLabel('Item type').selectOption('accessories');
    await filter.getByLabel('Always show favorites').uncheck();
    await expect(modal.locator('.bag-slot.occupied')).toHaveCount(1);
    await expect(modal.locator('.bag-slot.occupied svg[data-item-art="belt"]')).toBeVisible();
    const saved = await page.evaluate(() => localStorage.getItem('aether-ruin-ground-loot-filter-v1'));
    expect(JSON.parse(saved!)).toEqual({
      minRarity: 'MYTHIC', category: 'accessories', alwaysShowFavorites: false
    });
    await modal.getByRole('button', { name: 'Close' }).tap();
    await page.getByRole('button', { name: 'Inventory (I)' }).tap();
    const restored = page.getByRole('dialog', { name: 'Inventory & Equipment' });
    await expect(restored.getByTestId('ground-loot-filter').getByLabel('Minimum rarity'))
      .toHaveValue('MYTHIC');
    await expect(restored.getByTestId('ground-loot-filter').getByLabel('Item type'))
      .toHaveValue('accessories');
    await expect(restored.locator('.bag-slot.occupied')).toHaveCount(1);
  });
});
