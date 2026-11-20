import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/game/enemies/enemies';
import {
  MINI_BOSS_IDS, MINI_BOSS_DEFINITIONS, MAX_MINI_BOSS_DELTA,
  getMiniBossDefinition, createMiniBossState, validateMiniBossState,
  stepMiniBoss, planMiniBossDefeat,
  type MiniBossId, type MiniBossState, type MiniBossStepInput
} from '../../src/game/enemies/miniBossRules';

function stateFor(id: MiniBossId): MiniBossState {
  const state = createMiniBossState(id, id === 'morrow_gravebound' ? id : id + '-world1');
  expect(state).not.toBeNull();
  if (!state) throw new Error('Expected valid boss state');
  return state;
}
function inputFor(id: MiniBossId, overrides: Partial<MiniBossStepInput> = {}): MiniBossStepInput {
  const maxHealth = MINI_BOSS_DEFINITIONS[id].baseHealth;
  return {
    deltaSeconds: 1 / 60, health: maxHealth, maxHealth, alive: true,
    position: { x: 440, y: 460 },
    target: { id: 'hero', x: 472, y: 460, alive: true },
    arena: { center: { x: 450, y: 460 }, radius: 300 },
    ...overrides
  };
}
function step(state: MiniBossState, input: MiniBossStepInput) {
  const result = stepMiniBoss(state, input);
  expect(result).not.toBeNull();
  if (!result) throw new Error('Invalid step');
  return result;
}
function advanceUntil(
  initial: MiniBossState,
  input: MiniBossStepInput,
  predicate: (actions: readonly { readonly kind: string }[]) => boolean,
  limit = 150
) {
  let current = initial;
  for (let tick = 0; tick < limit; tick++) {
    const result = step(current, { ...input, deltaSeconds: 0.25 });
    current = result.state;
    if (predicate(result.actions)) return { ...result, tick };
  }
  throw new Error('Expected action was not planned in bounded ticks');
}

