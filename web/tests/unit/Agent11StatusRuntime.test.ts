import { describe, expect, it } from 'vitest';
import {
  applyStatus, advanceStatuses, dispelStatuses, getStatusModifiers,
  type StatusInstance, type StatusRule
} from '../../src/game/status/statusRuntime';

const burning: StatusRule = {
  id: 'burning', duration: 5, magnitude: 2, stacking: 'refresh',
  tickInterval: 1, dispelCategory: 'magic', immunityTags: ['fire'],
  modifiers: { damageTaken: 0.1 }, visualHook: 'flames'
};
const apply = (rule: StatusRule = burning, source = 'mage', statuses: readonly StatusInstance[] = []) =>
  applyStatus(statuses, rule, source);

describe('Agent 11: independent status runtime', () => {
  it('applies a status with immutable, queryable runtime data and source', () => {
    const rule = Object.freeze({ ...burning, immunityTags: Object.freeze(['fire']), modifiers: Object.freeze({ damageTaken: 0.1 }) });
    const result = apply(rule);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'burning', sourceId: 'mage', remaining: 5, magnitude: 2,
      stacks: 1, tickElapsed: 0, tickInterval: 1, stacking: 'refresh',
      dispelCategory: 'magic', visualHook: 'flames'
    });
    expect(result[0].immunityTags).toEqual(['fire']);
    expect(getStatusModifiers(result)).toEqual({ damageTaken: 0.2 });
    expect(rule).toEqual(burning);
    expect(applyStatus(result, { ...burning, id: 'poisoned' }, 'rogue')).toHaveLength(2);
    expect(result).toHaveLength(1);
  });

  it('refreshes duration without losing tick progress or downgrading magnitude/source', () => {
    const first = apply();
    const progressed = advanceStatuses(first, 0.4).statuses;
    const refreshed = applyStatus(progressed, { ...burning, duration: 7, magnitude: 1 }, 'other');
    expect(refreshed[0]).toMatchObject({
      remaining: 7, magnitude: 2, stacks: 1, tickElapsed: 0.4, sourceId: 'mage'
    });
    const stronger = applyStatus(refreshed, { ...burning, duration: 2, magnitude: 4 }, 'boss');
    expect(stronger[0]).toMatchObject({ remaining: 7, magnitude: 4, sourceId: 'boss' });
    expect(progressed[0]).toMatchObject({ remaining: 4.6, magnitude: 2, sourceId: 'mage' });
  });

  it('adds stacks up to the cap, retaining the initial source for grouped stacks', () => {
    const rule: StatusRule = { ...burning, stacking: 'add', maxStacks: 3, duration: 4 };
    const once = apply(rule, 'first');
    const twice = applyStatus(once, rule, 'second');
    const thrice = applyStatus(twice, rule, 'third');
    const capped = applyStatus(thrice, rule, 'fourth');
    expect(once[0].stacks).toBe(1);
    expect(twice[0].stacks).toBe(2);
    expect(thrice[0].stacks).toBe(3);
    expect(capped[0]).toMatchObject({ stacks: 3, sourceId: 'first' });
    expect(getStatusModifiers(capped)).toEqual({ damageTaken: 0.6 });
    expect(advanceStatuses(capped, 1).ticks).toMatchObject([
      { statusId: 'burning', sourceId: 'first', stacks: 3, magnitude: 6 }
    ]);
  });

  it('replaces status and resets its source, stacks and tick phase', () => {
    const rule: StatusRule = { ...burning, stacking: 'replace' };
    const old = advanceStatuses(apply(rule, 'old'), 0.75).statuses;
    const replaced = applyStatus(old, { ...rule, duration: 2, magnitude: 9 }, 'new');
    expect(replaced[0]).toMatchObject({
      sourceId: 'new', magnitude: 9, remaining: 2, tickElapsed: 0, stacks: 1
    });
  });

  it('keeps only the strongest reapplication and respects refreshDuration=false', () => {
    const rule: StatusRule = { ...burning, stacking: 'strongest', duration: 6, magnitude: 3 };
    const prior = advanceStatuses(apply(rule, 'first'), 2).statuses;
    const weaker = applyStatus(prior, { ...rule, magnitude: 1, duration: 12, refreshDuration: false }, 'weak');
    expect(weaker[0]).toMatchObject({ magnitude: 3, sourceId: 'first', remaining: 4 });
    const stronger = applyStatus(weaker, { ...rule, magnitude: 8, duration: 1, refreshDuration: false }, 'strong');
    expect(stronger[0]).toMatchObject({ magnitude: 8, sourceId: 'strong', remaining: 4 });
  });

  it('honors immunity by exact effect ID or rule tag, without clearing existing effects', () => {
    expect(applyStatus([], burning, 'mage', ['burning'])).toEqual([]);
    expect(applyStatus([], burning, 'mage', ['fire'])).toEqual([]);
    expect(applyStatus([], burning, 'mage', ['cold'])).toHaveLength(1);
    const old = apply();
    expect(applyStatus(old, burning, 'other', ['fire'])).toEqual(old);
    expect(old[0].sourceId).toBe('mage');
  });

  it('ticks at each interval including the expiry boundary, but never after it', () => {
    const rule: StatusRule = { ...burning, duration: 2.5, tickInterval: 1 };
    const result = advanceStatuses(apply(rule), 50);
    expect(result.statuses).toEqual([]);
    expect(result.ticks).toHaveLength(2);
    expect(result.ticks.map(event => event.statusId)).toEqual(['burning', 'burning']);
    expect(result.ticks.every(event => event.sourceId === 'mage' && event.magnitude === 2)).toBe(true);
    expect(result.suppressedTicks).toBe(0);

    const exact = advanceStatuses(apply({ ...rule, duration: 2 }), 2);
    expect(exact.ticks).toHaveLength(2);
    expect(exact.statuses).toEqual([]);
  });

  it('produces the same ticks and final state for one large or many small advances', () => {
    const initial = apply({ ...burning, duration: 4.5, tickInterval: 0.5 });
    const whole = advanceStatuses(initial, 3.75);
    let partial = initial;
    const ticks = [];
    for (let i = 0; i < 15; i++) {
      const next = advanceStatuses(partial, 0.25);
      partial = next.statuses;
      ticks.push(...next.ticks);
    }
    expect(whole.ticks).toEqual(ticks);
    expect(whole.statuses).toEqual(partial);
    expect(whole.ticks).toHaveLength(7);
    expect(whole.statuses[0]).toMatchObject({ remaining: 0.75, tickElapsed: 0.25 });
  });

  it('supports independent timers, no-op advances and non-periodic statuses', () => {
    const statuses = applyStatus(apply(), {
      id: 'rooted', duration: 2, magnitude: 1, stacking: 'refresh',
      modifiers: { moveSpeed: -1 }
    }, 'warden');
    const before = structuredClone(statuses);
    const zero = advanceStatuses(statuses, 0);
    expect(zero.statuses).toEqual(statuses);
    expect(zero.ticks).toEqual([]);
    const result = advanceStatuses(statuses, 2);
    expect(result.statuses.map(status => status.id)).toEqual(['burning']);
    expect(result.ticks).toHaveLength(2);
    expect(statuses).toEqual(before);
  });

  it('dispels by category or id without mutating input and leaves other effects intact', () => {
    const effects = applyStatus(apply(), {
      id: 'poisoned', duration: 4, magnitude: 1, stacking: 'add',
      dispelCategory: 'poison'
    }, 'assassin');
    const noOp = dispelStatuses(effects, {});
    expect(noOp).toEqual(effects);
    expect(dispelStatuses(effects, { categories: ['magic'] }).map(e => e.id)).toEqual(['poisoned']);
    expect(dispelStatuses(effects, { ids: ['poisoned'] }).map(e => e.id)).toEqual(['burning']);
    expect(dispelStatuses(effects, { ids: ['burning'], categories: ['poison'] })).toEqual([]);
    expect(effects).toHaveLength(2);
  });

  it('combines finite stat modifiers, ignores invalid modifier entries and never mutates rules', () => {
    const effects = applyStatus(apply(), {
      id: 'fortified', duration: 3, magnitude: 2, stacking: 'add', maxStacks: 2,
      modifiers: { damageTaken: -0.15, armor: 3, ignored: Number.NaN }
    }, 'paladin');
    const stacked = applyStatus(effects, {
      id: 'fortified', duration: 3, magnitude: 2, stacking: 'add', maxStacks: 2,
      modifiers: { damageTaken: -0.15, armor: 3, ignored: Number.NaN }
    }, 'paladin');
    expect(getStatusModifiers(stacked)).toEqual({ damageTaken: -0.4, armor: 12 });
    expect(getStatusModifiers([])).toEqual({});
  });

  it('rejects bad rules and invalid external values deterministically', () => {
    const invalidRules: StatusRule[] = [
      { ...burning, id: '' },
      { ...burning, duration: 0 },
      { ...burning, duration: Number.NaN },
      { ...burning, duration: Number.POSITIVE_INFINITY },
      { ...burning, magnitude: -1 },
      { ...burning, magnitude: Number.POSITIVE_INFINITY },
      { ...burning, maxStacks: 0 },
      { ...burning, maxStacks: Number.NaN }
    ];
    for (const rule of invalidRules) expect(apply(rule)).toEqual([]);
    expect(applyStatus([], burning, '')).toEqual([]);
    const valid = apply();
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, -2]) {
      expect(advanceStatuses(valid, delta)).toEqual({ statuses: valid, ticks: [], suppressedTicks: 0 });
    }
    expect(apply({ ...burning, tickInterval: Number.NaN })[0].tickInterval).toBe(0);
    expect(apply({ ...burning, tickInterval: -1 })[0].tickInterval).toBe(0);
  });

  it('bounds periodic output without losing elapsed simulation time or hanging', () => {
    const ultraFast = apply({ ...burning, duration: 1000, tickInterval: 0.001 });
    const capped = advanceStatuses(ultraFast, 10, 3);
    expect(capped.ticks).toHaveLength(3);
    expect(capped.suppressedTicks).toBe(9997);
    expect(capped.statuses[0]).toMatchObject({ remaining: 990, tickElapsed: 0 });
    const defaultCap = advanceStatuses(ultraFast, 10);
    expect(defaultCap.ticks).toHaveLength(256);
    expect(defaultCap.suppressedTicks).toBe(9744);
  });

  it('preserves finite values, cloned arrays and original instances under malformed input', () => {
    const valid = apply();
    const malformed = [{ ...valid[0], remaining: Number.NaN }, valid[0]] as StatusInstance[];
    const result = advanceStatuses(malformed, 1);
    expect(result.statuses).toHaveLength(1);
    expect(result.statuses[0].remaining).toBe(4);
    expect(Number.isFinite(result.statuses[0].tickElapsed)).toBe(true);
    expect(valid[0].remaining).toBe(5);
    expect(result.statuses[0]).not.toBe(valid[0]);
  });
});
