// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { classGroundEffects, summonPresentation } from '../../src/game/phaser/isometricClassEffects';
import { unprojectIsometric } from '../../src/game/phaser/isometricProjection';
import type { GameSnapshot } from '../../src/game/core/types';

const origin = { x: 1400, y: 100 };
const trap = { id: 'trap', ownerId: 'hero', zone: 'wilderness' as const,
  x: 300, y: 400, radius: 75, remaining: 5, damage: 10 };
const corpse = { id: 'corpse', enemyId: 'enemy', zone: 'wilderness' as const,
  x: 250, y: 300, remaining: 10 };
const field = { id: 'field', ownerId: 'hero', position: { x: 500, y: 600 },
  radius: 90, element: 'frost' as const, remaining: 2, tickSeconds: 1, nextPulseIn: 1 };
type Effects = Pick<GameSnapshot, 'zone' | 'mageZones' | 'rogueTraps' | 'corpses'>;

describe('Issue #210 class effect presentation', () => {
  it('projects actual trap and elemental radii, with separate corpse and trap markers', () => {
    const state: Effects = { zone: 'wilderness', mageZones: [field], rogueTraps: [trap], corpses: [corpse] };
    const before = JSON.stringify(state);
    const shapes = classGroundEffects(state, origin);
    expect(shapes.map(s => s.kind)).toEqual(['frost', 'trap-range', 'trap', 'corpse']);
    for (const [index, center, radius] of [[0, field.position, 90], [1, trap, 75], [2, trap, 16], [3, corpse, 14]] as const) {
      for (const p of shapes[index]!.points) {
        const w = unprojectIsometric(p, 0, origin);
        expect(Math.hypot(w.x - center.x, w.y - center.y)).toBeCloseTo(radius, 7);
      }
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('does not show expired, invalid or off-zone markers', () => {
    expect(classGroundEffects({ zone: 'crypt', rogueTraps: [trap], corpses: [corpse],
      mageZones: [{ ...field, remaining: 0 }, { ...field, radius: NaN }] }, origin)).toEqual([]);
    expect(classGroundEffects({ zone: 'wilderness' }, origin)).toEqual([]);
  });

  it('distinguishes friendly summon archetypes and fades near expiry', () => {
    expect(summonPresentation('golem', 5)).toEqual({ actor: 'crypt_lord', tint: 0xa2d4b7, alpha: 1 });
    expect(summonPresentation('demon', 2)).toEqual({ actor: 'wraith', tint: 0xcb72d1, alpha: 0.6 });
    expect(summonPresentation('skeleton', 3)).toEqual({ actor: 'skeleton', tint: 0x68d4ca, alpha: 1 });
  });
});
