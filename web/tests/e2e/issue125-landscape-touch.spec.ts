import { openCharacterCreation, enterWorld, openGuideFromMenu } from './character-menu';
import { expect, test } from '@playwright/test';

/**
 * Browser-emulated landscape acceptance on the production build.
 * Every interaction goes through the visible UI: no GameBridge calls,
 * direct saves, synthetic quest events or state injection.
 * Physical Android/iOS acceptance remains a separate manual gate.
 */
test.describe('Issue #125: landscape touch first-play accessibility', () => {
  test.use({ hasTouch: true });

  for (const width of [740, 844]) {
    test(`${width}x390: guide, NPC, inventory and map remain operable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 390 });
      await page.goto('./?view=iso');
      await page.locator('#menu-language').selectOption('cs');
      await openCharacterCreation(page);
      await enterWorld(page);

      const guide = page.getByTestId('onboarding-guide');
      await expect(guide).toHaveCount(0);
      await openGuideFromMenu(page,'tap');
      await expect(guide).toHaveAttribute('data-guide-step', 'warden');
      const guideGeometry = await guide.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const hud = node.closest('.hud-left-column')!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, hudLeft: hud.left,
          hudRight: hud.right, viewport: innerWidth };
      });
      expect(guideGeometry.left).toBeGreaterThanOrEqual(guideGeometry.hudLeft - 1);
      expect(guideGeometry.right).toBeLessThanOrEqual(guideGeometry.hudRight + 1);
      expect(guideGeometry.right).toBeLessThanOrEqual(guideGeometry.viewport + 1);

      await page.getByRole('button', { name: 'Promluvit se strážkyní' }).tap();
      const warden = page.getByRole('dialog', { name: 'Strážkyně Vesna' });
      await expect(warden).toBeVisible();
      await expect(guide).toBeHidden();
      await warden.getByRole('button', { name: 'Přijmout úkol' }).tap();
      await warden.getByRole('button', { name: 'Odejít' }).tap();
      await expect(guide).toHaveAttribute('data-guide-step', 'move');

      // Open and dismiss inventory without obscuring the close control.
      await page.locator('[data-quick-action="inventory"]').tap();
      const inventory = page.getByRole('dialog', { name: 'Inventář a výbava' });
      await expect(inventory).toBeVisible();
      await expect(guide).toBeHidden();
      const closeInventory = inventory.locator('.close-button');
      await expect(closeInventory).toBeVisible();
      await closeInventory.tap();
      await expect(guide).toBeVisible();

      // Map uses discovered-only projection and has a reachable close button.
      await page.locator('.game-header').getByRole('button', { name: 'Mapa', exact: true }).tap();
      const map = page.getByTestId('world-map-dialog');
      await expect(map).toBeVisible();
      await expect(guide).toBeHidden();
      await expect(map.locator('[data-marker-kind="optionalPoi"]')).toHaveCount(0);
      await map.getByTestId('map-close').tap();
      await expect(map).toHaveCount(0);
      await expect(guide).toBeVisible();
      await expect(page.getByTestId('combat-dock')).toBeVisible();
    });
  }
});
