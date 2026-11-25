// GPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PIXEL_ACTOR_LOOKS, PIXEL_ANIMATIONS, PIXEL_ANIMATION_FRAMES,
  PIXEL_FRAME_WIDTH, PIXEL_FRAME_HEIGHT, renderPixelAtlas, type PixelActor
} from '../../src/game/phaser/pixelSpriteAtlas';
import type { DirectionalPixelView } from '../../src/game/phaser/isometricActorFacing';

type Paint = { color: string; x: number; y: number; w: number; h: number };
const views = ['s', 'se', 'e', 'ne', 'n'] as const satisfies readonly DirectionalPixelView[];
const actors = Object.keys(PIXEL_ACTOR_LOOKS) as PixelActor[];
const W = PIXEL_FRAME_WIDTH, H = PIXEL_FRAME_HEIGHT;

function capture(actor: PixelActor, view: DirectionalPixelView) {
  const cells: Paint[][] = [];
  const ctx = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    save() {}, restore() {},
    translate(x: number, y: number) {
      expect(x).toBe((cells.length % PIXEL_ANIMATION_FRAMES) * W);
      expect(y).toBe(Math.floor(cells.length / PIXEL_ANIMATION_FRAMES) * H);
      cells.push([]);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      cells.at(-1)!.push({ color: this.fillStyle, x, y, w, h });
    }
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  vi.stubGlobal('document', { createElement: () => canvas });
  renderPixelAtlas(actor, view);
  expect(canvas.width).toBe(W * PIXEL_ANIMATION_FRAMES);
  expect(canvas.height).toBe(H * PIXEL_ANIMATIONS.length);
  expect(cells).toHaveLength(PIXEL_ANIMATIONS.length * PIXEL_ANIMATION_FRAMES);
  return cells;
}

afterEach(() => vi.unstubAllGlobals());

describe('Issue #210 C2.2: frame-local sprite painting', () => {
  it.each(actors)('contains every pixel rectangle of %s in all native views and poses', actor => {
    for (const view of views) {
      const cells = capture(actor, view);
      for (const [index, cell] of cells.entries()) {
        const label = actor + '/' + view + '/' +
          PIXEL_ANIMATIONS[Math.floor(index / PIXEL_ANIMATION_FRAMES)] +
          '-' + index % PIXEL_ANIMATION_FRAMES;
        expect(cell.length, label).toBeGreaterThan(0);
        for (const p of cell) {
          if (!(Number.isInteger(p.x) && Number.isInteger(p.y)
            && Number.isInteger(p.w) && Number.isInteger(p.h)
            && p.x >= 0 && p.y >= 0 && p.w > 0 && p.h > 0
            && p.x + p.w <= W && p.y + p.h <= H)) {
            throw new Error(label + ' escaped its frame: ' + JSON.stringify(p));
          }
        }
      }
    }
  });

  it('retains a complete rogue blade and symmetric spider feet in the idle frame', () => {
    const rogue = capture('ROGUE', 's')[0]!;
    expect(rogue.some(p => p.color === '#c0bdb2' && p.w === 14 && p.h === 3
      && p.x + p.w <= W)).toBe(true);
    const spider = capture('spider', 's')[0]!;
    const legs = spider.filter(p => p.color === PIXEL_ACTOR_LOOKS.spider.body
      && p.w === 4 && p.h === 11);
    expect(legs).toHaveLength(8);
    expect(legs.every(p => p.x >= 0 && p.x + p.w <= W)).toBe(true);
    for (let i = 0; i < legs.length; i += 2) {
      expect(legs[i]!.x + legs[i + 1]!.x + 4).toBe(W);
    }
  });

  it('keeps the planted feet and complete final death pose in their original cells', () => {
    const cells = capture('WARRIOR', 's');
    expect(cells[0]).toContainEqual({ color: '#10131d', x: 11, y: 50, w: 27, h: 4 });
    expect(cells.at(-1)).toEqual([
      { color: PIXEL_ACTOR_LOOKS.WARRIOR.shadow, x: 10, y: 46, w: 29, h: 5 },
      { color: PIXEL_ACTOR_LOOKS.WARRIOR.body, x: 12, y: 43, w: 25, h: 4 },
      { color: PIXEL_ACTOR_LOOKS.WARRIOR.accent, x: 35, y: 44, w: 5, h: 3 }
    ]);
  });
});
