/**
 * Renderer-independent keyboard and pointer action mapping.
 *
 * Consumers supply KeyboardEvent.code (not the locale-dependent `key`) and
 * handle UI capture before dispatching resolved actions as game commands.
 * No DOM or Phaser listeners are installed by this module.
 */
export type InputAction =
  | 'PRIMARY' | 'SECONDARY' | 'FORCE_MOVE' | 'HOLD_POSITION'
  | 'SLOT_1' | 'SLOT_2' | 'SLOT_3' | 'SLOT_4' | 'SLOT_5' | 'SLOT_6'
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
  'SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4', 'SLOT_5', 'SLOT_6',
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
  { action: 'SLOT_5', device: 'keyboard', code: 'Digit5' },
  { action: 'SLOT_6', device: 'keyboard', code: 'Digit6' },
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


/**
 * Restore all changed actions together rather than replaying rebindAction().
 * Replaying individual records rejects valid left/right swaps as transient
 * collisions with the unchanged default binding. Persisted v1 override arrays
 * and legacy single-action overrides retain exactly the same shape.
 */
export function applyBindingOverrides(
  defaults: readonly InputBinding[], overrides: readonly InputBinding[]
): { ok: true; bindings: InputBinding[] } | { ok: false; reason: 'INVALID' | 'CONFLICT' } {
  if (!Array.isArray(defaults) || !Array.isArray(overrides)) {
    return { ok: false, reason: 'INVALID' };
  }
  const byAction = new Map<InputAction, InputBinding[]>();
  const validate = (entries: readonly InputBinding[]) => {
    const occupied = new Set<string>();
    for (const binding of entries) {
      if (!isInputBinding(binding)) return 'INVALID' as const;
      const key = bindingKey(binding);
      if (occupied.has(key)) return 'CONFLICT' as const;
      occupied.add(key);
    }
    return null;
  };
  const defaultError = validate(defaults);
  const overrideError = validate(overrides);
  if (defaultError || overrideError) {
    return { ok: false, reason: defaultError ?? overrideError ?? 'INVALID' };
  }

  for (const binding of overrides) {
    const group = byAction.get(binding.action) ?? [];
    group.push({ ...binding });
    byAction.set(binding.action, group);
  }
  const result: InputBinding[] = [];
  const inserted = new Set<InputAction>();
  for (const binding of defaults) {
    const replacement = byAction.get(binding.action);
    if (!replacement) result.push({ ...binding });
    else if (!inserted.has(binding.action)) {
      result.push(...replacement.map(item => ({ ...item })));
      inserted.add(binding.action);
    }
  }
  // Future valid actions not present in older defaults are appended in stable order.
  for (const [action, replacements] of byAction) {
    if (!inserted.has(action)) result.push(...replacements.map(item => ({ ...item })));
  }
  const error = validate(result);
  return error ? { ok: false, reason: error } : { ok: true, bindings: result };
}

/**
 * Swap the physical PRIMARY and SECONDARY mouse actions atomically.
 * This preserves other bindings, force-move and keyboard mappings, including
 * custom button 3/4 layouts. A missing or ambiguous primary/secondary button
 * fails without modifying the caller's bindings.
 */
export function swapPrimarySecondaryMouse(
  bindings: readonly InputBinding[]
): { ok: true; bindings: InputBinding[] } | { ok: false; reason: 'INVALID' | 'CONFLICT' } {
  if (!Array.isArray(bindings)) return { ok: false, reason: 'INVALID' };
  const triggers = new Set<string>();
  for (const binding of bindings) {
    if (!isInputBinding(binding)) return { ok: false, reason: 'INVALID' };
    const trigger = bindingKey(binding);
    if (triggers.has(trigger)) return { ok: false, reason: 'CONFLICT' };
    triggers.add(trigger);
  }
  const primary = bindings.filter(binding => binding.device === 'mouse' && binding.action === 'PRIMARY');
  const secondary = bindings.filter(binding => binding.device === 'mouse' && binding.action === 'SECONDARY');
  if (primary.length !== 1 || secondary.length !== 1) {
    return { ok: false, reason: 'INVALID' };
  }
  return {
    ok: true,
    bindings: bindings.map(binding =>
      binding.device !== 'mouse' ? { ...binding }
      : binding.action === 'PRIMARY' ? { ...binding, action: 'SECONDARY' }
      : binding.action === 'SECONDARY' ? { ...binding, action: 'PRIMARY' }
      : { ...binding }
    )
  };
}
