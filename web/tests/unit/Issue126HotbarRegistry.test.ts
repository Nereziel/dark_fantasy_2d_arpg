/** F1 — shared hotbar identity and slot routing. GPL-3.0-only. */
import { describe, expect, it } from 'vitest';
import { CLASS_IDS, type ClassId } from '../../src/game/data/classes';
import { SKILLS } from '../../src/game/skills/skills';
import type { GameCommand, GameSnapshot } from '../../src/game/core/types';
import { HOTBAR_INPUTS, defaultHotbarLayout, hotbarInputForAbility, resolveHotbarEntry,
  swapHotbarSlots, validateHotbarLayout } from '../../src/game/input/hotbarRegistry';
import { dispatchCombatAction, dispatchHotbarAbility,
  type CombatInputPort } from '../../src/game/input/combatActionDispatcher';

function fixture(classId: ClassId, paused = false, alive = true) {
  const commands: GameCommand[] = [];
  const bridge: CombatInputPort = {
    snapshot: () => ({ classId, paused, player: { alive },
      selectedTargetId: 'selected', enemy: { id: 'fallback' } }) as unknown as GameSnapshot,
    skillAim: () => null,
    pointerPosition: () => ({ x: 123, y: 456 }),
    command: command => { commands.push(command); }
  };
  return { bridge, commands };
}

describe('Issue #126 — shared class hotbar registry', () => {
  it.each(CLASS_IDS)('maps exactly seven distinct existing abilities for %s', classId => {
    const layout = defaultHotbarLayout(classId);
    expect(layout).toHaveLength(7);
    expect(new Set(layout).size).toBe(7);
    expect(layout.slice(0, 2)).toEqual([SKILLS[classId].rmb.id, SKILLS[classId].slot1.id]);
    expect(validateHotbarLayout(classId, layout)).toBe(true);
    for (const [index, action] of HOTBAR_INPUTS.entries()) {
      expect(resolveHotbarEntry(classId, action)?.id).toBe(layout[index]);
      expect(hotbarInputForAbility(classId, layout[index]!)).toBe(action);
      const keyboard = fixture(classId);
      const button = fixture(classId);
      expect(dispatchCombatAction(keyboard.bridge, action)).toBe(true);
      expect(dispatchHotbarAbility(button.bridge, layout[index]!)).toBe(true);
      expect(button.commands).toEqual(keyboard.commands);
      expect(button.commands).toHaveLength(1);
    }
  });

  it.each(CLASS_IDS)('swaps slots without moving cooldown or ability identity for %s', classId => {
    const original = defaultHotbarLayout(classId);
    const swapped = swapHotbarSlots(classId, original, 'SECONDARY', 'SLOT_6');
    expect(swapped).not.toBeNull();
    expect(original).toEqual(defaultHotbarLayout(classId));
    expect(swapped![0]).toBe(original[6]);
    expect(swapped![6]).toBe(original[0]);
    expect(validateHotbarLayout(classId, swapped)).toBe(true);
    const remapped = fixture(classId);
    const expected = fixture(classId);
    expect(dispatchCombatAction(remapped.bridge, 'SECONDARY', 'clicked', swapped!)).toBe(true);
    expect(dispatchCombatAction(expected.bridge, 'SLOT_6', 'clicked')).toBe(true);
    expect(remapped.commands).toEqual(expected.commands);
    expect(swapHotbarSlots(classId, swapped, 'SLOT_6', 'SECONDARY')).toEqual(original);
  });

  it('rejects sparse, duplicate, unknown, cross-class and malformed layouts atomically', () => {
    const warrior = defaultHotbarLayout('WARRIOR');
    for (const invalid of [null, {}, [], Array(7), [...warrior, 'extra'],
      [warrior[0], ...warrior.slice(0, 6)],
      ['unknown', ...warrior.slice(1)], defaultHotbarLayout('MAGE')]) {
      expect(validateHotbarLayout('WARRIOR', invalid)).toBe(false);
      expect(swapHotbarSlots('WARRIOR', invalid, 'SECONDARY', 'SLOT_6')).toBeNull();
      expect(resolveHotbarEntry('WARRIOR', 'SECONDARY', invalid)).toBeNull();
    }
    const { bridge, commands } = fixture('WARRIOR');
    expect(dispatchHotbarAbility(bridge, 'fireball')).toBe(false);
    expect(dispatchHotbarAbility(bridge, '__proto__')).toBe(false);
    expect(dispatchCombatAction(bridge, 'SECONDARY', undefined, defaultHotbarLayout('MAGE'))).toBe(false);
    expect(resolveHotbarEntry('WARRIOR', 'POTION')).toBeNull();
    expect(hotbarInputForAbility('WARRIOR', 'fireball')).toBeNull();
    expect(commands).toEqual([]);
  });

  it('rejects direct button activation when paused or dead', () => {
    for (const [paused, alive] of [[true, true], [false, false]]) {
      const { bridge, commands } = fixture('PALADIN', paused, alive);
      expect(dispatchHotbarAbility(bridge, 'healingLight')).toBe(false);
      expect(commands).toEqual([]);
    }
  });

  it('does not share mutable default layouts between characters', () => {
    const changed = defaultHotbarLayout('MAGE');
    changed.reverse();
    expect(defaultHotbarLayout('MAGE')[0]).toBe('fireball');
  });
});
