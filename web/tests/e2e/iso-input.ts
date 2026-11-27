// GPL-3.0-only — real fixed-zoom isometric input coordinates.
import { expect, type Locator, type Page } from '@playwright/test';
import { projectIsometric } from '../../src/game/phaser/isometricProjection';

export async function heroPoint(page: Page) {
  return page.locator('.game-screen').evaluate(node => ({
    x: Number(node.getAttribute('data-player-x')),
    y: Number(node.getAttribute('data-player-y'))
  }));
}

export async function isoGroundPoint(canvas: Locator, world: { x: number; y: number }) {
  await expect(canvas).toHaveAttribute('data-renderer', 'isometric-preview');
  await expect(canvas).toHaveAttribute('data-camera-origin', /^-?[0-9.]+,-?[0-9.]+$/);
  const origin = await canvas.getAttribute('data-projection-origin');
  const [ox, oy] = (origin ?? '').split(',').map(Number);
  if (!origin || !Number.isFinite(ox) || !Number.isFinite(oy)) throw new Error('Missing projection origin');
  const projected = projectIsometric(world, 0, { x: ox!, y: oy! });
  const point = await canvas.evaluate((node, target) => {
    const element = node as HTMLCanvasElement;
    const rect = element.getBoundingClientRect();
    const [sx, sy] = (element.dataset.cameraOrigin ?? '').split(',').map(Number);
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !element.width || !element.height) return null;
    const x = rect.left + (target.x - sx!) * rect.width / element.width;
    const y = rect.top + (target.y - sy!) * rect.height / element.height;
    return document.elementFromPoint(x, y) === element ? { x, y } : null;
  }, projected);
  if (!point) throw new Error('Projected ground is not exposed at ' + world.x + ',' + world.y);
  return point;
}

export async function heldIsoMoveEast(page: Page, canvas: Locator) {
  const before = await heroPoint(page);
  const first = await isoGroundPoint(canvas, { x: before.x + 70, y: before.y });
  const second = await isoGroundPoint(canvas, { x: before.x + 125, y: before.y - 5 });
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  try {
    await page.mouse.move(second.x, second.y, { steps: 8 });
    await expect.poll(async () => (await heroPoint(page)).x, { timeout: 5000 })
      .toBeGreaterThan(before.x + 12);
  } finally {
    await page.mouse.up();
  }
}

/** Find visible camp ground for a real primary click, checking the live cursor
 * first so a projected NPC body (including Lio/Toma) cannot steal movement.
 * Candidates are local open-ground offsets, not a hidden world-state query.
 */
export async function campMovementTarget(page: Page, canvas: Locator) {
  const hero = await heroPoint(page);
  for (const [dx, dy] of [[80, 0], [90, -20], [65, 5], [0, -55], [-35, 40], [35, 50]]) {
    try {
      const target = await isoGroundPoint(canvas, { x: hero.x + dx!, y: hero.y + dy! });
      await page.mouse.move(target.x, target.y);
      if (await canvas.evaluate(node => (node as HTMLCanvasElement).style.cursor) === 'crosshair')
        return target;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Projected ground is not exposed')) throw error;
    }
  }
  throw new Error('No exposed camp ground movement target');
}

/** Coordinates of an already projected map marker, independent of SVG glyph
 * shape or zoom. Never coerce missing attributes to a fabricated origin. */
export async function mapMarkerPoint(marker:Locator):Promise<{x:number;y:number}>{
  return marker.evaluate(node=>{
    const x=node.getAttribute('data-map-x'),y=node.getAttribute('data-map-y');
    if(x===null||y===null||!x.trim()||!y.trim()||!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))
      throw Error('Rendered map marker has no finite world anchor: '+node.getAttribute('data-map-marker'));
    return {x:Number(x),y:Number(y)};
  });
}
