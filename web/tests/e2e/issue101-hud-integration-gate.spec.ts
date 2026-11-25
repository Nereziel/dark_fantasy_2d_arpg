import { openCharacterCreation, enterWorld } from './character-menu';
// F0 / Prompt 46: independent HUD composition gate for the missing mid/desktop
// viewport sizes. The 320–430px touch dock and modal suite lives in #120.
// GPL-3.0-only.
import { expect, test } from '@playwright/test';

test('F0 HUD columns preserve a usable world canvas and modal focus at 390–1440px', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: /Paladin/ }).click();
  await enterWorld(page);

  const game = page.locator('.game-screen');
  const canvas = page.locator('.phaser-container canvas');
  const dock = page.getByTestId('combat-dock');
  await expect(canvas).toBeVisible();
  const originalSeed = await game.getAttribute('data-world-seed');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 560, height: 900 },
    { width: 740, height: 390 },
    { width: 900, height: 650 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await expect(canvas).toBeVisible();
    await expect(dock).toBeVisible();
    await expect.poll(async () => {
      const world = await canvas.boundingBox();
      const controls = await dock.boundingBox();
      return world && controls ? world.y + world.height - controls.y : Infinity;
    }, { message: 'The canvas ends before the combat dock at ' + JSON.stringify(viewport) })
      .toBeLessThanOrEqual(1);

    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        if (!box) return null;
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      const header = rect('.game-header');
      const left = rect('.hud-left-column');
      const right = rect('.hud-right-column');
      const combatDock = rect('[data-testid="combat-dock"]');
      const canvasBox = rect('.phaser-container canvas');
      const hitX = innerWidth / 2;
      // The center of the freely playable area must not be occluded by a
      // fullscreen HUD overlay or an incorrectly stacked modal backdrop.
      const hitY = header && combatDock
        ? Math.max(header.bottom + 12, (header.bottom + combatDock.top) / 2)
        : innerHeight / 2;
      const hit = document.elementFromPoint(hitX, hitY);
      return { header, left, right, combatDock, canvasBox,
        hitTag: hit?.tagName ?? 'NONE',
        hitX, hitY, width: innerWidth, height: innerHeight };
    });
    const label = JSON.stringify(viewport);
    expect(boxes.header, label).not.toBeNull();
    expect(boxes.left, label).not.toBeNull();
    expect(boxes.right, label).not.toBeNull();
    expect(boxes.combatDock, label).not.toBeNull();
    expect(boxes.canvasBox, label).not.toBeNull();
    const header = boxes.header!;
    const left = boxes.left!;
    const right = boxes.right!;
    const combatDock = boxes.combatDock!;
    expect(left.left, label).toBeGreaterThanOrEqual(-1);
    expect(right.right, label).toBeLessThanOrEqual(viewport.width + 1);
    expect(left.right, label).toBeLessThan(right.left);
    expect(header.bottom, label).toBeLessThan(combatDock.top);
    expect(combatDock.left, label).toBeGreaterThanOrEqual(-1);
    expect(combatDock.right, label).toBeLessThanOrEqual(viewport.width + 1);
    expect(combatDock.bottom, label).toBeLessThanOrEqual(viewport.height + 1);
    expect(boxes.hitTag, label + ': center pointer intercepted at '
      + boxes.hitX + ',' + boxes.hitY).toBe('CANVAS');

    // Real inventory and map controls must always be keyboard-dismissable,
    // return focus and suppress interaction with the underlying world.
    const inventoryTrigger = page.locator('[data-quick-action="inventory"]');
    await inventoryTrigger.click();
    const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
    await expect(inventory).toBeVisible();
    await expect(page.locator('.game-header')).toHaveAttribute('inert');
    await expect(inventory.locator('.close-button')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(inventory).toHaveCount(0);
    await expect(inventoryTrigger).toBeFocused();

    await page.locator('.game-header').getByRole('button', { name: 'Map', exact: true }).click();
    const map = page.getByTestId('world-map-dialog');
    await expect(map).toBeVisible();
    await expect(map.getByTestId('map-close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(map).toHaveCount(0);
    await expect(game).toHaveAttribute('data-world-seed', originalSeed!);
  }
});
