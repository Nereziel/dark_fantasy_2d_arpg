/** Display-only hints derived from validated, active bindings.
 * These labels never dispatch input. KeyboardEvent.code remains layout-neutral.
 */
import { isInputBinding, type InputAction, type InputBinding } from '../input/bindings';

const MOUSE_LABELS = ['LMB', 'MMB', 'RMB', 'Mouse 4', 'Mouse 5'] as const;
type KeyBinding = Extract<InputBinding, { device: 'keyboard' }>;

/** Shared compact notation for the Controls panel and the in-game HUD. */
export function keyboardBindingLabel(binding: KeyBinding): string {
  const code = binding.code;
  let base: string;
  if (/^Key[A-Z]$/.test(code)) base = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) base = code.slice(5);
  else if (/^Numpad[0-9]$/.test(code)) base = 'Num ' + code.slice(6);
  else {
    switch (code) {
      case 'Escape': base = 'Esc'; break;
      case 'ShiftLeft': base = 'Shift L'; break;
      case 'ShiftRight': base = 'Shift R'; break;
      case 'ControlLeft': base = 'Ctrl L'; break;
      case 'ControlRight': base = 'Ctrl R'; break;
      case 'AltLeft': base = 'Alt L'; break;
      case 'AltRight': base = 'Alt R'; break;
      default: base = code;
    }
  }
  if (!binding.modifiers) return base;
  return [
    binding.modifiers.ctrl ? 'Ctrl' : null,
    binding.modifiers.alt ? 'Alt' : null,
    binding.modifiers.shift ? 'Shift' : null,
    base
  ].filter(Boolean).join('+');
}

export function shortcutHint(bindings: readonly InputBinding[], action: InputAction): string {
  if (!Array.isArray(bindings)) return '—';
  const binding = bindings.find(item => item?.action === action && isInputBinding(item));
  if (!binding) return '—';
  if (binding.device === 'mouse') return MOUSE_LABELS[binding.button] ?? '—';
  return keyboardBindingLabel(binding);
}
