/** Live game bindings: Q is the potion hotkey; right mouse remains a skill.
 * The renderer-independent defaults already reserve KeyQ for POTION.
 */
import { DEFAULT_BINDINGS, type InputBinding } from './bindings';

export const GAME_BINDINGS: readonly InputBinding[] = [
  ...DEFAULT_BINDINGS,
  { action: 'SLOT_1', device: 'keyboard', code: 'Numpad1' }
];
