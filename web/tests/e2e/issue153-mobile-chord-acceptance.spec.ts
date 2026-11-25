import { openCharacterCreation, enterWorld } from './character-menu';
import { test, expect } from '@playwright/test';

// Playwright emulates touch and narrow viewports; this is not a physical
// Android/iOS keyboard or a cross-platform AltGr hardware acceptance test.
test.describe('Issue #153 mobile bindings acceptance', () => {
  test.use({ hasTouch: true });
  for (const width of [320, 390, 430]) {
    test(`${width}px touch: Controls chord capture, map, and modal close remain reachable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto('./?view=iso');
      await page.locator('#menu-language').selectOption('en');
      await openCharacterCreation(page);
      await enterWorld(page);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Controls' }).tap();

      const panel = page.getByRole('dialog', { name: 'Input bindings' });
      await expect(panel).toBeVisible();
      const geometry = await panel.evaluate(node => {
        const box = node.getBoundingClientRect();
        return {
          x: box.x, right: box.right,
          top: box.top, bottom: box.bottom,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth
        };
      });
      expect(geometry.x).toBeGreaterThanOrEqual(-1);
      expect(geometry.right).toBeLessThanOrEqual(width + 1);
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(741);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);

      const map = panel.locator('.binding-row').filter({ hasText: 'Map' });
      await map.getByRole('button', { name: 'Change' }).tap();
      await page.keyboard.press('Control+m');
      await expect(map.locator('code')).toHaveText('Ctrl+M');
      await panel.getByRole('button', { name: 'Back' }).tap();
      await page.getByRole('dialog', { name: 'Paused' })
        .getByRole('button', { name: 'Resume' }).tap();

      await expect(page.locator('.minimap-caption')).toContainText('Ctrl+M');
      await page.keyboard.press('Control+m');
      const mapDialog = page.getByTestId('world-map-dialog');
      await expect(mapDialog).toBeVisible();
      const close = mapDialog.getByTestId('map-close');
      await expect(close).toBeInViewport({ ratio: 1 });
      await close.tap();
      await expect(mapDialog).toHaveCount(0);

      await page.getByTestId('combat-dock')
        .locator('[data-quick-action="inventory"]').tap();
      const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
      await expect(inventory).toBeVisible();
      await expect(inventory.locator('.close-button')).toBeInViewport({ ratio: 1 });
      await inventory.locator('.close-button').tap();
      await expect(inventory).toHaveCount(0);
    });
  }

  test('320px: long modifier hints stay within their touch buttons', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('./?view=iso');
    await page.evaluate(() => localStorage.setItem('aether-ruin-controls-v1', JSON.stringify([
      { action: 'INVENTORY', device: 'keyboard', code: 'F8',
        modifiers: { ctrl: true, shift: true } }
    ])));
    await page.reload();
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await enterWorld(page);
    const mapAction = page.getByTestId('combat-dock')
      .locator('[data-quick-action="inventory"]');
    await expect(mapAction.locator('.quick-key')).toHaveText('Ctrl+Shift+F8');
    const bounds = await mapAction.evaluate(node => {
      const btn = node.getBoundingClientRect();
      const label = node.querySelector('.quick-key')!.getBoundingClientRect();
      return { left: btn.left, right: btn.right, labelLeft: label.left,
        labelRight: label.right, width: btn.width, height: btn.height };
    });
    expect(bounds.width).toBeGreaterThanOrEqual(43);
    expect(bounds.height).toBeGreaterThanOrEqual(43);
    expect(bounds.labelLeft).toBeGreaterThanOrEqual(bounds.left - 1);
    expect(bounds.labelRight).toBeLessThanOrEqual(bounds.right + 1);
    await mapAction.tap();
    const dialog = page.getByRole('dialog', { name: 'Inventory & Equipment' });
    await expect(dialog).toBeVisible();
    await dialog.locator('.close-button').tap();
    await expect(dialog).toHaveCount(0);
  });
});
