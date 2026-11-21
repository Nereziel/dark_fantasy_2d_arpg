/**
 * Issue #128: exact combat event -> renderer feedback handoff.
 * This test intentionally drives the real deterministic simulation rather
 * than fabricating event geometry in a test-only mock.
 * GPL-3.0-only.
 */
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { getMiniBossDefinition } from '../../src/game/enemies/miniBossRules';
import { planCombatReadability } from '../../src/game/phaser/combatReadabilityPlan';
import type { GameEvent } from '../../src/game/core/types';

function encounter(seed: number, markerId: string): GameSimulation {
  const sim = new GameSimulation(seed);
  const marker = buildWilderness(seed).features.find(feature => feature.id === markerId);
  expect(marker).toBeDefined();
  const initial = sim.snapshot();
  expect(sim.restore({ ...initial, player: {
    ...initial.player, x: marker!.position.x, y: marker!.position.y
  } })).toBe(true);
  return sim;
}

function collectTelegraphs(sim: GameSimulation, bossId: string): Extract<GameEvent, {type: 'miniBossCue'}>[] {
  const out: Extract<GameEvent, {type: 'miniBossCue'}>[] = [];
  for (let tick = 0; tick < 250; tick++) {
    sim.advance(16.667);
    for (const event of sim.drainEvents()) {
      if (event.type === 'miniBossCue' && event.bossId === bossId
        && event.kind === 'telegraph') out.push(event);
    }
  }
  return out;
}

describe('Issue 128: miniboss telegraph event roundtrip', () => {
  it.each([
    ['wild.encounter.1', 'bandit_captain'],
    ['wild.poi.1', 'corrupted_knight']
  ])('forwards real shape, origin, width, range and windup for %s', (markerId, bossId) => {
    const sim = encounter(42, markerId);
    const warnings = collectTelegraphs(sim, bossId);
    expect(warnings.length).toBeGreaterThan(0);
    const definitions = getMiniBossDefinition(bossId as 'bandit_captain' | 'corrupted_knight')!;
    for (const event of warnings) {
      const spec = definitions.abilities.find(a => a.id === event.abilityId);
      expect(spec).toBeDefined();
      expect(event.shape).toBe(spec!.shape);
      expect(event.range).toBe(spec!.range);
      expect(event.radius).toBe(spec!.radius);
      expect(event.durationSeconds).toBe(spec!.windupSeconds);
      expect(event.origin).toEqual({
        x: expect.any(Number), y: expect.any(Number)
      });
      const cue = planCombatReadability({
        type: 'telegraph', threat: 'miniboss',
        shape: event.shape, position: { x: event.x, y: event.y },
        radius: event.radius, origin: event.origin,
        range: event.range, durationSeconds: event.durationSeconds
      });
      expect(cue).not.toBeNull();
      if (event.shape !== 'circle') {
        expect(cue?.ring).toBe(false);
        expect(cue?.polygon?.length).toBeGreaterThanOrEqual(4);
        expect(cue?.position).toEqual(event.origin);
      } else {
        expect(cue?.ring).toBe(true);
        expect(cue?.position).toEqual({ x: event.x, y: event.y });
      }
    }
  });
});
