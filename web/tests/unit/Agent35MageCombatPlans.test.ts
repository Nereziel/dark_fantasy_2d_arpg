// GPL-3.0-only — Prompt 40, Agent 35. RED specs for deterministic Mage effects.
import { describe, expect, it } from 'vitest';
import {
  planMageChain, planMageArea, planMageTeleport, createMageZone,
  stepMageZone, validMageZone, planMageBarrier
} from '../../src/game/skills/mageCombatPlans';
const from = { x: 200, y: 200 };
const entities = [
  { id: 'z', x: 240, y: 200, alive: true },
  { id: 'c', x: 345, y: 200, alive: true },
  { id: 'b', x: 350, y: 200, alive: true },
  { id: 'a', x: 350, y: 200, alive: true },
  { id: 'dead', x: 250, y: 210, alive: false }
];
const wall = [{ id: 'wall', x: 270, y: 170, width: 40, height: 65 }];

describe('Prompt 40 Mage deterministic combat plans', () => {
  it('chooses the primary chain target and stable nearest subsequent entities without duplicate hits', () => {
    const plan = planMageChain(from, 'z', entities, { maxHits: 4, hopRange: 130, maxRange: 320, obstacles: [] });
    expect(plan).toEqual([
      { id: 'z', multiplier: 1 },
      { id: 'c', multiplier: 0.82 },
      { id: 'a', multiplier: 0.64 },
      { id: 'b', multiplier: 0.46 }
    ]);
    expect(planMageChain(from, 'dead', entities, { maxHits: 3, hopRange: 200, maxRange: 320, obstacles: [] })).toEqual([]);
    expect(planMageChain(from, 'missing', entities, { maxHits: 3, hopRange: 200, maxRange: 320, obstacles: [] })).toEqual([]);
    expect(planMageChain(from, 'z', entities, { maxHits: 2, hopRange: 70, maxRange: 320, obstacles: [] }))
      .toEqual([{ id: 'z', multiplier: 1 }]);
    expect(planMageChain(from, 'z', [...entities].reverse(), { maxHits: 4, hopRange: 130, maxRange: 320, obstacles: [] }))
      .toEqual(plan);
  });

  it('rejects bad chain data, duplicate IDs, forged positions and blocked line of sight', () => {
    expect(planMageChain(from, 'z', [...entities, entities[0]!], { maxHits: 4, hopRange: 130, maxRange: 320, obstacles: [] })).toEqual([]);
    expect(planMageChain(from, 'z', [{ id: 'z', x: NaN, y: 1, alive: true }], { maxHits: 3, hopRange: 130, maxRange: 320, obstacles: [] })).toEqual([]);
    expect(planMageChain(from, 'c', entities, { maxHits: 3, hopRange: 130, maxRange: 320, obstacles: wall })).toEqual([]);
    expect(planMageChain(from, 'z', entities, { maxHits: 0, hopRange: 130, maxRange: 320, obstacles: [] })).toEqual([]);
    expect(planMageChain(from, 'z', entities, { maxHits: 1000, hopRange: 130, maxRange: 320, obstacles: [] })).toEqual([]);
  });

  it('applies circular area plans with canonical line-of-sight and stable sorting', () => {
    expect(planMageArea(from, 55, entities, [])).toEqual(['z']);
    expect(planMageArea(from, 180, entities, [])).toEqual(['a', 'b', 'c', 'z']);
    expect(planMageArea(from, 180, entities, wall)).toEqual(['z']);
    expect(planMageArea(from, -1, entities, [])).toEqual([]);
    expect(planMageArea(from, Infinity, entities, [])).toEqual([]);
    expect(planMageArea(from, 200, [{ id: 'bad', x: 240, y: Infinity, alive: true }], [])).toEqual([]);
  });

  it('allows only walkable, in-range teleports without wall tunneling', () => {
    expect(planMageTeleport(from, { x: 320, y: 200 }, 200, [])).toEqual({ x: 320, y: 200 });
    expect(planMageTeleport(from, { x: 360, y: 200 }, 220, wall)).toBeNull();
    expect(planMageTeleport(from, { x: 300, y: 200 }, 220, wall)).toBeNull();
    expect(planMageTeleport(from, { x: 600, y: 200 }, 150, [])).toBeNull();
    expect(planMageTeleport(from, { x: 4, y: 10 }, 500, [])).toBeNull();
    expect(planMageTeleport(from, { x: NaN, y: 200 }, 500, [])).toBeNull();
    expect(planMageTeleport(from, { x: 2201, y: 200 }, 3000, [])).toBeNull();
  });

  it('advances Blizzard zones at fixed ticks deterministically without double-hitting on render ticks', () => {
    const zone = createMageZone('mage-blizzard-1', 'hero', from, 60, 2, 0.5, 'frost');
    expect(zone).not.toBeNull();
    expect(validMageZone(zone)).toBe(true);
    if (!zone) return;
    const first = stepMageZone(zone, 0.2, entities, []);
    expect(first).toMatchObject({ done: false, pulses: [] });
    if (!first?.zone) throw new Error('Expected active Mage zone after first tick');
    const second = stepMageZone(first.zone, 0.3, entities, []);
    expect(second).toMatchObject({ done: false, pulses: [['z']] });
    if (!second?.zone) throw new Error('Expected active Mage zone after second tick');
    const third = stepMageZone(second.zone, 1, entities, []);
    expect(third).toMatchObject({ done: false, pulses: [['z'], ['z']] });
    if (!third?.zone) throw new Error('Expected active Mage zone after third tick');
    const fourth = stepMageZone(third.zone, 0.5, entities, []);
    expect(fourth).toMatchObject({ done: true, zone: null, pulses: [['z']] });
    expect(stepMageZone(zone, -1, entities, [])).toBeNull();
    expect(stepMageZone(zone, 10, entities, [])).toBeNull();
    expect(stepMageZone({ ...zone, remaining: Infinity }, 0.1, entities, [])).toBeNull();
    expect(createMageZone('bad', 'hero', from, 5000, 2, 0.5, 'frost')).toBeNull();
    expect(createMageZone('__proto__', 'hero', from, 100, 2, 0.5, 'frost')).toBeNull();
  });

  it('provides bounded Arcane Barrier shield plans without healing or mutation', () => {
    expect(planMageBarrier(400, 25, 0.25)).toBe(125);
    expect(planMageBarrier(400, 0, 0)).toBe(100);
    expect(planMageBarrier(-1, 25, 0.25)).toBeNull();
    expect(planMageBarrier(Infinity, 25, 0.25)).toBeNull();
    expect(planMageBarrier(400, 25, -0.25)).toBeNull();
    expect(planMageBarrier(400, 25, 100)).toBeNull();
  });
});
