// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { createIsometricPrism } from '../../src/game/phaser/isometricOcclusion';
import { heroCutaway } from '../../src/game/phaser/isometricCutaway';
import { pickIsometricPointer, type IsometricTarget } from '../../src/game/phaser/isometricPicking';
import { projectIsometric } from '../../src/game/phaser/isometricProjection';

const origin = { x: 1400, y: 100 };
const hero = { x: 90, y: 90 };
const wall = createIsometricPrism({ x: 100, y: 100, width: 40, height: 40 }, 40, origin);
const distant = createIsometricPrism({ x: 400, y: 100, width: 40, height: 40 }, 40, origin);

describe('Issue #210: local hero cutaway', () => {
  it('fades only foreground geometry covering the hero silhouette', () => {
    const result = heroCutaway(hero, origin, [wall, distant]);
    expect(result.alphas).toEqual([0.35, 1]);
    expect(result.opaque).toEqual([distant]);
    expect(heroCutaway({ x: 150, y: 150 }, origin, [wall]).alphas).toEqual([1]);
    expect(heroCutaway({ x: 20, y: 20 }, origin, [wall]).alphas).toEqual([1]);
  });

  it('restores opacity after movement and does not mutate wall geometry', () => {
    const before = JSON.stringify(wall);
    heroCutaway(hero, origin, [wall]);
    expect(heroCutaway({ x: 150, y: 150 }, origin, [wall]).opaque).toEqual([wall]);
    expect(JSON.stringify(wall)).toBe(before);
  });

  it('allows visible targets behind faded geometry while leaving collision authoritative', () => {
    const target: IsometricTarget = { kind: 'ENEMY', id: 'enemy', position: hero,
      alive: true, hitRadius: 43, bodyHeight: 50, bodyHalfWidth: 24 };
    const point = projectIsometric({ x: 110, y: 110 }, 35, origin);
    const input = { projected: point, origin, targets: [target], uiCaptured: false,
      canWalk: () => false };
    expect(pickIsometricPointer({ ...input, occluders: [wall] }).context.kind).toBe('INVALID');
    const { opaque } = heroCutaway(hero, origin, [wall]);
    expect(pickIsometricPointer({ ...input, occluders: opaque }).context)
      .toEqual({ kind: 'ENEMY', id: 'enemy' });
    expect(pickIsometricPointer({ ...input, targets: [], occluders: opaque }).context.kind).toBe('INVALID');
  });
});
