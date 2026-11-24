/** Shared combat action adapter for keyboard, mouse and hotbar buttons.
 * Typed GameBridge commands alone modify the simulation. GPL-3.0-only.
 */
import type { GameBridge } from '../bridge/GameBridge';
import type { GameSnapshot } from '../core/types';
import type { InputAction } from './bindings';
import { resolveHotbarAbility, resolveHotbarEntry, type HotbarEntry } from './hotbarRegistry';

export type CombatInputPort = Pick<GameBridge,
  'snapshot' | 'skillAim' | 'pointerPosition' | 'command'>;

function dispatchEntry(bridge: CombatInputPort, state: GameSnapshot,
  entry: HotbarEntry, clickedEnemyId?: string): boolean {
  const route = entry.route;
  if (route.type === 'cast') {
    const aim = bridge.skillAim(route.slot);
    bridge.command({
      type: 'cast', slot: route.slot,
      ...(aim ? { aim } : {}),
      ...(clickedEnemyId ? { targetId: clickedEnemyId } : {})
    });
    return true;
  }
  const targetId = clickedEnemyId ?? state.selectedTargetId ?? state.enemy.id;
  if (route.type === 'mageAbility' || route.type === 'necroAbility' || route.type === 'rogueAbility') {
    const position = bridge.pointerPosition();
    bridge.command({ ...route, targetId, ...(position ? { position } : {}) });
  } else {
    bridge.command({ ...route, targetId });
  }
  return true;
}

/** Activating the visible ability bypasses slot placement, not game rules. */
export function dispatchHotbarAbility(bridge: CombatInputPort, id: unknown,
  clickedEnemyId?: string): boolean {
  const state = bridge.snapshot();
  if (state.paused || !state.player.alive) return false;
  const entry = resolveHotbarAbility(state.classId, id);
  return entry ? dispatchEntry(bridge, state, entry, clickedEnemyId) : false;
}

/** False means the action was not consumed; UI/movement remain caller-owned.
 * An invalid supplied layout must not silently cast a different skill.
 */
export function dispatchCombatAction(
  bridge: CombatInputPort, action: InputAction, clickedEnemyId?: string, layout?: unknown
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
  const entry = resolveHotbarEntry(state.classId, action, layout === undefined ? state.hotbarLayout : layout);
  return entry ? dispatchEntry(bridge, state, entry, clickedEnemyId) : false;
}
