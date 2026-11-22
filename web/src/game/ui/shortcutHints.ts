/** Display-only keyboard and mouse hints derived from the active, validated bindings.
 * These labels never dispatch input and must not imply a default key still works.
 * KeyboardEvent.code is intentionally used instead of locale-dependent key values.
 */
import type { InputAction, InputBinding } from '../input/bindings';

const MOUSE_LABELS = ['LMB', 'MMB', 'RMB', 'Mouse 4', 'Mouse 5'] as const;

export function shortcutHint(bindings: readonly InputBinding[], action: InputAction): string {
  if (!Array.isArray(bindings)) return '—';
  const binding = bindings.find(item => item?.action === action && (
    item.device === 'keyboard'
      ? typeof item.code === 'string' && item.code.length > 0
      : item.device === 'mouse'
        && Number.isInteger(item.button) && item.button >= 0 && item.button <= 4
  ));
  if (!binding) return '—';
  if (binding.device === 'mouse') return MOUSE_LABELS[binding.button] ?? '—';
  const code = binding.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return 'Num ' + code.slice(6);
  switch (code) {
    case 'Escape': return 'Esc';
    case 'ShiftLeft': return 'Shift L';
    case 'ShiftRight': return 'Shift R';
    case 'ControlLeft': return 'Ctrl L';
    case 'ControlRight': return 'Ctrl R';
    case 'AltLeft': return 'Alt L';
    case 'AltRight': return 'Alt R';
    default: return code;
  }
}
