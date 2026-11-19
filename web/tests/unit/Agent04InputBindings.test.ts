import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BINDINGS,
  rebindAction,
  resolveKeyboardAction,
  resolvePointerAction,
  type InputAction,
  type InputBinding
} from '../../src/game/input/bindings';

const key = (code: string, extras: Partial<{
  uiCaptured: boolean;
  isTyping: boolean;
  repeat: boolean;
}> = {}) => resolveKeyboardAction({ code, uiCaptured: false, isTyping: false, ...extras });

const mouse = (button: number, uiCaptured = false) =>
  resolvePointerAction({ button, uiCaptured });

describe('Agent 04: default bindings', () => {
  it('uses KeyboardEvent.code rather than localized KeyboardEvent.key', () => {
    const czechKeyboardEvent = {
      code: 'Digit2', key: 'ě', uiCaptured: false, isTyping: false
    };
    expect(resolveKeyboardAction(czechKeyboardEvent)).toBe('SLOT_2');
    expect(key('Digit1')).toBe('SLOT_1');
    expect(key('Digit3')).toBe('SLOT_3');
    expect(key('Digit4')).toBe('SLOT_4');
  });

  it('preserves character and inventory shortcuts and exposes other defaults', () => {
    const expected: Array<[string, InputAction]> = [
      ['KeyC', 'CHARACTER'], ['KeyI', 'INVENTORY'], ['KeyQ', 'POTION'],
      ['Space', 'EVADE'], ['KeyS', 'SKILLS'], ['KeyT', 'TALENTS'],
      ['KeyM', 'MAP'], ['KeyJ', 'JOURNAL'], ['Escape', 'MENU'],
      ['ShiftLeft', 'HOLD_POSITION'], ['ShiftRight', 'HOLD_POSITION']
    ];
    for (const [code, action] of expected) expect(key(code)).toBe(action);
    expect(key('Unidentified')).toBeNull();
  });

  it('distinguishes primary, force move, and secondary mouse buttons', () => {
    expect(mouse(0)).toBe('PRIMARY');
    expect(mouse(1)).toBe('FORCE_MOVE');
    expect(mouse(2)).toBe('SECONDARY');
    expect(mouse(3)).toBeNull();
    expect(mouse(-1)).toBeNull();
    expect(mouse(Number.NaN)).toBeNull();
    expect(mouse(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('never emits world actions while typing or while UI captures input', () => {
    expect(key('Digit2', { isTyping: true })).toBeNull();
    expect(key('KeyC', { uiCaptured: true })).toBeNull();
    expect(key('Escape', { uiCaptured: true })).toBeNull();
    expect(key('ShiftLeft', { isTyping: true, repeat: true })).toBeNull();
    expect(mouse(0, true)).toBeNull();
    expect(mouse(1, true)).toBeNull();
    expect(mouse(2, true)).toBeNull();
  });

  it('suppresses repeated shortcuts but retains held-position key repeats', () => {
    expect(key('Digit1', { repeat: true })).toBeNull();
    expect(key('KeyI', { repeat: true })).toBeNull();
    expect(key('Escape', { repeat: true })).toBeNull();
    expect(key('ShiftLeft', { repeat: true })).toBe('HOLD_POSITION');
    expect(key('ShiftRight', { repeat: true })).toBe('HOLD_POSITION');
  });
});

describe('Agent 04: immutable rebinds', () => {
  it('can change keys and mouse buttons without changing the defaults or input', () => {
    const original = DEFAULT_BINDINGS.map(binding => ({ ...binding }));
    const character = rebindAction(DEFAULT_BINDINGS, {
      action: 'CHARACTER', device: 'keyboard', code: 'KeyP'
    });
    expect(character.ok).toBe(true);
    if (!character.ok) return;
    expect(resolveKeyboardAction({ code: 'KeyP', uiCaptured: false, isTyping: false }, character.bindings))
      .toBe('CHARACTER');
    expect(resolveKeyboardAction({ code: 'KeyC', uiCaptured: false, isTyping: false }, character.bindings))
      .toBeNull();

    const move = rebindAction(character.bindings, {
      action: 'FORCE_MOVE', device: 'mouse', button: 3
    });
    expect(move.ok).toBe(true);
    if (!move.ok) return;
    expect(resolvePointerAction({ button: 3, uiCaptured: false }, move.bindings))
      .toBe('FORCE_MOVE');
    expect(resolvePointerAction({ button: 1, uiCaptured: false }, move.bindings))
      .toBeNull();
    expect(DEFAULT_BINDINGS).toEqual(original);
    expect(key('KeyC')).toBe('CHARACTER');
    expect(mouse(1)).toBe('FORCE_MOVE');
    expect(character.bindings).not.toBe(DEFAULT_BINDINGS);
    expect(move.bindings).not.toBe(character.bindings);
  });

  it('rejects key collisions without losing either original binding', () => {
    const original = DEFAULT_BINDINGS.map(binding => ({ ...binding }));
    const collision = rebindAction(DEFAULT_BINDINGS, {
      action: 'MAP', device: 'keyboard', code: 'KeyC'
    });
    expect(collision).toEqual({ ok: false, reason: 'CONFLICT' });
    expect(DEFAULT_BINDINGS).toEqual(original);
    expect(key('KeyC')).toBe('CHARACTER');
    expect(key('KeyM')).toBe('MAP');
    expect(rebindAction(DEFAULT_BINDINGS, {
      action: 'SECONDARY', device: 'mouse', button: 0
    })).toEqual({ ok: false, reason: 'CONFLICT' });
  });

  it.each(['', ' ', 'Keyě', 'Invalid Code', 'KeyFoo', 'Bogus'])
    ('rejects invalid KeyboardEvent.code %j', code => {
      expect(rebindAction(DEFAULT_BINDINGS, {
        action: 'MAP', device: 'keyboard', code
      })).toEqual({ ok: false, reason: 'INVALID' });
    });

  it.each([-1, 5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
    ('rejects invalid mouse button %s', button => {
      expect(rebindAction(DEFAULT_BINDINGS, {
        action: 'FORCE_MOVE', device: 'mouse', button
      })).toEqual({ ok: false, reason: 'INVALID' });
    });

  it('rejects malformed actions, devices, or map entries at runtime', () => {
    expect(rebindAction(DEFAULT_BINDINGS, {
      action: 'TELEPORT', device: 'keyboard', code: 'KeyP'
    } as unknown as InputBinding)).toEqual({ ok: false, reason: 'INVALID' });
    expect(rebindAction(DEFAULT_BINDINGS, {
      action: 'MAP', device: 'controller', code: 'KeyP'
    } as unknown as InputBinding)).toEqual({ ok: false, reason: 'INVALID' });
    expect(rebindAction([{ action: 'MAP', device: 'keyboard', code: '' }], {
      action: 'MAP', device: 'keyboard', code: 'KeyP'
    })).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('handles both Shift bindings as a single rebindable action', () => {
    const modified = rebindAction(DEFAULT_BINDINGS, {
      action: 'HOLD_POSITION', device: 'keyboard', code: 'AltLeft'
    });
    expect(modified.ok).toBe(true);
    if (!modified.ok) return;
    expect(resolveKeyboardAction({ code: 'AltLeft', uiCaptured: false, isTyping: false }, modified.bindings))
      .toBe('HOLD_POSITION');
    expect(resolveKeyboardAction({ code: 'ShiftLeft', uiCaptured: false, isTyping: false }, modified.bindings))
      .toBeNull();
    expect(resolveKeyboardAction({ code: 'ShiftRight', uiCaptured: false, isTyping: false }, modified.bindings))
      .toBeNull();
  });

  it('returns deterministic results for independent maps and repeated calls', () => {
    const mapA = rebindAction(DEFAULT_BINDINGS, {
      action: 'INVENTORY', device: 'keyboard', code: 'KeyO'
    });
    const mapB = rebindAction(DEFAULT_BINDINGS, {
      action: 'INVENTORY', device: 'keyboard', code: 'KeyP'
    });
    expect(mapA.ok).toBe(true);
    expect(mapB.ok).toBe(true);
    if (!mapA.ok || !mapB.ok) return;
    const request = { code: 'KeyO', uiCaptured: false, isTyping: false };
    expect(resolveKeyboardAction(request, mapA.bindings)).toBe('INVENTORY');
    expect(resolveKeyboardAction(request, mapA.bindings)).toBe('INVENTORY');
    expect(resolveKeyboardAction(request, mapB.bindings)).toBeNull();
    expect(resolveKeyboardAction(request)).toBeNull();
    expect(mapA.bindings).not.toBe(mapB.bindings);
  });
});
