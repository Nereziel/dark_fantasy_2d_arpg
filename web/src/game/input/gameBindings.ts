/** A compatibility layer over the agent's configurable default bindings.
 * Only two active skills exist currently: keep Q/RMB for the first and 1
 * for the second. Potion and further skill slots will be enabled when built.
 */
import { DEFAULT_BINDINGS, type InputBinding } from './bindings';

export const GAME_BINDINGS: readonly InputBinding[] = [
  ...DEFAULT_BINDINGS.filter(binding => !(
    binding.device === 'keyboard' && binding.code === 'KeyQ'
  )),
  { action: 'SECONDARY', device: 'keyboard', code: 'KeyQ' },
  { action: 'SLOT_1', device: 'keyboard', code: 'Numpad1' }
];
