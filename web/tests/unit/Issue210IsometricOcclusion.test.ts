// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { createIsometricPrism, occluderDepthAt } from '../../src/game/phaser/isometricOcclusion';
import { pickIsometricPointer, type IsometricTarget } from '../../src/game/phaser/isometricPicking';
import { projectIsometric } from '../../src/game/phaser/isometricProjection';

const origin = { x: 1400, y: 100 };
const wall = createIsometricPrism({ x: 100, y: 100, width: 40, height: 40 }, 40, origin);
const enemy: IsometricTarget = { kind: 'ENEMY', id: 'enemy',
  position: { x: 90, y: 90 }, bodyHeight: 50, bodyHalfWidth: 24, hitRadius: 43, alive: true };
const foreground: IsometricTarget = { ...enemy, id: 'front', position: { x: 150, y: 150 } };
const point = projectIsometric({ x: 110, y: 110 }, 35, origin);
const pick = (targets: IsometricTarget[], projected = point, uiCaptured = false) =>
  pickIsometricPointer({ projected, origin, targets, uiCaptured, canWalk: () => true,
    occluders: [wall] });

describe('Issue #210 opaque projected wall faces', () => {
  it('uses the same three visible polygons and painter depth as the renderer', () => {
    expect(wall.depth).toBe(280);
    expect(wall.faces).toHaveLength(3);
    for (const face of wall.faces) {
      const center = { x: face.reduce((s, p) => s + p.x, 0) / face.length,
        y: face.reduce((s, p) => s + p.y, 0) / face.length };
      expect(occluderDepthAt(center, [wall])).toBe(280);
    }
    expect(occluderDepthAt({ x: -100, y: -100 }, [wall])).toBe(-Infinity);
    expect(occluderDepthAt(wall.faces[0]![0]!, [wall])).toBe(280);
  });
  it('does not target a body or a ground marker through an opaque foreground wall', () => {
    expect(pick([enemy]).context.kind).toBe('INVALID');
    const loot: IsometricTarget = { ...enemy, kind: 'LOOT', id: 'loot', bodyHeight: 0, bodyHalfWidth: 0 };
    expect(pick([loot]).context.kind).toBe('INVALID');
  });
  it('allows a foreground body drawn in front of the wall', () => {
    const overlap = projectIsometric(foreground.position, 45, origin);
    expect(occluderDepthAt(overlap, [wall])).toBe(280);
    expect(pick([enemy, foreground], overlap).context).toEqual({ kind: 'ENEMY', id: 'front' });
  });
  it('preserves UI capture and unobstructed ground input', () => {
    expect(pick([enemy], point, true).context.kind).toBe('UI');
    expect(pick([], projectIsometric({ x: 20, y: 30 }, 0, origin)).context.kind).toBe('GROUND');
  });
  it('chooses the nearest overlapping wall independent of array order', () => {
    const near = createIsometricPrism({ x: 110, y: 110, width: 40, height: 40 }, 50, origin);
    expect(occluderDepthAt(point, [near, wall])).toBe(300);
    expect(occluderDepthAt(point, [wall, near])).toBe(300);
  });
});
