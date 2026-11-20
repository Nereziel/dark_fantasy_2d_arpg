import { describe, expect, it } from 'vitest';
import {
  createHollowKingState, stepHollowKing, validateHollowKingState,
  planHollowKingDefeat, projectHollowKingBossBar,
  type HollowKingState, type HollowKingArena,
  type HollowKingActionPlan, type HollowKingStepSuccess
} from '../../src/game/bosses/hollowKingPhases';

const ARENA: HollowKingArena = Object.freeze({
  bounds: Object.freeze({ x: 1280, y: 520, width: 480, height: 400 }),
  bossSpawn: Object.freeze({ x: 1530, y: 695 }),
  safePoint: Object.freeze({ x: 1710, y: 850 }),
  escapePoint: Object.freeze({ x: 1310, y: 710 }),
  exitPosition: Object.freeze({ x: 310, y: 705 }),
  walls: Object.freeze([])
});
const TARGET = Object.freeze({ x: 1600, y: 775 });
function fresh(seed = 42): HollowKingState {
  return createHollowKingState(`crypt/${seed}/hollow-king`, seed, ARENA, 500);
}
function next(state: HollowKingState, health = state.health, dt = 0.25) {
  return stepHollowKing(state, {
    expectedRevision: state.revision, deltaSeconds: dt, currentHealth: health, target: TARGET
  });
}
function success(state: HollowKingState, health = state.health, dt = 0.25): HollowKingStepSuccess {
  const result = next(state, health, dt);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error);
  return result;
}
function run(
  start: HollowKingState,
  count: number,
  select?: (state: HollowKingState) => Parameters<typeof stepHollowKing>[1]
): { state: HollowKingState; actions: HollowKingActionPlan[] } {
  let state = start;
  const actions: HollowKingActionPlan[] = [];
  for (let i = 0; i < count; i++) {
    const input = select?.(state) ?? {
      expectedRevision: state.revision, deltaSeconds: 0.25,
      currentHealth: state.health, target: TARGET
    };
    const result = stepHollowKing(state, input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error);
    state = result.state;
    actions.push(...result.actions);
  }
  return { state, actions };
}
function toPhase(phase: 1 | 2 | 3, seed = 42): HollowKingState {
  const state = fresh(seed);
  return phase === 1 ? state : success(state, phase === 2 ? 349 : 170, 0).state;
}
function inside(point: { x: number; y: number }, radius = 0) {
  const b = ARENA.bounds;
  return point.x - radius >= b.x && point.y - radius >= b.y
    && point.x + radius <= b.x + b.width
    && point.y + radius <= b.y + b.height;
}

