import { openCharacterCreation } from './character-menu';
// GPL-3.0-only
import { test, expect, type Locator } from '@playwright/test';

async function assertMapFog(map: Locator, mode: 'mini' | 'world') {
  await expect(map).toBeVisible();
  await expect(map.locator('[data-fog="discovered"]').first()).toBeVisible();
  await expect(map.locator('[data-fog="unexplored"]').first()).toHaveCount(1);
  const result = await map.evaluate((root, mode) => {
    const known = new Set(Array.from(root.querySelectorAll('[data-fog="discovered"]'))
      .map(cell => cell.getAttribute('data-fog-cell')));
    const terrain = Array.from(root.querySelectorAll('[data-terrain-cell]'));
    const clipId = 'ar-discovered-' + mode;
    const clip = root.querySelector('clipPath[id="' + clipId + '"]');
    const geometry = Array.from(clip?.querySelectorAll('rect') ?? []);
    const rectKey = (rect: Element) => ['x','y','width','height']
      .map(attribute => rect.getAttribute(attribute)).join('/');
    const knownGeometry = new Set(Array.from(root.querySelectorAll('[data-fog="discovered"]')).map(rectKey));
    return {
      known: known.size,
      terrain: terrain.length,
      unknownTerrain: terrain.filter(cell => !known.has(cell.getAttribute('data-terrain-cell'))).length,
      clipCount: geometry.length,
      unknownClip: geometry.filter(rect => !knownGeometry.has(rectKey(rect))).length,
      roadClip: root.querySelector('.road-network')?.getAttribute('clip-path'),
      unknownRoads: Array.from(root.querySelectorAll('[data-known-road]')).filter(line => {
        const id = line.getAttribute('data-known-road') ?? '';
        const fogIndex = id.lastIndexOf('/fog/');
        return fogIndex < 0 || !known.has(id.slice(fogIndex + 1));
      }).length
    };
  }, mode);
  expect(result.known).toBeGreaterThan(0);
  expect(result.terrain).toBe(result.known);
  expect(result.unknownTerrain).toBe(0);
  expect(result.clipCount).toBe(result.known);
  expect(result.unknownClip).toBe(0);
  expect(result.roadClip).toBe('url(#ar-discovered-' + mode + ')');
  expect(result.unknownRoads).toBe(0);
}

test('default isometric view boots, accepts a pointer and keeps the map controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  await expect(canvas).toBeVisible();
  // The full plan is stable, but only camera-near ground textures are resident.
  await expect(canvas).toHaveAttribute('data-ground-chunks', '24');
  await expect.poll(async () => Number(await canvas.getAttribute('data-ground-resident-chunks'))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-ground-resident-chunks'))).toBeLessThan(24);
  // Visible layers are a subset; the complete collision/picking art plan
  // remains present across movement and camera changes.
  await expect.poll(async () => Number(await canvas.getAttribute('data-static-layers'))).toBeGreaterThan(0);
  const staticTotal = Number(await canvas.getAttribute('data-static-layers'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-static-visible-layers'))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-static-visible-layers'))).toBeLessThan(staticTotal);
  await expect(canvas).toHaveAttribute('data-prop-materials', /(?:^|,)ruin(?:,|$)/);
  await expect(canvas).toHaveAttribute('data-prop-materials', /(?:^|,)timber(?:,|$)/);
  const player = page.locator('[data-minimap="active"] [data-map-marker="player"] circle').first();
  await expect(player).toBeVisible();
  const initial = { x: Number(await player.getAttribute('cx')), y: Number(await player.getAttribute('cy')) };
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  // The camera starts on the hero in the protected town clearing. A small
  // screen-space offset translates to a Cartesian destination away from NPCs.
  await canvas.click({ position: { x: bounds!.width / 2 + 100, y: bounds!.height / 2 + 30 } });
  await expect.poll(async () => Math.hypot(
    Number(await player.getAttribute('cx')) - initial.x,
    Number(await player.getAttribute('cy')) - initial.y
  ), { timeout: 6000 }).toBeGreaterThan(20);
  await expect(canvas).toHaveAttribute('data-static-layers', String(staticTotal));
  await expect.poll(async () => Number(await canvas.getAttribute('data-static-visible-layers'))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-static-visible-layers'))).toBeLessThan(staticTotal);
  await assertMapFog(page.locator('[data-minimap="active"] [data-map-mode="minimap"]'), 'mini');
  await page.keyboard.press('m');
  const dialog = page.getByTestId('world-map-dialog');
  await expect(dialog).toBeVisible();
  await assertMapFog(dialog.locator('[data-map-mode="world"]'), 'world');
  await dialog.getByTestId('map-zoom-in').click();
  await assertMapFog(dialog.locator('[data-map-mode="world"]'), 'world');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const query of ['?view=iso', '?view=classic', '?view=unknown', '?view=']) {
  test('obsolete view parameter does not change the renderer: ' + query, async ({ page }) => {
    await page.goto('./' + query);
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await page.getByRole('button', { name: 'Enter the world' }).click();
    await expect(page.locator('canvas[data-renderer="isometric-preview"]')).toBeVisible();
    await expect(page.locator('.phaser-container canvas')).toHaveCount(1);
  });
}
