import { test, expect } from '@playwright/test';

test('inventory is compact, compares on hover, and drag-drops gear both ways', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  const modal = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  await expect(modal).toBeVisible();
  await expect(modal.locator('[data-bag-index]')).toHaveCount(24);
  await expect(modal.locator('[data-equipment-slot]')).toHaveCount(12);
  const belt = modal.locator('.bag-slot.occupied').first();
  await belt.hover();
  await expect(modal.getByTestId('item-stat-comparison')).toBeVisible();
  await expect(modal.locator('[data-stat="armor"]')).toContainText('→');
  await expect(modal.locator('[data-stat="maxHealth"]')).toBeVisible();
  await belt.dragTo(modal.locator('[data-equipment-slot="BELT"]'));
  await expect(modal.locator('[data-equipment-slot="BELT"]')).toHaveClass(/has-item/);
  await expect(modal.locator('.bag-slot.occupied')).toHaveCount(0);
  const equipped = modal.locator('[data-equipment-slot="BELT"]');
  const empty = modal.locator('[data-bag-index="17"]');
  await equipped.dragTo(empty);
  await expect(modal.locator('[data-equipment-slot="BELT"]')).not.toHaveClass(/has-item/);
  await expect(empty).toHaveClass(/occupied/);
  await empty.hover();
  await expect(modal.getByTestId('item-stat-comparison')).toBeVisible();
  await expect(modal.locator('.item-detail').first()).toContainText('Studded War Belt');
  await modal.getByRole('button', { name: 'Close' }).click();
});

test('HUD columns and minimap fog do not stack over each other', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const mini = page.locator('.minimap-overlay');
  const enemies = page.locator('.enemy-roster');
  const guide = page.locator('.world-guide');
  const quest = page.locator('.quest-journal');
  await expect(mini).toBeVisible();
  await expect(enemies).toBeVisible();
  await expect(guide).toBeVisible();
  await expect(quest).toBeVisible();
  const a = await mini.boundingBox(), b = await enemies.boundingBox();
  const c = await guide.boundingBox(), d = await quest.boundingBox();
  expect(a && b && c && d).toBeTruthy();
  if (a && b && c && d) {
    expect(a.y + a.height).toBeLessThanOrEqual(b.y + 1);
    expect(c.y + c.height).toBeLessThanOrEqual(d.y + 1);
  }
  await expect(mini.locator('svg mask')).toHaveCount(1);
  await expect(mini.locator('[data-fog-cell]').first()).toHaveAttribute('stroke', 'none');
  await page.setViewportSize({ width: 740, height: 720 });
  await expect(mini).toBeVisible();
  await expect(enemies).toBeVisible();
});
