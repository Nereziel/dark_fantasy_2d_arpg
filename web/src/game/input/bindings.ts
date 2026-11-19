/**
 * Renderer-independent keyboard and pointer action mapping.
 *
 * Consumers supply KeyboardEvent.code (not the locale-dependent `key`) and
 * handle UI capture before dispatching resolved actions as game commands.
 * No DOM or Phaser listeners are installed by this module.
 */
export type InputAction =
  | 'PRIMARY' | 'SECONDARY' | 'FORCE_MOVE' | 'HOLD_POSITION'
  | 'SLOT_1' | 'SLOT_2' | 'SLOT_3' | 'SLOT_4'
  | 'POTION' | 'EVADE' | 'INVENTORY' | 'CHARACTER'
  | 'SKILLS' | 'TALENTS' | 'MAP' | 'JOURNAL' | 'MENU';

export type InputBinding =
  | { action: InputAction; device: 'keyboard'; code: string }
  | { action: InputAction; device: 'mouse'; button: number };

export type KeyboardInput = {
  code: string;
  uiCaptured: boolean;
  isTyping: boolean;
  repeat?: boolean;
};

export type PointerInput = { button: number; uiCaptured: boolean };

const INPUT_ACTIONS: ReadonlySet<string> = new Set<InputAction>([
  'PRIMARY', 'SECONDARY', 'FORCE_MOVE', 'HOLD_POSITION',
  'SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4',
  'POTION', 'EVADE', 'INVENTORY', 'CHARACTER',
  'SKILLS', 'TALENTS', 'MAP', 'JOURNAL', 'MENU'
]);

// Standard KeyboardEvent.code values; intentionally reject arbitrary labels,
// localized `key` values and `Unidentified` when changing bindings.
const NAMED_CODES: ReadonlySet<string> = new Set([
  'Escape', 'Space', 'Tab', 'Enter', 'Backspace', 'Delete', 'Insert',
  'Home', 'End', 'PageUp', 'PageDown', 'CapsLock', 'NumLock', 'ScrollLock',
  'Pause', 'PrintScreen', 'ContextMenu',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight',
  'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash',
  'IntlBackslash', 'IntlRo', 'IntlYen',
  'NumpadEnter', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply',
  'NumpadDivide', 'NumpadDecimal', 'NumpadEqual', 'NumpadComma',
  'NumpadBackspace', 'NumpadParenLeft', 'NumpadParenRight',
  'AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute',
  'MediaPlayPause', 'MediaStop', 'MediaTrackNext', 'MediaTrackPrevious'
]);

function isKeyboardCode(code: unknown): code is string {
  return typeof code === 'string' && (
    NAMED_CODES.has(code)
    || /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Lang[1-5])$/.test(code)
  );
}

function isMouseButton(button: unknown): button is number {
  return typeof button === 'number' && Number.isInteger(button)
    && button >= 0 && button <= 4;
}

function isInputBinding(value: unknown): value is InputBinding {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { action?: unknown; device?: unknown; code?: unknown; button?: unknown };
  if (typeof candidate.action !== 'string' || !INPUT_ACTIONS.has(candidate.action)) return false;
  if (candidate.device === 'keyboard') return isKeyboardCode(candidate.code);
  if (candidate.device === 'mouse') return isMouseButton(candidate.button);
  return false;
}

