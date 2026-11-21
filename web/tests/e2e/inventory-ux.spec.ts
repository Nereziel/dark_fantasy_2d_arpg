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

test('HUD columns and minimap fog stay clear of the seven-skill action bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: /Paladin/ }).click();
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
  const leftColumn = page.locator('.hud-left-column');
  const rightColumn = page.locator('.hud-right-column');
  const skillbar = page.locator('.skill-ui');
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 740, height: 720 },
    { width: 560, height: 720 }
  ]) {
    await page.setViewportSize(viewport);
    await expect(mini).toBeVisible();
    await expect(enemies).toBeVisible();
    const skill = await skillbar.boundingBox();
    const left = await leftColumn.boundingBox();
    const right = await rightColumn.boundingBox();
    expect(skill && left && right).toBeTruthy();
    if (skill && left && right) {
      expect(left.y + left.height).toBeLessThanOrEqual(skill.y + 1);
      expect(right.y + right.height).toBeLessThanOrEqual(skill.y + 1);
    }
  }
});

test('inventory filter dims hidden items without disguising them as empty or movable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  const modal = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const belt = modal.locator('.bag-slot.occupied').first();
  await expect(belt.locator('.bag-item-icon')).toBeVisible();
  await belt.click();

  // A medium viewport can show equipped gear, backpack and comparison together.
  const [gear, bag, inspector] = await Promise.all([
    modal.locator('.equipment-section').boundingBox(),
    modal.locator('.backpack-section').boundingBox(),
    modal.getByTestId('item-inspector').boundingBox()
  ]);
  expect(gear && bag && inspector).toBeTruthy();
  if (gear && bag && inspector) {
    expect(gear.x + gear.width).toBeLessThanOrEqual(bag.x + 1);
    expect(bag.x + bag.width).toBeLessThanOrEqual(inspector.x + 1);
  }

  await modal.locator('.bag-toolbar select').selectOption('MYTHIC');
  const filtered = modal.locator('.bag-slot.occupied.filtered-out').first();
  await expect(filtered).toBeVisible();
  await expect(filtered.locator('.bag-item-icon')).toBeVisible();
  await expect(filtered).toBeDisabled();
  await expect(filtered).toHaveAttribute('draggable', 'false');
  await expect(filtered).not.toHaveClass(/selected/);

  await modal.locator('.bag-toolbar select').selectOption('ALL');
  await expect(filtered).toHaveCount(0);
  await expect(belt).toBeEnabled();
  await expect(belt.locator('.bag-item-icon')).toBeVisible();
});

test.describe('touch inventory item preview', () => {
  test.use({ hasTouch: true });

  test('mobile keeps the item inspection and equipped comparison accessible above the bag', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto('./');
    await page.locator('#menu-language').selectOption('en');
    await page.getByRole('button', { name: 'Enter the world' }).click();
    await page.getByRole('button', { name: 'Browse wares' }).click();
    const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
    await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
    await merchant.getByRole('button', { name: 'Leave' }).click();
    await page.getByRole('button', { name: 'Inventory (I)' }).click();

    const modal = page.getByRole('dialog', { name: 'Inventory & Equipment' });
    const inspector = modal.getByTestId('item-inspector');
    const bag = modal.locator('.backpack-section');
    const equipped = modal.locator('.equipment-section');
    const scroller = modal.locator('.inventory-layout');
    await expect(inspector.locator('.item-detail').first()).toContainText('Studded War Belt');

    for (const viewport of [
      { width: 390, height: 740 },
      { width: 360, height: 640 },
      { width: 320, height: 568 }
    ]) {
      await page.setViewportSize(viewport);
      const [previewBox, bagBox, gearBox, headerBox] = await Promise.all([
        inspector.boundingBox(), bag.boundingBox(), equipped.boundingBox(),
        modal.locator('.inventory-header').boundingBox()
      ]);
      expect(previewBox && bagBox && gearBox && headerBox).toBeTruthy();
      if (previewBox && bagBox && gearBox && headerBox) {
        expect(previewBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
        expect(previewBox.y + previewBox.height).toBeLessThanOrEqual(bagBox.y + 1);
        expect(bagBox.y + bagBox.height).toBeLessThanOrEqual(gearBox.y + 1);
        expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(viewport.width + 1);
      }
      await expect(inspector).toBeInViewport({ ratio: 0.75 });
      await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(inspector).toBeInViewport({ ratio: 0.75 });
      await scroller.evaluate(element => { element.scrollTop = 0; });
    }

    // Inspect by touch, without relying on hover, or scrolling past equipment.
    await bag.locator('.bag-slot.occupied').first().tap();
    await expect(inspector.locator('.item-detail').first()).toContainText('Studded War Belt');
    await expect(inspector.locator('.comparison-grid')).toBeVisible();
    await expect(inspector.getByTestId('item-stat-comparison')).toBeVisible();

    // Touch first previews; moving requires an explicit action, and gear taps
    // inspect equipped items rather than accidentally equipping selected bag gear.
    const move = inspector.getByRole('button', { name: 'Move by tap' });
    await expect(move).toBeVisible();
    await move.tap();
    await equipped.locator('[data-equipment-slot="BELT"]').tap();
    await expect(equipped.locator('[data-equipment-slot="BELT"]')).toHaveClass(/has-item/);
    await equipped.locator('[data-equipment-slot="BELT"]').tap();
    await expect(inspector.locator('.item-detail').first()).toContainText('Studded War Belt');
    await inspector.getByRole('button', { name: 'Move by tap' }).tap();
    await bag.locator('[data-bag-index="17"]').tap();
    await expect(bag.locator('[data-bag-index="17"]')).toHaveClass(/occupied/);

    await modal.getByRole('button', { name: 'Close' }).tap();
    await expect(modal).toHaveCount(0);
  });
});


test('dragging a bag item highlights only the compatible equipment sockets', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const vendor = page.getByRole('dialog', { name: 'Merchant Bram' });
  await vendor.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await vendor.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  const belt = inventory.locator('.bag-slot.occupied').first();
  await belt.evaluate(node => node.dispatchEvent(new DragEvent('dragstart', {
    bubbles: true, dataTransfer: new DataTransfer()
  })));
  await expect(inventory.locator('[data-equipment-slot="BELT"]')).toHaveClass(/drop-valid/);
  await expect(inventory.locator('[data-equipment-slot="HELMET"]')).not.toHaveClass(/drop-valid/);
  await belt.evaluate(node => node.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
  await expect(inventory.locator('[data-equipment-slot="BELT"]')).not.toHaveClass(/drop-valid/);
});
