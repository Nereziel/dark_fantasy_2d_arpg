/** Shared combat action adapter for keyboard and mouse.
 * Typed GameBridge commands alone modify the simulation. GPL-3.0-only.
 */
import type { GameBridge } from '../bridge/GameBridge';
import type { InputAction } from './bindings';
import { PALADIN_EXTRA_IDS } from '../skills/paladinKit';
import { MAGE_EXTRA_IDS } from '../skills/mageKit';
import { NECRO_EXTRA_IDS } from '../skills/necromancerKit';
import { ROGUE_EXTRA_IDS } from '../skills/rogueKit';
import { WARLOCK_EXTRA_IDS } from '../skills/warlockKit';

export type CombatInputPort = Pick<GameBridge,
  'snapshot' | 'skillAim' | 'pointerPosition' | 'command'>;
const WARRIOR_EXTRA_IDS = [
  'groundSlam', 'warCry', 'whirlwind', 'execute', 'basicAttack'
] as const;
const EXTRA_SLOT_INDEX: Readonly<Partial<Record<InputAction, number>>> = {
  SLOT_2: 0, SLOT_3: 1, SLOT_4: 2, SLOT_5: 3, SLOT_6: 4
};

/** False means the action was not consumed; UI/movement remain caller-owned. */
export function dispatchCombatAction(
  bridge: CombatInputPort, action: InputAction, clickedEnemyId?: string
): boolean {
  const state = bridge.snapshot();
  if (state.paused || !state.player.alive) return false;
  if (action === 'POTION') {
    bridge.command({ type: 'usePotion' });
    return true;
  }
  if (action === 'EVADE') {
    bridge.command({ type: 'evade' });
    return true;
  }
  if (action === 'SECONDARY' || action === 'SLOT_1') {
    const slot = action === 'SECONDARY' ? 'rmb' : 'slot1';
    const aim = bridge.skillAim(slot);
    bridge.command({
      type: 'cast', slot,
      ...(aim ? { aim } : {}),
      ...(clickedEnemyId ? { targetId: clickedEnemyId } : {})
    });
    return true;
  }
  const index = EXTRA_SLOT_INDEX[action];
  if (index === undefined) return false;
  const targetId = clickedEnemyId ?? state.selectedTargetId ?? state.enemy.id;
  switch (state.classId) {
    case 'WARRIOR': {
      const id = WARRIOR_EXTRA_IDS[index];
      if (!id) return false;
      bridge.command({ type: 'warriorAbility', id, targetId });
      return true;
    }
    case 'PALADIN': {
      const id = PALADIN_EXTRA_IDS[index];
      if (!id) return false;
      bridge.command({ type: 'paladinAbility', id, targetId });
      return true;
    }
    case 'MAGE': {
      const id = MAGE_EXTRA_IDS[index];
      if (!id) return false;
      const position = bridge.pointerPosition();
      bridge.command({ type: 'mageAbility', id, targetId,
        ...(position ? { position } : {}) });
      return true;
    }
    case 'NECROMANCER': {
      const id = NECRO_EXTRA_IDS[index];
      if (!id) return false;
      const position = bridge.pointerPosition();
      bridge.command({ type: 'necroAbility', id, targetId,
        ...(position ? { position } : {}) });
      return true;
    }
    case 'ROGUE': {
      const id = ROGUE_EXTRA_IDS[index];
      if (!id) return false;
      const position = bridge.pointerPosition();
      bridge.command({ type: 'rogueAbility', id, targetId,
        ...(position ? { position } : {}) });
      return true;
    }
    case 'WARLOCK': {
      const id = WARLOCK_EXTRA_IDS[index];
      if (!id) return false;
      bridge.command({ type: 'warlockAbility', id, targetId });
      return true;
    }
    default: return false;
  }
}
