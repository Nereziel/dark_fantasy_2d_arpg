import { test, expect } from '@playwright/test';

/**
 * Regression: a single bottom dock must not bury health/actions under skills.
 * Explicitly exercise the seven-button class across desktop, tablet and mobile.
 */
test('combat dock contains all seven skills, vitals and clickable actions without overlap', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: /Paladin/ }).click();
  await page.getByRole('button', { name: 'Enter the world' }).click();

  const dock = page.getByTestId('combat-dock');
  const skills = dock.locator('.skill-ui');
  const vitals = dock.locator('.vital-panel');
  const actions = dock.locator('.hud-actions');
  await expect(dock.locator('.skill-button')).toHaveCount(7);
  await expect(dock.locator('[data-quick-action]')).toHaveCount(5);
  await expect(dock.getByRole('button', { name: 'Inventory (I)' })).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 720 },
    { width: 740, height: 720 },
    { width: 560, height: 720 }
  ]) {
    await page.setViewportSize(viewport);
    const [outer, left, center, right] = await Promise.all([
      dock.boundingBox(), vitals.boundingBox(), skills.boundingBox(), actions.boundingBox()
    ]);
    expect(outer && left && center && right).toBeTruthy();
    if (!outer || !left || !center || !right) continue;
    for (const box of [left, center, right]) {
      expect(box.x).toBeGreaterThanOrEqual(outer.x - 1);
      expect(box.y).toBeGreaterThanOrEqual(outer.y - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
    }
    if (viewport.width <= 650) {
      // Touch devices use readable, independently tappable stacked rows.
      expect(left.y + left.height).toBeLessThanOrEqual(center.y + 1);
      expect(center.y + center.height).toBeLessThanOrEqual(right.y + 1);
    } else {
      expect(left.x + left.width).toBeLessThanOrEqual(center.x + 1);
      expect(center.x + center.width).toBeLessThanOrEqual(right.x + 1);
    }
    const buttons = dock.locator('.skill-button');
    const first = await buttons.first().boundingBox();
    const last = await buttons.last().boundingBox();
    expect(first && last).toBeTruthy();
    if (first && last) {
      expect(first.y).toBeLessThanOrEqual(last.y + 1);
      expect(last.y).toBeLessThanOrEqual(first.y + 1);
    }
  }

  await dock.getByRole('button', { name: 'Inventory (I)' }).click();
  await expect(page.getByRole('dialog', { name: 'Inventory & Equipment' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Inventory & Equipment' })).toHaveCount(0);
});

test('map stays above combat dock and has an accessible close control on every screen', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 740, height: 720 },
    { width: 560, height: 720 },
    { width: 390, height: 680 }
  ]) {
    await page.setViewportSize(viewport);
    await page.keyboard.press('m');
    const map = page.getByTestId('world-map-dialog');
    const close = map.getByTestId('map-close');
    await expect(map).toBeVisible();
    await expect(close).toBeVisible();
    await expect(map.locator('[data-map-mode="world"]')).toBeVisible();
    const stacking = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="world-map-dialog"]');
      const dock = document.querySelector('[data-testid="combat-dock"]');
      return [Number(getComputedStyle(dialog!).zIndex), Number(getComputedStyle(dock!).zIndex)];
    });
    expect(stacking[0]).toBeGreaterThan(stacking[1]);
    const button = await close.boundingBox();
    expect(button).not.toBeNull();
    if (button) {
      expect(button.y).toBeGreaterThanOrEqual(0);
      expect(button.x + button.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(button.y + button.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await close.click();
    await expect(map).toHaveCount(0);
  }
  await page.keyboard.press('m');
  await expect(page.getByTestId('world-map-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
});
