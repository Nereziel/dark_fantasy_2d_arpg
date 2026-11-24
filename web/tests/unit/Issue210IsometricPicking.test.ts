// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { pickIsometricPointer, type IsometricTarget } from '../../src/game/phaser/isometricPicking';
import { projectIsometric } from '../../src/game/phaser/isometricProjection';

const origin = { x: 1400, y: 80 };
const enemy: IsometricTarget = { kind: 'ENEMY', id: 'enemy', position: { x: 600, y: 500 },
  hitRadius: 43, alive: true, bodyHeight: 44, bodyHalfWidth: 20 };
const pick = (point: { x: number; y: number }, targets: IsometricTarget[] = [],
  walkable = true, uiCaptured = false) => pickIsometricPointer({
    projected: point, origin, targets, uiCaptured, canWalk: () => walkable
  });

describe('Issue #210: isometric pointer picking', () => {
  it('returns Cartesian ground coordinates after camera projection', () => {
    const ground = { x: 320.5, y: 670 };
    expect(pick(projectIsometric(ground, 0, origin))).toEqual({
      ground, aim: ground, context: { kind: 'GROUND', position: ground }
    });
  });
  it('picks the upright body and aims at the real enemy foot', () => {
    const head = projectIsometric(enemy.position, 40, origin);
    const hit = pick(head, [enemy]);
    expect(hit.context).toEqual({ kind: 'ENEMY', id: 'enemy' });
    expect(hit.aim).toEqual(enemy.position);
    expect(hit.ground).not.toEqual(enemy.position);
    expect(pick(head, [{ ...enemy, alive: false }]).context.kind).toBe('GROUND');
  });
  it('uses near ground depth for overlapping upright bodies, independent of order', () => {
    const behind = { ...enemy, id: 'behind', position: { x: 590, y: 490 } };
    const point = projectIsometric(enemy.position, 25, origin);
    for (const targets of [[enemy, behind], [behind, enemy]]) {
      expect(pick(point, targets).context).toEqual({ kind: 'ENEMY', id: 'enemy' });
    }
  });
  it('keeps UI capture and blocked ground semantics', () => {
    const point = projectIsometric(enemy.position, 20, origin);
    expect(pick(point, [enemy], false, true).context.kind).toBe('UI');
    expect(pick(point, [], false).context.kind).toBe('INVALID');
    expect(pick(point, [enemy], false).context.kind).toBe('ENEMY');
  });
  it('keeps existing loot and portal ground picking', () => {
    const loot: IsometricTarget = { kind: 'LOOT', id: 'loot', position: { x: 700, y: 600 },
      hitRadius: 30, bodyHeight: 0, bodyHalfWidth: 0 };
    expect(pick(projectIsometric(loot.position, 0, origin), [loot]).context)
      .toEqual({ kind: 'LOOT', id: 'loot' });
  });
});
