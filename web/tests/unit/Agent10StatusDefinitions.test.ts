import { describe, expect, it } from 'vitest';
import {
  STATUS_DEFINITIONS,
  STATUS_IDS,
  getStatusDefinition,
  type StatusDefinition,
  type StatusId
} from '../../src/game/status/statusDefinitions';

const expectedIds = [
  'burning', 'chilled', 'frozen', 'poisoned', 'bleeding',
  'stunned', 'slowed', 'rooted', 'silenced', 'cursed',
  'vulnerable', 'fortified', 'shielded', 'regeneration', 'haste'
] as const satisfies readonly StatusId[];

describe('Agent 10: isolated status definition registry', () => {
  it('contains exactly the fifteen stable and unique status IDs', () => {
    expect(STATUS_IDS).toEqual(expectedIds);
    expect(new Set(STATUS_IDS).size).toBe(15);
    expect(Object.keys(STATUS_DEFINITIONS).sort()).toEqual([...expectedIds].sort());

    for (const id of expectedIds) {
      expect(STATUS_DEFINITIONS[id].id).toBe(id);
      expect(getStatusDefinition(id)).toBe(STATUS_DEFINITIONS[id]);
    }
  });

  it('has finite, bounded default durations, magnitudes and stack caps', () => {
    for (const definition of Object.values(STATUS_DEFINITIONS)) {
      expect(Number.isFinite(definition.duration), definition.id).toBe(true);
      expect(definition.duration, definition.id).toBeGreaterThan(0);
      expect(definition.duration, definition.id).toBeLessThanOrEqual(120);
      expect(Number.isFinite(definition.magnitude), definition.id).toBe(true);
      expect(definition.magnitude, definition.id).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(definition.maxStacks), definition.id).toBe(true);
      expect(definition.maxStacks, definition.id).toBeGreaterThanOrEqual(1);
      expect(definition.maxStacks, definition.id).toBeLessThanOrEqual(10);
      expect(['replace', 'stack']).toContain(definition.stackMode);
      expect(['reset', 'keepLonger']).toContain(definition.refreshMode);
      expect(['physical', 'magic', 'curse', 'none']).toContain(definition.dispelCategory);
      expect(definition.visualHook).toBe(definition.id);
    }
  });

  it('distinguishes periodic damage/healing from non-periodic modifiers', () => {
    const periodic: readonly StatusId[] = ['burning', 'poisoned', 'bleeding', 'regeneration'];
    for (const id of expectedIds) {
      const definition = STATUS_DEFINITIONS[id];
      if (periodic.includes(id)) {
        expect(Number.isFinite(definition.tickInterval), id).toBe(true);
        expect(definition.tickInterval, id).toBeGreaterThan(0);
        expect(definition.tickInterval, id).toBeLessThanOrEqual(definition.duration);
      } else {
        expect(definition.tickInterval, id).toBeNull();
      }
    }
    for (const id of ['burning', 'poisoned', 'bleeding'] as const) {
      expect(STATUS_DEFINITIONS[id].modifierKind).toBe('damageOverTime');
    }
    expect(STATUS_DEFINITIONS.regeneration.modifierKind).toBe('healingOverTime');
  });

  it('provides explicit crowd-control immunity groups', () => {
    expect(STATUS_DEFINITIONS.stunned.immunityGroup).toBe('hardControl');
    expect(STATUS_DEFINITIONS.frozen.immunityGroup).toBe('hardControl');
    expect(STATUS_DEFINITIONS.rooted.immunityGroup).toBe('movementControl');
    expect(STATUS_DEFINITIONS.silenced.immunityGroup).toBe('silence');
    expect(STATUS_DEFINITIONS.chilled.immunityGroup).toBe('slowControl');
    expect(STATUS_DEFINITIONS.slowed.immunityGroup).toBe('slowControl');

    for (const id of [
      'burning', 'poisoned', 'bleeding', 'cursed', 'vulnerable',
      'fortified', 'shielded', 'regeneration', 'haste'
    ] as const) {
      expect(STATUS_DEFINITIONS[id].immunityGroup).toBeNull();
    }
  });

  it('supplies bounded stacking and explicit refresh behavior', () => {
    for (const effect of Object.values(STATUS_DEFINITIONS)) {
      if (effect.stackMode === 'replace') {
        expect(effect.maxStacks, effect.id).toBe(1);
      } else {
        expect(effect.maxStacks, effect.id).toBeGreaterThan(1);
        expect(effect.refreshMode, effect.id).toBe('reset');
      }
    }
    expect(STATUS_DEFINITIONS.poisoned.maxStacks).toBe(5);
    expect(STATUS_DEFINITIONS.bleeding.maxStacks).toBe(3);
    expect(STATUS_DEFINITIONS.stunned.refreshMode).toBe('keepLonger');
    expect(STATUS_DEFINITIONS.frozen.refreshMode).toBe('keepLonger');
  });

  it('distinguishes combat modifiers and dispel categories without localized UI text', () => {
    expect(STATUS_DEFINITIONS.chilled.modifierKind).toBe('movementSpeed');
    expect(STATUS_DEFINITIONS.slowed.modifierKind).toBe('movementSpeed');
    expect(STATUS_DEFINITIONS.haste.modifierKind).toBe('speedBoost');
    expect(STATUS_DEFINITIONS.rooted.modifierKind).toBe('movementLock');
    expect(STATUS_DEFINITIONS.silenced.modifierKind).toBe('castLock');
    expect(STATUS_DEFINITIONS.stunned.modifierKind).toBe('actionLock');
    expect(STATUS_DEFINITIONS.frozen.modifierKind).toBe('actionLock');
    expect(STATUS_DEFINITIONS.cursed.modifierKind).toBe('damageDealt');
    expect(STATUS_DEFINITIONS.vulnerable.modifierKind).toBe('damageTaken');
    expect(STATUS_DEFINITIONS.fortified.modifierKind).toBe('damageReduction');
    expect(STATUS_DEFINITIONS.shielded.modifierKind).toBe('barrier');
    expect(STATUS_DEFINITIONS.bleeding.dispelCategory).toBe('physical');
    expect(STATUS_DEFINITIONS.cursed.dispelCategory).toBe('curse');
  });

  it('returns undefined for unknown and inherited keys, including malformed external input', () => {
    for (const bad of [
      '', 'Burning', 'skeleton', '__proto__', 'constructor', 'toString',
      null, undefined, 1, Number.NaN, Symbol('burning'), {}, ['burning']
    ]) {
      expect(getStatusDefinition(bad)).toBeUndefined();
    }
  });

  it('exports immutable registry entries and stable lookup references', () => {
    expect(Object.isFrozen(STATUS_IDS)).toBe(true);
    expect(Object.isFrozen(STATUS_DEFINITIONS)).toBe(true);
    for (const id of STATUS_IDS) {
      const effect: Readonly<StatusDefinition> = STATUS_DEFINITIONS[id];
      expect(Object.isFrozen(effect), id).toBe(true);
      expect(getStatusDefinition(id)).toBe(effect);
    }
  });
});
