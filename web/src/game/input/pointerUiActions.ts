/** Renderer-neutral planning for gameplay-canvas and modal-backdrop mouse shortcuts.
 * Mouse shortcuts never fire on HUD controls or inside a dialog's content.
 * No GameSimulation/DOM/Phaser dependencies. GPL-3.0-only.
 */
import type { InputAction } from './bindings';

export type PointerUiState =
  | 'gameplay' | 'map' | 'journal' | 'talents' | 'inventory' | 'character'
  | 'pause' | 'dialogue' | 'blocked';
export type PointerUiSurface = 'canvas' | 'backdrop' | 'other';
export type PointerUiOperation =
  | 'openMap' | 'closeMap' | 'openJournal' | 'closeJournal' | 'openTalents' | 'closeTalents'
  | 'openInventory' | 'closeInventory'
  | 'openCharacter' | 'closeCharacter'
  | 'togglePause' | 'closeDialogue';

/** World input and gameplay actions are deliberately not handled here. */
export function planPointerUiAction(
  action: InputAction | null, state: PointerUiState, surface: PointerUiSurface
): PointerUiOperation | null {
  if (!action || surface === 'other') return null;
  if (state === 'gameplay') {
    if (surface !== 'canvas') return null;
    switch (action) {
      case 'MAP': return 'openMap';
      case 'JOURNAL': return 'openJournal';
      case 'TALENTS': return 'openTalents';
      case 'INVENTORY': return 'openInventory';
      case 'CHARACTER': return 'openCharacter';
      case 'MENU': return 'togglePause';
      default: return null;
    }
  }
  // A modal is owned by its backdrop. Clicking its inner buttons, canvas,
  // or other controls must never dismiss it via a remapped mouse binding.
  if (surface !== 'backdrop') return null;
  switch (state) {
    case 'journal':
      return action === 'JOURNAL' || action === 'MENU' ? 'closeJournal' : null;
    case 'map':
      return action === 'MAP' || action === 'MENU' ? 'closeMap' : null;
    case 'talents':
      return action === 'TALENTS' || action === 'MENU' ? 'closeTalents' : null;
    case 'inventory':
      return action === 'INVENTORY' || action === 'MENU' ? 'closeInventory' : null;
    case 'character':
      return action === 'CHARACTER' || action === 'MENU' ? 'closeCharacter' : null;
    case 'pause':
      return action === 'MENU' ? 'togglePause' : null;
    case 'dialogue':
      return action === 'MENU' ? 'closeDialogue' : null;
    default:
      return null;
  }
}