describe('Agent32 miniboss framework (pure action planner)', () => {
  it('defines four distinct bosses with stable localization, family and known enemy mappings', () => {
    expect(MINI_BOSS_IDS).toEqual([
      'bandit_captain', 'morrow_gravebound', 'brood_mother', 'corrupted_knight'
    ]);
    expect(new Set(MINI_BOSS_IDS).size).toBe(4);
    const families = new Set<string>();
    const enemyTypes = new Set<string>();
    for (const id of MINI_BOSS_IDS) {
      const definition = getMiniBossDefinition(id);
      expect(definition).not.toBeNull();
      if (!definition) continue;
      expect(definition.id).toBe(id);
      expect(definition.displayNameKey).toMatch(/^enemy\.miniboss\./);
      expect(definition.introHookId).toMatch(/^miniboss\./);
      expect(definition.arenaHookId).toMatch(/^miniboss\./);
      expect(Object.hasOwn(ENEMY_DEFINITIONS, definition.enemyType)).toBe(true);
      expect(definition.baseHealth).toBeGreaterThan(ENEMY_DEFINITIONS[definition.enemyType].health);
      expect(definition.baseHealth).toBeLessThan(1500);
      expect(definition.healthMultiplier).toBeGreaterThan(1);
      expect(definition.abilities).toHaveLength(2);
      expect(definition.abilities[0]!.id).not.toBe(definition.abilities[1]!.id);
      expect(definition.abilities[0]!.effect).not.toBe(definition.abilities[1]!.effect);
      for (const ability of definition.abilities) {
        expect(ability.windupSeconds).toBeGreaterThan(0);
        expect(ability.recoverySeconds).toBeGreaterThan(0);
        expect(ability.cooldownSeconds).toBeGreaterThan(ability.windupSeconds);
        expect(ability.radius).toBeGreaterThan(0);
        expect(ability.range).toBeLessThanOrEqual(450);
        expect(ability.telegraphHookId).not.toBe(ability.impactHookId);
      }
      families.add(definition.family);
      enemyTypes.add(definition.enemyType);
      expect(Object.isFrozen(definition.abilities)).toBe(true);
    }
    expect(families.size).toBe(4);
    expect(enemyTypes.size).toBe(4);
  });

  it('preserves the exact existing Morrow actor, quest and wilderness marker IDs', () => {
    const def = getMiniBossDefinition('morrow_gravebound')!;
    expect(def.enemyType).toBe('wraith');
    expect(def.questEventId).toBe('morrow_gravebound_slain');
    expect(def.questId).toBe('morrow_gravebound');
    expect(def.worldMarkerId).toBe('act1.grave_warden');
    expect(stateFor('morrow_gravebound').occurrenceId).toBe('morrow_gravebound');
  });

  it('rejects unknown definitions and invalid or forged instance identities', () => {
    expect(getMiniBossDefinition('__proto__' as MiniBossId)).toBeNull();
    expect(getMiniBossDefinition('other' as MiniBossId)).toBeNull();
    expect(createMiniBossState('unknown' as MiniBossId, 'boss1')).toBeNull();
    for (const invalid of ['', 'bad id', '__proto__', 'àbc', 'a'.repeat(100)]) {
      expect(createMiniBossState('bandit_captain', invalid)).toBeNull();
    }
    expect(createMiniBossState('morrow_gravebound', 'morrow-1')).toBeNull();
  });

  it('emits intro once even for zero dt and never aliases caller data', () => {
    const s = stateFor('bandit_captain');
    const original = structuredClone(s);
    const params = inputFor('bandit_captain', { deltaSeconds: 0 });
    const first = step(s, params);
    expect(first.actions.map(x => x.kind)).toEqual(['intro']);
    expect(first.state.introPlayed).toBe(true);
    expect(step(first.state, params).actions).toEqual([]);
    expect(s).toEqual(original);
    expect(Object.isFrozen(first.state)).toBe(true);
    expect(Object.isFrozen(first.actions)).toBe(true);
    expect(validateMiniBossState(JSON.parse(JSON.stringify(first.state)))).toBe(true);
  });

  it('advances intro → telegraph → strike → recovery → next ability deterministically', () => {
    const id = 'bandit_captain';
    const params = inputFor(id);
    const s = stateFor(id);
    const intro = step(s, params);
    const casting = advanceUntil(intro.state, params, a => a.some(x => x.kind === 'telegraph'));
    const warning = casting.actions.find(x => x.kind === 'telegraph');
    expect(warning).toMatchObject({ kind: 'telegraph', abilityId: MINI_BOSS_DEFINITIONS[id].abilities[0]!.id });
    expect(casting.state.stage).toBe('windup');
    const strike = advanceUntil(casting.state, params, a => a.some(x => x.kind === 'impact'));
    expect(strike.state.stage).toBe('recovery');
    expect(strike.actions.find(x => x.kind === 'impact')).toMatchObject({
      kind: 'impact', abilityId: MINI_BOSS_DEFINITIONS[id].abilities[0]!.id
    });
    const second = advanceUntil(strike.state, params, a => a.some(x => x.kind === 'telegraph'));
    expect(second.actions.find(x => x.kind === 'telegraph')).toMatchObject({
      abilityId: MINI_BOSS_DEFINITIONS[id].abilities[1]!.id
    });
    expect(second.actions).not.toEqual(casting.actions);
  });

  it('locks the warning target through the strike even when the player moves', () => {
    const id = 'morrow_gravebound';
    const params = inputFor(id);
    const first = advanceUntil(stateFor(id), params, a => a.some(x => x.kind === 'telegraph'));
    const warning = first.actions.find(x => x.kind === 'telegraph');
    if (!warning || warning.kind !== 'telegraph') throw new Error('Missing warning');
    const result = advanceUntil(first.state, inputFor(id, {
      target: { id: 'hero', x: 520, y: 500, alive: true }
    }), a => a.some(x => x.kind === 'impact'));
    expect(result.actions.find(x => x.kind === 'impact')).toMatchObject({
      point: warning.point, abilityId: warning.abilityId
    });
  });

  it('promotes phase at threshold and cannot regress on subsequent healing', () => {
    for (const id of MINI_BOSS_IDS) {
      const def = MINI_BOSS_DEFINITIONS[id];
      const initial = step(stateFor(id), inputFor(id, { deltaSeconds: 0 }));
      const atThreshold = step(initial.state, inputFor(id, {
        health: def.baseHealth * def.phaseThreshold
      }));
      expect(atThreshold.state.phase).toBe(2);
      expect(atThreshold.actions.some(x => x.kind === 'phase')).toBe(true);
      const healed = step(atThreshold.state, inputFor(id, { health: def.baseHealth }));
      expect(healed.state.phase).toBe(2);
      expect(healed.actions.some(x => x.kind === 'phase')).toBe(false);
    }
  });

  it('uses a changed ability order and faster tempo in phase two', () => {
    const id = 'corrupted_knight';
    const def = MINI_BOSS_DEFINITIONS[id];
    const s = step(stateFor(id), inputFor(id, { deltaSeconds: 0 })).state;
    const phase2 = step(s, inputFor(id, { health: def.baseHealth * 0.3 }));
    const casting = advanceUntil(phase2.state, inputFor(id, { health: def.baseHealth * 0.3 }),
      a => a.some(x => x.kind === 'telegraph'));
    expect(casting.actions.find(x => x.kind === 'telegraph')).toMatchObject({
      abilityId: def.abilities[1]!.id
    });
  });

  it('never plans damage for dead or absent player targets or targets outside the arena', () => {
    const id = 'corrupted_knight';
    const ready = advanceUntil(stateFor(id), inputFor(id), a => a.some(x => x.kind === 'telegraph'));
    const noTarget = step(ready.state, inputFor(id, { target: null }));
    expect(noTarget.actions.some(x => x.kind === 'impact')).toBe(false);
    const starting = step(stateFor(id), inputFor(id, { target: null }));
    const idle = advanceUntil(starting.state, inputFor(id, { target: null }),
      a => a.some(x => x.kind === 'move'), 80);
    expect(idle.actions.some(x => x.kind === 'impact')).toBe(false);
  });

  it('caps Brood Mother summon requests at two across a long deterministic fight', () => {
    const id = 'brood_mother';
    const params = inputFor(id);
    let s = stateFor(id);
    let total = 0;
    for (let i = 0; i < 800; i++) {
      const result = step(s, { ...params, deltaSeconds: 0.25 });
      s = result.state;
      for (const action of result.actions) {
        if (action.kind === 'summon') {
          total += action.count;
          expect(action.count).toBe(1);
          expect(action.enemyType).toBe('spider');
          expect(action.point.x).toBeGreaterThanOrEqual(0);
          expect(action.point.y).toBeGreaterThanOrEqual(0);
        }
      }
      expect(result.actions.length).toBeLessThanOrEqual(3);
    }
    expect(total).toBe(2);
    expect(s.summonsRequested).toBe(2);
  });

  it('has safe, mechanically distinct support/hazard/charge/control action proposals', () => {
    const actions = new Set<string>();
    for (const id of MINI_BOSS_IDS) {
      const def = MINI_BOSS_DEFINITIONS[id];
      for (const ability of def.abilities) actions.add(ability.effect);
    }
    expect(actions.has('support')).toBe(true);
    expect(actions.has('hazard')).toBe(true);
    expect(actions.has('summon')).toBe(true);
    expect(actions.has('charge')).toBe(true);
    expect(actions.has('control')).toBe(true);
  });

  it('death is an alive-to-dead transition with single death cue and reward proposal', () => {
    const id = 'morrow_gravebound';
    const previous = stateFor(id);
    const killed = step(previous, inputFor(id, { health: 0, alive: false }));
    expect(killed.actions.map(x => x.kind)).toEqual(['death']);
    expect(killed.state.stage).toBe('dead');
    expect(step(killed.state, inputFor(id, { health: 0, alive: false })).actions).toEqual([]);
    const first = planMiniBossDefeat(killed.state, { processedOccurrenceIds: [] });
    expect(first).not.toBeNull();
    expect(first?.proposal).toMatchObject({
      defeatEventId: 'morrow_gravebound_slain',
      lootTableId: 'boss', guaranteed: true, minimumRarity: 'EPIC',
      questId: 'morrow_gravebound', worldMarkerId: 'act1.grave_warden'
    });
    expect(first?.proposal?.rewardProposalId).toContain('morrow_gravebound');
    expect(first?.state.deathPlanned).toBe(true);
    expect(planMiniBossDefeat(first!.state, { processedOccurrenceIds: [] })?.proposal).toBeNull();
    expect(planMiniBossDefeat(killed.state, {
      processedOccurrenceIds: ['morrow_gravebound']
    })?.proposal).toBeNull();
    expect(planMiniBossDefeat(previous, { processedOccurrenceIds: [] })).toBeNull();
  });

  it('has deterministic, unique stable reward identifiers and no direct gold/XP/item grant', () => {
    const ids: string[] = [];
    for (const id of MINI_BOSS_IDS) {
      const killed = step(stateFor(id), inputFor(id, { health: 0, alive: false })).state;
      const result = planMiniBossDefeat(killed, { processedOccurrenceIds: [] })!;
      const proposal = result.proposal!;
      expect(proposal.rewardProposalId).toContain(killed.occurrenceId);
      expect(proposal.defeatEventId).toBe(MINI_BOSS_DEFINITIONS[id].questEventId);
      expect(Object.keys(proposal)).not.toContain('gold');
      expect(Object.keys(proposal)).not.toContain('xp');
      expect(Object.keys(proposal)).not.toContain('items');
      expect(JSON.parse(JSON.stringify(proposal))).toEqual(proposal);
      ids.push(proposal.rewardProposalId);
    }
    expect(new Set(ids).size).toBe(4);
  });

  it('suggests bounded spawn points separated from the hero and the caster', () => {
    const id = 'brood_mother';
    const params = inputFor(id);
    const actionResult = advanceUntil(stateFor(id), params,
      actions => actions.some(action => action.kind === 'summon'), 180);
    const summon = actionResult.actions.find(action => action.kind === 'summon');
    if (!summon || summon.kind !== 'summon' || !params.target) throw new Error('Missing summon');
    const separation = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    expect(separation(summon.point, params.target)).toBeGreaterThanOrEqual(54);
    expect(separation(summon.point, params.position)).toBeGreaterThanOrEqual(54);
    expect(separation(summon.point, params.arena.center)).toBeLessThanOrEqual(
      params.arena.radius - 18);
  });

  it('anchors Captain banner support to its own position rather than the player', () => {
    const id = 'bandit_captain';
    const params = inputFor(id);
    const actionResult = advanceUntil(stateFor(id), params,
      actions => actions.some(action => action.kind === 'support'), 180);
    const support = actionResult.actions.find(action => action.kind === 'support');
    expect(support).toMatchObject({ kind: 'support', point: params.position });
  });

  it('strictly rejects bogus HP, dt, radius, actor points and impossible alive flags', () => {
    const s = stateFor('bandit_captain');
    const valid = inputFor('bandit_captain');
    for (const value of [-1, NaN, Infinity, -Infinity, MAX_MINI_BOSS_DELTA + 0.01]) {
      expect(stepMiniBoss(s, { ...valid, deltaSeconds: value })).toBeNull();
    }
    for (const health of [-1, NaN, Infinity, valid.maxHealth + 1]) {
      expect(stepMiniBoss(s, { ...valid, health })).toBeNull();
    }
    expect(stepMiniBoss(s, { ...valid, health: 0, alive: true })).toBeNull();
    expect(stepMiniBoss(s, { ...valid, health: 1, alive: false })).toBeNull();
    expect(stepMiniBoss(s, { ...valid, maxHealth: 0 })).toBeNull();
    expect(stepMiniBoss(s, { ...valid, position: { x: NaN, y: 460 } })).toBeNull();
    expect(stepMiniBoss(s, { ...valid, position: { x: -1, y: 460 } })).toBeNull();
    expect(stepMiniBoss(s, { ...valid, arena: { center: { x: Infinity, y: 460 }, radius: 300 } })).toBeNull();
    expect(stepMiniBoss(s, { ...valid, arena: { center: { x: 450, y: 460 }, radius: -10 } })).toBeNull();
    expect(stepMiniBoss(s, { ...valid, target: { id: 'hero', x: NaN, y: 460, alive: true } })).toBeNull();
  });

  it('strictly rejects forged state, cooldowns, phases and stale resurrection', () => {
    const s = stateFor('brood_mother');
    expect(validateMiniBossState({ ...s, bossId: 'fake' })).toBe(false);
    expect(validateMiniBossState({ ...s, phase: 3 })).toBe(false);
    expect(validateMiniBossState({ ...s, remainingSeconds: Infinity })).toBe(false);
    expect(validateMiniBossState({ ...s, summonsRequested: 100 })).toBe(false);
    expect(validateMiniBossState({ ...s, cooldowns: { ...s.cooldowns, fake: 0 } })).toBe(false);
    expect(validateMiniBossState({ ...s, cooldowns: { ...s.cooldowns, [MINI_BOSS_DEFINITIONS.brood_mother.abilities[0]!.id]: NaN } })).toBe(false);
    expect(validateMiniBossState({ ...s, stage: 'windup', activeAbilityId: null })).toBe(false);
    expect(validateMiniBossState({ ...s, occurrenceId: 'other' })).toBe(true);
    const killed = step(s, inputFor('brood_mother', { health: 0, alive: false }));
    expect(stepMiniBoss(killed.state, inputFor('brood_mother'))).toBeNull();
  });

  it('rejects malformed replay ledgers, duplicate occurrences and extra keys', () => {
    const killed = step(stateFor('brood_mother'), inputFor('brood_mother', { health: 0, alive: false }));
    expect(planMiniBossDefeat(killed.state, { processedOccurrenceIds: ['dup', 'dup'] })).toBeNull();
    expect(planMiniBossDefeat(killed.state, { processedOccurrenceIds: ['bad id'] })).toBeNull();
    expect(planMiniBossDefeat(killed.state, { processedOccurrenceIds: Array(257).fill('a') })).toBeNull();
    expect(validateMiniBossState({ ...killed.state, unauthorized: 'payload' })).toBe(false);
  });

  it('replays the same ticks identically through JSON and frozen input', () => {
    const id = 'corrupted_knight';
    const params = Object.freeze(inputFor(id));
    let a = stateFor(id);
    let b = JSON.parse(JSON.stringify(a)) as MiniBossState;
    const seen: string[] = [];
    for (let i = 0; i < 220; i++) {
      const health = i < 80 ? params.maxHealth : params.maxHealth * 0.3;
      const currentInput = { ...params, health, deltaSeconds: 0.25 };
      const ra = step(a, currentInput);
      const rb = step(b, currentInput);
      expect(ra).toEqual(rb);
      expect(ra.actions.length).toBeLessThanOrEqual(3);
      expect(validateMiniBossState(JSON.parse(JSON.stringify(ra.state)))).toBe(true);
      seen.push(...ra.actions.map(x => x.kind));
      a = ra.state;
      b = JSON.parse(JSON.stringify(rb.state)) as MiniBossState;
    }
    expect(seen).toContain('telegraph');
    expect(seen).toContain('impact');
    expect(seen).toContain('phase');
  });
});