describe('Agent 33 — The Hollow King phase machine', () => {
  it('uses legacy identity, a canonical seeded encounter and immutable JSON state', () => {
    const state = fresh(42);
    expect(state).toMatchObject({
      encounterId: 'crypt/42/hollow-king', seed: 42, actorId: 'crypt_lord-4',
      enemyType: 'crypt_lord', health: 500, maxHealth: 500,
      phase: 1, mode: 'idle', revision: 0, deathEmitted: false
    });
    expect(validateHollowKingState(state)).toBe(true);
    expect(validateHollowKingState(JSON.parse(JSON.stringify(state)))).toBe(true);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.arena.bounds)).toBe(true);
    expect(Object.isFrozen(state.hazards)).toBe(true);
    expect(Object.isFrozen(state.addRequests)).toBe(true);
    const ui = projectHollowKingBossBar(state);
    expect(ui).toMatchObject({
      actorId: 'crypt_lord-4', health: 500, maxHealth: 500,
      hpFraction: 1, phase: 1, nameKey: 'boss.hollowKing.name',
      phaseKey: 'boss.hollowKing.phase1', exitLocked: false
    });
    expect(Object.isFrozen(ui)).toBe(true);
    expect(ui.warning).toBeNull();
  });

  it.each([
    [500, 1, false], [350, 1, false], [349.995, 2, false],
    [175, 2, false], [174.995, 3, false], [5, 3, false],
    [0, 3, true]
  ] as const)('crosses precise HP threshold at %s with phase %s', (health, expected, dead) => {
    const result = success(fresh(), health, 0);
    expect(result.state.phase).toBe(expected);
    expect(result.state.mode === 'dead').toBe(dead);
    expect(validateHollowKingState(result.state)).toBe(true);
    expect(result.bossUi.hpFraction).toBeCloseTo(health / 500, 7);
  });

  it('skips directly from P1 to P3 and never regresses after healing', () => {
    const state = fresh();
    const skipped = success(state, 100, 0);
    expect(skipped.state.phase).toBe(3);
    expect(skipped.actions.filter(a => a.type === 'phaseChanged'))
      .toEqual([expect.objectContaining({ from: 1, to: 3 })]);
    const healed = success(skipped.state, 500, 0);
    expect(healed.state.phase).toBe(3);
    expect(healed.state.health).toBe(500);
    expect(healed.actions.some(a => a.type === 'phaseChanged')).toBe(false);
    expect(projectHollowKingBossBar(healed.state).phase).toBe(3);
  });

  it('never emits damage before a positive readable windup; enforces impact and recovery', () => {
    let state = fresh();
    let sawTelegraph = false;
    let sawHit = false;
    let sawRecovery = false;
    let activeWarningId = '';
    for (let i = 0; i < 40; i++) {
      const r = success(state);
      state = r.state;
      for (const action of r.actions) {
        if (action.type === 'telegraph') {
          sawTelegraph = true;
          activeWarningId = action.warning.id;
          expect(action.warning.windupSeconds).toBeGreaterThanOrEqual(0.5);
          expect(action.warning.windupSeconds).toBeLessThanOrEqual(2);
          expect(action.warning.opacity).toBeGreaterThanOrEqual(0.4);
          expect(action.warning.geometry.radius).toBeGreaterThan(0);
          expect(inside(action.warning.geometry.position, action.warning.geometry.radius)).toBe(true);
          expect(action.warning.geometry.angleRadians).toBeGreaterThanOrEqual(-Math.PI);
          expect(action.warning.geometry.angleRadians).toBeLessThanOrEqual(Math.PI);
          expect(Object.isFrozen(action.warning)).toBe(true);
        }
        if (action.type === 'hitWindow') {
          expect(sawTelegraph).toBe(true);
          expect(action.warningId).toBe(activeWarningId);
          expect(action.maxDamage).toBeGreaterThan(0);
          expect(action.maxDamage).toBeLessThanOrEqual(32);
          expect(action.durationSeconds).toBeGreaterThan(0);
          sawHit = true;
        }
      }
      if (sawHit && state.mode === 'recovery') {
        sawRecovery = true;
        expect(state.timerSeconds).toBeGreaterThan(0);
        break;
      }
    }
    expect([sawTelegraph, sawHit, sawRecovery]).toEqual([true, true, true]);
  });

  it('provides mechanically distinct ability rotations in all three phases with stable IDs', () => {
    const patterns = [
      ['royal_cleave', 'grave_lunge'],
      ['raise_dead', 'grave_circle'],
      ['rune_storm', 'kings_judgment']
    ] as const;
    for (const phase of [1, 2, 3] as const) {
      const starting = toPhase(phase, 1);
      const produced = run(starting, 85).actions;
      const telegraphs = produced.filter(a => a.type === 'telegraph');
      const ids = telegraphs.map(a => a.warning.id);
      const abilities = new Set(telegraphs.map(a => a.warning.ability));
      for (const pattern of patterns[phase - 1]) expect(abilities.has(pattern)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      // P2/P3 transition tick may have emitted the first telegraph before this trace.
      expect(produced.filter(a => a.type === 'hitWindow').length)
        .toBeLessThanOrEqual(telegraphs.length + Number(starting.mode === 'telegraph'));
      expect(produced.length).toBeLessThan(85 * 5);
    }
  });

  it('never softlocks: P2 summons bounded adds and preserves a designated safe escape lane', () => {
    const phase2 = toPhase(2, 3);
    const result = run(phase2, 120);
    const addActions = result.actions.filter(a => a.type === 'spawnAdd');
    expect(addActions.length).toBeGreaterThan(0);
    expect(addActions.length).toBeLessThanOrEqual(3);
    expect(new Set(addActions.map(a => a.add.id)).size).toBe(addActions.length);
    expect(result.state.addRequests.length).toBeLessThanOrEqual(3);
    expect(result.state.arena.exitPosition).toEqual(ARENA.exitPosition);
    expect(projectHollowKingBossBar(result.state).exitLocked).toBe(false);
    for (const action of addActions) {
      expect(inside(action.add.position, 18)).toBe(true);
      expect(Math.hypot(
        action.add.position.x - ARENA.safePoint.x, action.add.position.y - ARENA.safePoint.y
      )).toBeGreaterThan(76);
      expect(Math.hypot(
        action.add.position.x - ARENA.escapePoint.x, action.add.position.y - ARENA.escapePoint.y
      )).toBeGreaterThan(76);
    }
    const freed = stepHollowKing(result.state, {
      expectedRevision: result.state.revision,
      deltaSeconds: 0, currentHealth: result.state.health, target: TARGET,
      resolvedAddIds: result.state.addRequests.map(a => a.id)
    });
    expect(freed.ok).toBe(true);
    if (freed.ok) expect(freed.state.addRequests).toHaveLength(0);
  });

  it('P2 arena control and P3 runes have finite, non-blocking, expiring hazards', () => {
    for (const phase of [2, 3] as const) {
      const { actions, state } = run(toPhase(phase, 10), 130);
      const created = actions.filter(a => a.type === 'hazardStart');
      const expired = actions.filter(a => a.type === 'hazardExpire');
      expect(created.length).toBeGreaterThan(0);
      expect(expired.length).toBeGreaterThan(0);
      expect(state.hazards.length).toBeLessThanOrEqual(2);
      for (const action of created) {
        const { hazard } = action;
        expect(hazard.durationSeconds).toBeGreaterThan(0);
        expect(hazard.durationSeconds).toBeLessThanOrEqual(3);
        expect(inside(hazard.position, hazard.radius)).toBe(true);
        for (const safePoint of [ARENA.safePoint, ARENA.escapePoint]) {
          expect(Math.hypot(hazard.position.x - safePoint.x, hazard.position.y - safePoint.y))
            .toBeGreaterThanOrEqual(hazard.radius + 58);
        }
      }
      expect(new Set(created.map(a => a.hazard.id)).size).toBe(created.length);
    }
  });

  it('keeps warning and hazard action IDs globally unique across HP phase transitions', () => {
    const first = run(fresh(14), 40);
    const secondEntry = success(first.state, 340, 0);
    const second = run(secondEntry.state, 50);
    const thirdEntry = success(second.state, 170, 0);
    const third = run(thirdEntry.state, 70);
    const actions = [
      ...first.actions, ...secondEntry.actions,
      ...second.actions, ...thirdEntry.actions, ...third.actions
    ];
    const warningIds = actions.filter(a => a.type === 'telegraph').map(a => a.warning.id);
    const hazardIds = actions.filter(a => a.type === 'hazardStart').map(a => a.hazard.id);
    const addIds = actions.filter(a => a.type === 'spawnAdd').map(a => a.add.id);
    expect(warningIds.length).toBeGreaterThan(10);
    expect(new Set(warningIds).size).toBe(warningIds.length);
    expect(new Set(hazardIds).size).toBe(hazardIds.length);
    expect(new Set(addIds).size).toBe(addIds.length);
  });

  it('does not alias caller-owned arena, state or action collections', () => {
    const arena = structuredClone(ARENA) as unknown as { bounds: { x: number; y: number; width: number; height: number }; bossSpawn: { x: number; y: number }; safePoint: { x: number; y: number }; escapePoint: { x: number; y: number }; exitPosition: { x: number; y: number }; walls: { x: number; y: number; width: number; height: number }[] };
    const start = createHollowKingState('crypt/77/hollow-king', 77, arena, 500);
    const before = JSON.stringify(start);
    arena.bounds.x += 100;
    arena.bossSpawn.x += 100;
    expect(start.arena.bounds.x).toBe(1280);
    expect(start.arena.bossSpawn.x).toBe(1530);
    const result = success(start);
    expect(JSON.stringify(start)).toBe(before);
    expect(result.state).not.toBe(start);
    expect(result.state.arena).not.toBe(start.arena);
    expect(Object.isFrozen(result.actions)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
  });

  it('plans the one true death with stable quest and reward IDs, no grants, and no duplication', () => {
    const state = fresh();
    expect(planHollowKingDefeat(state)).toEqual(expect.objectContaining({
      type: 'death', actorId: 'crypt_lord-4',
      defeatHookId: 'crypt_lord_slain', questId: 'crypt_lord_fallen',
      rewardPlanId: 'crypt/42/hollow-king/boss-guaranteed-loot'
    }));
    const died = success(state, 0, 0);
    const death = died.actions.filter(a => a.type === 'death');
    expect(death).toHaveLength(1);
    expect(death[0]).toEqual(planHollowKingDefeat(state));
    expect(died.state.deathEmitted).toBe(true);
    expect(planHollowKingDefeat(died.state)).toBeNull();
    for (const value of [0, 0, 0]) {
      const again = success(died.state, value, 0);
      expect(again.actions).toEqual([]);
      expect(again.state).toEqual(died.state);
      expect(again.bossUi.health).toBe(0);
    }
    expect(JSON.stringify(death[0])).not.toMatch(/"gold"|"xp"|"loot"/);
  });

  it('rejects invalid seed/identity/health/arena and retains 0xffffffff as valid seed', () => {
    expect(fresh(0xffffffff).seed).toBe(0xffffffff);
    for (const seed of [NaN, Infinity, -1, 1.5, 0x100000000]) {
      expect(() => createHollowKingState('crypt/1/hollow-king', seed, ARENA)).toThrow(RangeError);
    }
    for (const id of ['crypt/42/hollow-king', 'crypt/0/hollow-king/evil', 'crypt/1/hollow-king', 'bad']) {
      expect(() => createHollowKingState(id, 8, ARENA)).toThrow(RangeError);
    }
    for (const health of [0, -1, NaN, Infinity, 100001]) {
      expect(() => createHollowKingState('crypt/8/hollow-king', 8, ARENA, health)).toThrow(RangeError);
    }
    expect(() => createHollowKingState('crypt/8/hollow-king', 8, {
      ...ARENA, bossSpawn: { x: 0, y: 0 }
    })).toThrow(RangeError);
    expect(() => createHollowKingState('crypt/8/hollow-king', 8, {
      ...ARENA, safePoint: { x: 1510, y: 695 }
    })).toThrow(RangeError);
    expect(() => createHollowKingState('crypt/8/hollow-king', 8, {
      ...ARENA, walls: [{ x: 1510, y: 660, width: 90, height: 90 }]
    })).toThrow(RangeError);
  });

  it('fails closed on stale revisions, synthetic actors, unbounded time and malformed target', () => {
    const state = fresh();
    for (const input of [
      { expectedRevision: 99, deltaSeconds: 0.1, currentHealth: 500, target: TARGET },
      { expectedRevision: 0, deltaSeconds: -1, currentHealth: 500, target: TARGET },
      { expectedRevision: 0, deltaSeconds: 1000, currentHealth: 500, target: TARGET },
      { expectedRevision: 0, deltaSeconds: NaN, currentHealth: 500, target: TARGET },
      { expectedRevision: 0, deltaSeconds: 0.1, currentHealth: -1, target: TARGET },
      { expectedRevision: 0, deltaSeconds: 0.1, currentHealth: Infinity, target: TARGET },
      { expectedRevision: 0, deltaSeconds: 0.1, currentHealth: 501, target: TARGET },
      { expectedRevision: 0, deltaSeconds: 0.1, currentHealth: 500, target: { x: Infinity, y: 710 } },
      { expectedRevision: 0, deltaSeconds: 0.1, currentHealth: 500, target: { x: 1100, y: 700 } },
      { expectedRevision: 0, deltaSeconds: 0.1, currentHealth: 500, target: TARGET, actorId: 'spoofed-boss' }
    ]) {
      const result = stepHollowKing(state, input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(typeof result.error).toBe('string');
    }
    expect(state).toEqual(fresh());
  });

  it('rejects corrupted state or excessive arrays without hanging and supports JSON replay', () => {
    const state = fresh(0xffffffff);
    const restored = JSON.parse(JSON.stringify(state)) as HollowKingState;
    expect(run(state, 60)).toEqual(run(restored, 60));
    const corrupted: unknown[] = [
      { ...state, phase: 3 },
      { ...state, actorId: 'crypt_lord-999' },
      { ...state, encounterId: 'crypt/0/hollow-king' },
      { ...state, seed: Infinity },
      { ...state, health: NaN },
      { ...state, mode: 'telegraph', warning: null },
      { ...state, mode: 'dead', health: 1 },
      { ...state, timerSeconds: -1 },
      { ...state, revision: -1 },
      { ...state, hazards: Array(100).fill({ id: 'fake', radius: 10 }) },
      { ...state, addRequests: Array(50).fill({ id: 'fake' }) }
    ];
    for (const bad of corrupted) {
      expect(validateHollowKingState(bad)).toBe(false);
      const result = stepHollowKing(bad as HollowKingState, {
        expectedRevision: 0, deltaSeconds: 0.1, currentHealth: 500, target: TARGET
      });
      expect(result.ok).toBe(false);
    }
  });
});
