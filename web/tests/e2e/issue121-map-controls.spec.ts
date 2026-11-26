import { openCharacterCreation, enterWorld, continueGame, saveFromMenu } from './character-menu';
// Issue #121 — real map interactions and no fog disclosure.
// GPL-3.0-only.
import { test, expect } from '@playwright/test';

test('discovered terrain and soil roads render without exposing hidden POI', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.keyboard.press('m');

  const dialog = page.getByTestId('world-map-dialog');
  const map = dialog.locator('[data-map-mode="world"]');
  await expect(map).toBeVisible();
  await expect(map.locator('[data-terrain-cell]').first()).toBeVisible();
  await expect(map.locator('[data-fog="unexplored"]').first()).toHaveCount(1);
  await expect(map.locator('[data-marker-kind="optionalPoi"]')).toHaveCount(0);
  const discoveredBefore = await map.locator('[data-fog="discovered"]').count();
  expect(discoveredBefore).toBeGreaterThan(0);
  await expect(map.locator('[data-terrain-cell]')).toHaveCount(discoveredBefore);
  await expect(map).toHaveAttribute('data-map-zoom', '1.00');
  await expect(map.locator('feGaussianBlur')).toHaveCount(0);

  await dialog.getByTestId('map-zoom-in').click();
  await expect(map).toHaveAttribute('data-map-zoom', '1.25');
  const afterZoom = await map.locator('svg').getAttribute('data-map-viewport');
  await page.keyboard.press('ArrowRight');
  await expect(map.locator('svg')).not.toHaveAttribute('data-map-viewport', afterZoom!);

  await dialog.getByTestId('map-center').click();
  await expect(map.locator('svg')).toHaveAttribute('data-map-viewport', /^0,[0-9]+,1100,700$/);
  await dialog.getByTestId('map-reset').click();
  await expect(map).toHaveAttribute('data-map-zoom', '1.00');
  await expect(map.locator('svg')).toHaveAttribute('data-map-viewport', '0,0,2200,1400');
  await expect(map.locator('[data-fog="discovered"]')).toHaveCount(discoveredBefore);
  await expect(map.locator('[data-marker-kind="optionalPoi"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // The map camera was only presentation: saved exploration is unchanged.
  await saveFromMenu(page);
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await continueGame(page);
  await expect(page.locator('[data-minimap="active"]')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Hero loaded');
  await page.keyboard.press('m');
  const restoredMap = page.getByTestId('world-map-dialog');
  await expect(restoredMap).toBeVisible();
  await expect(restoredMap.locator('[data-fog="discovered"]'))
    .toHaveCount(discoveredBefore);
});

test.describe('phone map controls', () => {
  test.use({ viewport: { width: 390, height: 740 }, hasTouch: true });

  test('touch-sized controls, drag and two-finger zoom keep close visible', async ({ page }) => {
    await page.goto('./?view=iso');
    await page.locator('#menu-language').selectOption('cs');
    await openCharacterCreation(page);
    await enterWorld(page);
    await page.locator('.game-header').getByRole('button', { name: 'Mapa', exact: true }).tap();
    const dialog = page.getByTestId('world-map-dialog');
    const map = dialog.locator('[data-map-mode="world"]');
    const close = dialog.getByTestId('map-close');
    await expect(close).toBeInViewport({ ratio: 1 });

    for (const button of await dialog.locator('.world-map-toolbar button').all()) {
      const b = await button.boundingBox();
      expect(b).not.toBeNull();
      expect(b!.height).toBeGreaterThanOrEqual(43);
      expect(b!.width).toBeGreaterThanOrEqual(43);
    }
    await dialog.getByTestId('map-zoom-in').tap();
    await expect(map).toHaveAttribute('data-map-zoom', '1.25');

    // Touch input uses pointer events and the same camera-only pan callback.
    const svg = map.locator('svg');
    const before = await svg.getAttribute('data-map-viewport');
    await svg.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch',
      button: 0, clientX: 180, clientY: 350 });
    await svg.dispatchEvent('pointermove', { pointerId: 11, pointerType: 'touch',
      clientX: 120, clientY: 350 });
    await svg.dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch',
      clientX: 120, clientY: 350 });
    await expect(svg).not.toHaveAttribute('data-map-viewport', before!);

    const zoomBefore = await map.getAttribute('data-map-zoom');
    await svg.dispatchEvent('pointerdown', { pointerId: 21, pointerType: 'touch',
      button: 0, clientX: 150, clientY: 250 });
    await svg.dispatchEvent('pointerdown', { pointerId: 22, pointerType: 'touch',
      button: 0, clientX: 190, clientY: 250 });
    await svg.dispatchEvent('pointermove', { pointerId: 22, pointerType: 'touch',
      clientX: 230, clientY: 250 });
    await svg.dispatchEvent('pointerup', { pointerId: 21, pointerType: 'touch' });
    await svg.dispatchEvent('pointerup', { pointerId: 22, pointerType: 'touch' });
    await expect(map).not.toHaveAttribute('data-map-zoom', zoomBefore!);

    await expect(close).toBeInViewport({ ratio: 1 });
    await close.tap();
    await expect(dialog).toHaveCount(0);
  });
});
