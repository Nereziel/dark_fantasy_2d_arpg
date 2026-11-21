// Issue #120 — touch HUD, geometry and modal focus regression. GPL-3.0-only.
import { expect, test } from '@playwright/test';

test.describe('mobile touch HUD', () => {
  test.use({ hasTouch: true });

  test('all seven skills and five quick actions remain reachable in portrait and landscape', async ({ page }) => {
    await page.goto('./');
    await page.locator('#menu-language').selectOption('en');
    await page.getByRole('button', { name: /Paladin/ }).click();
    await page.getByRole('button', { name: 'Enter the world' }).click();

    const dock = page.getByTestId('combat-dock');
    const skillButtons = dock.locator('.skill-button');
    const quickActions = dock.locator('[data-quick-action]');
    await expect(skillButtons).toHaveCount(7);
    await expect(quickActions).toHaveCount(5);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 390, height: 740 },
      { width: 430, height: 932 },
      { width: 740, height: 390 }
    ]) {
      await page.setViewportSize(viewport);
      const dockRect = await dock.boundingBox();
      expect(dockRect).not.toBeNull();
      if (!dockRect) continue;
      expect(dockRect.x).toBeGreaterThanOrEqual(0);
      expect(dockRect.y).toBeGreaterThanOrEqual(0);
      expect(dockRect.x + dockRect.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(dockRect.y + dockRect.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(dockRect.height).toBeLessThan(viewport.height * 0.6);

      for (const action of await quickActions.all()) {
        const bounds = await action.boundingBox();
        expect(bounds).not.toBeNull();
        if (!bounds) continue;
        expect(bounds.width).toBeGreaterThanOrEqual(43);
        expect(bounds.height).toBeGreaterThanOrEqual(43);
        expect(bounds.x).toBeGreaterThanOrEqual(dockRect.x - 1);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(dockRect.x + dockRect.width + 1);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(dockRect.y + dockRect.height + 1);
        await expect(action).toBeInViewport({ ratio: 0.8 });
      }
      for (const skill of await skillButtons.all()) {
        const bounds = await skill.boundingBox();
        expect(bounds).not.toBeNull();
        if (bounds && viewport.width <= 430) {
          expect(bounds.height).toBeGreaterThanOrEqual(43);
          expect(bounds.width).toBeGreaterThanOrEqual(43);
        }
      }
      const header = page.locator('.game-header');
      const headerRect = await header.boundingBox();
      if (headerRect) {
        expect(headerRect.x).toBeGreaterThanOrEqual(0);
        expect(headerRect.x + headerRect.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
  });

  test('modal close is visible and background is inert on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('./');
    await page.locator('#menu-language').selectOption('cs');
    await page.getByRole('button', { name: 'Vstoupit do světa' }).click();

    await page.locator('[data-quick-action="inventory"]').tap();
    const inventory = page.getByRole('dialog', { name: /Inventář/ });
    await expect(inventory).toBeVisible();
    await expect(page.locator('.game-header')).toHaveAttribute('inert');
    const close = inventory.locator('.close-button');
    await expect(close).toBeVisible();
    await expect(close).toBeInViewport({ ratio: 1 });
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(inventory).toHaveCount(0);
    await expect(page.locator('[data-quick-action="inventory"]')).toBeFocused();
    await expect(page.locator('.game-header')).not.toHaveAttribute('inert');

    await page.locator('[data-quick-action="inventory"]').tap();
    await expect(inventory).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    const focusInside = await inventory.evaluate(node => node.contains(document.activeElement));
    expect(focusInside).toBe(true);
    await inventory.locator('.close-button').tap();

    await page.locator('.game-header').getByRole('button', { name: 'Mapa', exact: true }).tap();
    const map = page.getByTestId('world-map-dialog');
    const mapClose = map.getByTestId('map-close');
    await expect(mapClose).toBeInViewport({ ratio: 1 });
    await expect(mapClose).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(map).toHaveCount(0);
  });
});
