// GPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveActorFacing, directionalPixelView, activeFacingAim } from '../../src/game/phaser/isometricActorFacing';
import { renderPixelAtlas, pixelAtlasKey, directionalPixelAtlasKey, type PixelActor } from '../../src/game/phaser/pixelSpriteAtlas';
import type { IsometricFacing } from '../../src/game/phaser/isometricProjection';

const position = { x: 100, y: 100 };

describe('Issue #210: directional actor presentation', () => {
  it('maps Cartesian displacement to all eight projected directions', () => {
    const samples = [
      [{ x: 102, y: 98 }, 'e'], [{ x: 104, y: 100 }, 'se'],
      [{ x: 102, y: 102 }, 's'], [{ x: 100, y: 104 }, 'sw'],
      [{ x: 98, y: 102 }, 'w'], [{ x: 96, y: 100 }, 'nw'],
      [{ x: 98, y: 98 }, 'n'], [{ x: 100, y: 96 }, 'ne']
    ] as const;
    for (const [next, facing] of samples) {
      expect(resolveActorFacing({ position: next, previous: position, last: 's' })).toBe(facing);
    }
  });
  it('retains the last facing while idle, ignores subpixel jitter and honors explicit attack aim', () => {
    expect(resolveActorFacing({ position, last: 'nw' })).toBe('nw');
    expect(resolveActorFacing({ position: { x: 100.01, y: 100 }, previous: position, last: 'nw' })).toBe('nw');
    expect(resolveActorFacing({ position, previous: { x: 98, y: 100 }, aim: { x: 96, y: 100 }, last: 's' })).toBe('nw');
    expect(resolveActorFacing({ position, aim: position, last: 'ne' })).toBe('ne');
    expect(resolveActorFacing({ position, previous: { x: NaN, y: 0 }, last: 'w' })).toBe('w');
  });
  it('uses five native views and three mirrored variants with distinct texture keys', () => {
    const facings: IsometricFacing[] = ['e','se','s','sw','w','nw','n','ne'];
    expect(facings.map(directionalPixelView)).toEqual([
      { view: 'e', flipX: false }, { view: 'se', flipX: false }, { view: 's', flipX: false },
      { view: 'se', flipX: true }, { view: 'e', flipX: true }, { view: 'ne', flipX: true },
      { view: 'n', flipX: false }, { view: 'ne', flipX: false }
    ]);
    expect(new Set(facings.map(f => directionalPixelAtlasKey('WARRIOR', directionalPixelView(f).view))).size).toBe(5);
    expect(directionalPixelAtlasKey('WARRIOR', 's')).not.toBe(pixelAtlasKey('WARRIOR'));
  });
});

function capture(actor: PixelActor, view?: ReturnType<typeof directionalPixelView>['view']) {
  const commands: unknown[] = [];
  const ctx = {
    fillStyle: '', imageSmoothingEnabled: true,
    fillRect(x: number, y: number, w: number, h: number) {
      commands.push([this.fillStyle, x, y, w, h]);
    },
    save() {}, restore() {}, translate(x: number, y: number) { commands.push([x,y]); }
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  vi.stubGlobal('document', { createElement: () => canvas });
  renderPixelAtlas(actor, view);
  return { width: canvas.width, height: canvas.height, commands };
}

afterEach(() => vi.unstubAllGlobals());

describe('directional preview atlas', () => {
  it('preserves legacy south/front art and produces five distinct native humanoid views', () => {
    const legacy = capture('WARRIOR');
    expect(capture('WARRIOR','s')).toEqual(legacy);
    const views = ['s','se','e','ne','n'] as const;
    const atlases = views.map(view => capture('WARRIOR', view));
    expect(new Set(atlases.map(a => JSON.stringify(a.commands))).size).toBe(5);
    for (const a of atlases) expect([a.width,a.height]).toEqual([legacy.width,legacy.height]);
  });
  it('provides distinct back and front preview drawings for creatures and spirits', () => {
    for (const actor of ['wolf','spider','wraith','skeleton'] as const) {
      expect(capture(actor,'n').commands).not.toEqual(capture(actor,'s').commands);
    }
  });
});

describe('active skill facing', () => {
  const enemy = { x: 140, y: 80 };
  const lookup = (id: string) => id === 'enemy' ? enemy : undefined;
  it('uses explicit target, ground and directional aim, not pointer hover', () => {
    expect(activeFacingAim(position, { mode: 'TARGET_ENTITY', targetId: 'enemy' }, null, lookup)).toEqual(enemy);
    expect(activeFacingAim(position, { mode: 'AREA', position: { x: 90, y: 120 } }, 'enemy', lookup)).toEqual({ x: 90, y: 120 });
    expect(activeFacingAim(position, { mode: 'DIRECTION', direction: { x: 0, y: -1 } }, null, lookup)).toEqual({ x: 100, y: 99 });
    expect(activeFacingAim(position, undefined, 'enemy', lookup)).toEqual(enemy);
  });
  it('does not turn toward stale targets during self casts or missing targets', () => {
    expect(activeFacingAim(position, { mode: 'SELF' }, 'enemy', lookup)).toBeUndefined();
    expect(activeFacingAim(position, { mode: 'TARGET_ENTITY', targetId: 'missing' }, 'enemy', lookup)).toBeUndefined();
    expect(activeFacingAim(position, undefined, null, lookup)).toBeUndefined();
  });
});
