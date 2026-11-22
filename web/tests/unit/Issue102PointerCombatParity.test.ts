import { describe, expect, it } from 'vitest';
import type { GameSnapshot, GameCommand, Point } from '../../src/game/core/types';
import { dispatchCombatAction, type CombatInputPort } from '../../src/game/input/combatActionDispatcher';
import { GAME_BINDINGS } from '../../src/game/input/gameBindings';
import { rebindAction, resolvePointerAction, type InputAction } from '../../src/game/input/bindings';

function fixture(classId: GameSnapshot['classId'] = 'WARRIOR',
  options: { paused?: boolean; alive?: boolean; position?: Point | null } = {}) {
  const commands: GameCommand[] = [];
  const bridge: CombatInputPort = {
    snapshot: () => ({
      classId, paused: options.paused ?? false,
      player: { alive: options.alive ?? true },
      selectedTargetId: 'selected', enemy: { id: 'fallback' }
    }) as unknown as GameSnapshot,
    skillAim: () => null,
    pointerPosition: () => options.position === undefined ? { x: 18, y: 27 } : options.position,
    command: command => { commands.push(command); }
  };
  return { bridge, commands };
}

describe('Issue 102: shared pointer combat actions', () => {
  it('preserves SECONDARY and SLOT_1 cast aim/target behavior', () => {
    const { bridge, commands } = fixture();
    expect(dispatchCombatAction(bridge, 'SECONDARY', 'clicked-enemy')).toBe(true);
    expect(dispatchCombatAction(bridge, 'SLOT_1')).toBe(true);
    expect(commands).toEqual([
      { type: 'cast', slot: 'rmb', targetId: 'clicked-enemy' },
      { type: 'cast', slot: 'slot1' }
    ]);
  });
  it('executes mouse-bound POTION and EVADE without touching navigation', () => {
    const changed = rebindAction(GAME_BINDINGS, {
      action: 'POTION', device: 'mouse', button: 3
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const action = resolvePointerAction({ button: 3, uiCaptured: false }, changed.bindings);
    expect(action).toBe('POTION');
    const { bridge, commands } = fixture();
    expect(dispatchCombatAction(bridge, action!)).toBe(true);
    expect(dispatchCombatAction(bridge, 'EVADE')).toBe(true);
    expect(commands).toEqual([{ type: 'usePotion' }, { type: 'evade' }]);
  });
  it.each([
    ['WARRIOR', 'warriorAbility', 'groundSlam', 'basicAttack'],
    ['PALADIN', 'paladinAbility', 'holyStrike', 'smite'],
    ['MAGE', 'mageAbility', 'chainLightning', 'blizzard'],
    ['NECROMANCER', 'necroAbility', 'corpseExplosion', 'deathNova'],
    ['ROGUE', 'rogueAbility', 'backstab', 'fanOfKnives'],
    ['WARLOCK', 'warlockAbility', 'shadowBolt', 'hellfire']
  ] as const)('routes class %s extra slots through the same actions', (
    classId, commandType, first, last
  ) => {
    const { bridge, commands } = fixture(classId);
    expect(dispatchCombatAction(bridge, 'SLOT_2', 'clicked')).toBe(true);
    expect(dispatchCombatAction(bridge, 'SLOT_6')).toBe(true);
    expect(commands[0]).toMatchObject({ type: commandType, id: first, targetId: 'clicked' });
    expect(commands[1]).toMatchObject({ type: commandType, id: last, targetId: 'selected' });
    if (classId === 'MAGE' || classId === 'NECROMANCER' || classId === 'ROGUE')
      expect(commands[0]).toMatchObject({ position: { x: 18, y: 27 } });
  });
  it('rejects inactive or UI/movement action paths without generating combat', () => {
    for (const options of [{ paused: true }, { alive: false }]) {
      const { bridge, commands } = fixture('WARRIOR', options);
      for (const action of ['POTION', 'EVADE', 'SECONDARY', 'SLOT_1', 'SLOT_2'] as InputAction[])
        expect(dispatchCombatAction(bridge, action)).toBe(false);
      expect(commands).toEqual([]);
    }
    const { bridge, commands } = fixture();
    for (const action of ['PRIMARY','FORCE_MOVE','MAP','TALENTS','INVENTORY',
      'CHARACTER','HOLD_POSITION','MENU','SKILLS','JOURNAL'] as InputAction[])
      expect(dispatchCombatAction(bridge, action)).toBe(false);
    expect(commands).toEqual([]);
  });
});
