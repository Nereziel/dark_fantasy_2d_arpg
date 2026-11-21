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

      // One DOM snapshot per viewport. Previously 60+ cross-process
      // locator/boundingBox/assertion roundtrips could exceed the 30s test
      // timeout under CI load, despite a correctly rendered HUD.
      const geometry = await dock.evaluate(element => {
        const measure = (node: Element) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const visible = style.display !== 'none' && style.visibility !== 'hidden'
            && rect.width > 0 && rect.height > 0;
          const intersectionWidth = Math.max(0,
            Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
          const intersectionHeight = Math.max(0,
            Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
          return {
            x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            viewportRatio: visible
              ? (intersectionWidth * intersectionHeight) / (rect.width * rect.height) : 0
          };
        };
        return {
          dock: measure(element),
          actions: Array.from(element.querySelectorAll('[data-quick-action]'), measure),
          skills: Array.from(element.querySelectorAll('.skill-button'), measure),
          header: measure(document.querySelector('.game-header')!)
        };
      });

      const outer = geometry.dock;
      expect(outer.x, JSON.stringify(viewport)).toBeGreaterThanOrEqual(0);
      expect(outer.y).toBeGreaterThanOrEqual(0);
      expect(outer.x + outer.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(outer.y + outer.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(outer.height).toBeLessThan(viewport.height * 0.6);

      expect(geometry.actions).toHaveLength(5);
      for (const action of geometry.actions) {
        expect(action.width).toBeGreaterThanOrEqual(43);
        expect(action.height).toBeGreaterThanOrEqual(43);
        expect(action.x).toBeGreaterThanOrEqual(outer.x - 1);
        expect(action.x + action.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
        expect(action.y + action.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
        expect(action.viewportRatio).toBeGreaterThanOrEqual(0.8);
      }
      expect(geometry.skills).toHaveLength(7);
      if (viewport.width <= 430) {
        for (const skill of geometry.skills) {
          expect(skill.height).toBeGreaterThanOrEqual(43);
          expect(skill.width).toBeGreaterThanOrEqual(43);
        }
      }
      expect(geometry.header.x).toBeGreaterThanOrEqual(0);
      expect(geometry.header.x + geometry.header.width)
        .toBeLessThanOrEqual(viewport.width + 1);
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