const defaultValues: InputBinding[] = [
  { action: 'PRIMARY', device: 'mouse', button: 0 },
  { action: 'FORCE_MOVE', device: 'mouse', button: 1 },
  { action: 'SECONDARY', device: 'mouse', button: 2 },
  { action: 'HOLD_POSITION', device: 'keyboard', code: 'ShiftLeft' },
  { action: 'HOLD_POSITION', device: 'keyboard', code: 'ShiftRight' },
  { action: 'SLOT_1', device: 'keyboard', code: 'Digit1' },
  { action: 'SLOT_2', device: 'keyboard', code: 'Digit2' },
  { action: 'SLOT_3', device: 'keyboard', code: 'Digit3' },
  { action: 'SLOT_4', device: 'keyboard', code: 'Digit4' },
  { action: 'POTION', device: 'keyboard', code: 'KeyQ' },
  { action: 'EVADE', device: 'keyboard', code: 'Space' },
  { action: 'INVENTORY', device: 'keyboard', code: 'KeyI' },
  { action: 'CHARACTER', device: 'keyboard', code: 'KeyC' },
  { action: 'SKILLS', device: 'keyboard', code: 'KeyS' },
  { action: 'TALENTS', device: 'keyboard', code: 'KeyT' },
  { action: 'MAP', device: 'keyboard', code: 'KeyM' },
  { action: 'JOURNAL', device: 'keyboard', code: 'KeyJ' },
  { action: 'MENU', device: 'keyboard', code: 'Escape' }
];

/** Immutable defaults, including each individual entry. */
export const DEFAULT_BINDINGS: readonly InputBinding[] = Object.freeze(
  defaultValues.map(binding => Object.freeze({ ...binding }))
);

/** UI and text entry always take precedence over gameplay shortcuts. */
export function resolveKeyboardAction(
  input: KeyboardInput,
  bindings: readonly InputBinding[] = DEFAULT_BINDINGS
): InputAction | null {
  if (!input || input.uiCaptured || input.isTyping || !isKeyboardCode(input.code)
      || !Array.isArray(bindings)) return null;

  let action: InputAction | null = null;
  for (const binding of bindings) {
    if (!isInputBinding(binding) || binding.device !== 'keyboard' || binding.code !== input.code) continue;
    if (action !== null && action !== binding.action) return null;
    action = binding.action;
  }
  return input.repeat && action !== 'HOLD_POSITION' ? null : action;
}

/** Browser button indices: left=0, middle=1, right=2, back=3, forward=4. */
export function resolvePointerAction(
  input: PointerInput,
  bindings: readonly InputBinding[] = DEFAULT_BINDINGS
): InputAction | null {
  if (!input || input.uiCaptured || !isMouseButton(input.button)
      || !Array.isArray(bindings)) return null;

  let action: InputAction | null = null;
  for (const binding of bindings) {
    if (!isInputBinding(binding) || binding.device !== 'mouse' || binding.button !== input.button) continue;
    if (action !== null && action !== binding.action) return null;
    action = binding.action;
  }
  return action;
}

function bindingKey(binding: InputBinding): string {
  return binding.device === 'keyboard' ? `keyboard:${binding.code}` : `mouse:${binding.button}`;
}

/**
 * Replace all existing triggers for one action with a single new trigger.
 * Reject collisions instead of silently stealing another action's trigger.
 * Original binding objects, arrays and DEFAULT_BINDINGS are never modified.
 */
export function rebindAction(
  bindings: readonly InputBinding[],
  replacement: InputBinding
): { ok: true; bindings: InputBinding[] } | { ok: false; reason: 'CONFLICT' | 'INVALID' } {
  if (!Array.isArray(bindings) || !isInputBinding(replacement)) {
    return { ok: false, reason: 'INVALID' };
  }

  const occupied = new Set<string>();
  for (const binding of bindings) {
    if (!isInputBinding(binding)) return { ok: false, reason: 'INVALID' };
    const key = bindingKey(binding);
    if (occupied.has(key)) return { ok: false, reason: 'CONFLICT' };
    occupied.add(key);
    if (binding.action !== replacement.action && key === bindingKey(replacement)) {
      return { ok: false, reason: 'CONFLICT' };
    }
  }

  const index = bindings.findIndex(binding => binding.action === replacement.action);
  const result = bindings
    .filter(binding => binding.action !== replacement.action)
    .map(binding => ({ ...binding }));
  result.splice(index < 0 ? result.length : index, 0, { ...replacement });
  return { ok: true, bindings: result };
}
