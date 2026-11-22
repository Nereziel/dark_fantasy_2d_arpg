import { describe, expect, it } from 'vitest';
import {
  rebindAction, resolveKeyboardAction, applyBindingOverrides,
  type InputBinding, type KeyboardInput
} from '../../src/game/input/bindings';
import { GAME_BINDINGS } from '../../src/game/input/gameBindings';
import { shortcutHint } from '../../src/game/ui/shortcutHints';

const key = (code: string, flags: Partial<KeyboardInput> = {}, bindings: readonly InputBinding[] = GAME_BINDINGS) =>
  resolveKeyboardAction({ code, uiCaptured: false, isTyping: false, ...flags }, bindings);

describe('Issue #153: browser-safe Ctrl/Alt/Shift keyboard chords', () => {
  it('resolves an explicit Ctrl+M chord and never steals unmodified M', () => {
    const r = rebindAction(GAME_BINDINGS, {
      action: 'MAP', device: 'keyboard', code: 'KeyM', modifiers: { ctrl: true }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(key('KeyM', {}, r.bindings)).toBeNull();
    expect(key('KeyM', { ctrlKey: true }, r.bindings)).toBe('MAP');
    expect(key('KeyM', { shiftKey: true, ctrlKey: true }, r.bindings)).toBeNull();
    expect(key('KeyM', { ctrlKey: true, repeat: true }, r.bindings)).toBeNull();
    expect(shortcutHint(r.bindings, 'MAP')).toBe('Ctrl+M');
    expect(shortcutHint(GAME_BINDINGS, 'MAP')).toBe('M');
  });

  it('a Shift+digit chord wins over the ordinary digit while holding Shift', () => {
    const r = rebindAction(GAME_BINDINGS, {
      action: 'POTION', device: 'keyboard', code: 'Digit1', modifiers: { shift: true }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(key('ShiftLeft', { shiftKey: true }, r.bindings)).toBe('HOLD_POSITION');
    expect(key('Digit1', {}, r.bindings)).toBe('SLOT_1');
    expect(key('Digit1', { shiftKey: true }, r.bindings)).toBe('POTION');
    // If no explicit shift chord exists, legacy shortcuts still work while Shift is held.
    expect(key('Digit2', { shiftKey: true }, r.bindings)).toBe('SLOT_2');
    expect(shortcutHint(r.bindings, 'POTION')).toBe('Shift+1');
  });

  it('resolves canonical Alt+Shift chords and prints the exact active modifiers', () => {
    const r = rebindAction(GAME_BINDINGS, {
      action: 'POTION', device: 'keyboard', code: 'KeyZ', modifiers: { shift: true, alt: true }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(key('KeyZ', { altKey: true, shiftKey: true }, r.bindings)).toBe('POTION');
    expect(key('KeyZ', { shiftKey: true }, r.bindings)).toBeNull();
    expect(key('KeyZ', { altKey: true }, r.bindings)).toBeNull();
    expect(shortcutHint(r.bindings, 'POTION')).toBe('Alt+Shift+Z');
  });

  it('rejects collisions regardless of modifier object property ordering', () => {
    const map = rebindAction(GAME_BINDINGS, {
      action: 'MAP', device: 'keyboard', code: 'KeyM',
      modifiers: { shift: true, ctrl: true }
    });
    expect(map.ok).toBe(true);
    if (!map.ok) return;
    expect(rebindAction(map.bindings, {
      action: 'POTION', device: 'keyboard', code: 'KeyM',
      modifiers: { ctrl: true, shift: true }
    })).toEqual({ ok: false, reason: 'CONFLICT' });
    // Same physical key with a *different* chord is not a collision.
    expect(rebindAction(map.bindings, {
      action: 'POTION', device: 'keyboard', code: 'KeyM', modifiers: { alt: true }
    }).ok).toBe(true);
  });

  it.each([
    { ctrl: true, alt: true }, { ctrl: false }, { shift: false },
    { alt: 'true' }, {}, { meta: true }, ['ctrl'], null
  ])('rejects invalid or AltGr modifier structures %#', modifiers => {
    expect(rebindAction(GAME_BINDINGS, {
      action: 'MAP', device: 'keyboard', code: 'KeyZ', modifiers
    } as unknown as InputBinding)).toEqual({ ok: false, reason: 'INVALID' });
  });

  it.each([
    ['KeyR', { ctrl: true }], ['KeyT', { ctrl: true }],
    ['KeyW', { ctrl: true, shift: true }], ['Digit1', { ctrl: true }],
    ['Tab', { alt: true }], ['ArrowLeft', { alt: true }],
    ['F4', { alt: true }], ['KeyD', { alt: true }],
    ['ShiftLeft', { ctrl: true }]
  ])('refuses browser/system shortcut %s + %j', (code, modifiers) => {
    expect(rebindAction(GAME_BINDINGS, {
      action: 'MAP', device: 'keyboard', code, modifiers
    } as InputBinding)).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('never dispatches game actions through Meta, text input, or UI capture', () => {
    expect(key('KeyM', { metaKey: true })).toBeNull();
    const r = rebindAction(GAME_BINDINGS, {
      action: 'MAP', device: 'keyboard', code: 'KeyM', modifiers: { ctrl: true }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(key('KeyM', { ctrlKey: true, isTyping: true }, r.bindings)).toBeNull();
    expect(key('KeyM', { ctrlKey: true, uiCaptured: true }, r.bindings)).toBeNull();
    expect(key('KeyM', { ctrlKey: true, metaKey: true }, r.bindings)).toBeNull();
    expect(key('KeyM', { ctrlKey: true, altKey: true }, r.bindings)).toBeNull();
  });

  it('restores legacy v1 records and new chord records without mutating defaults', () => {
    const result = applyBindingOverrides(GAME_BINDINGS, [
      { action: 'PRIMARY', device: 'mouse', button: 2 },
      { action: 'SECONDARY', device: 'mouse', button: 0 },
      { action: 'MAP', device: 'keyboard', code: 'KeyM', modifiers: { ctrl: true } }
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(key('KeyM', { ctrlKey: true }, result.bindings)).toBe('MAP');
    expect(shortcutHint(result.bindings, 'SECONDARY')).toBe('LMB');
    expect(key('Digit1', {}, result.bindings)).toBe('SLOT_1');
    expect(key('KeyM')).toBe('MAP');
    expect(applyBindingOverrides(GAME_BINDINGS, [
      { action: 'MAP', device: 'keyboard', code: 'KeyM',
        modifiers: { ctrl: false } } as unknown as InputBinding
    ])).toEqual({ ok: false, reason: 'INVALID' });
    const mutated = result.bindings.find(b => b.action === 'MAP');
    if (mutated?.device !== 'keyboard' || !mutated.modifiers) return;
    mutated.modifiers.ctrl = false as never;
    expect(GAME_BINDINGS.find(b => b.action === 'MAP')).toEqual({
      action: 'MAP', device: 'keyboard', code: 'KeyM'
    });
  });

  it('keeps standalone modifier keys valid for HOLD_POSITION', () => {
    const r = rebindAction(GAME_BINDINGS, {
      action: 'HOLD_POSITION', device: 'keyboard', code: 'ControlLeft'
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(key('ControlLeft', { ctrlKey: true }, r.bindings)).toBe('HOLD_POSITION');
    expect(key('ShiftLeft', { shiftKey: true }, r.bindings)).toBeNull();
    expect(shortcutHint(r.bindings, 'HOLD_POSITION')).toBe('Ctrl L');
  });
  it('releasing a required chord modifier clears only that held-key source', async () => {
    const { HeldPositionSources } = await import('../../src/game/input/heldPositionSources');
    const changes: boolean[] = [];
    const held = new HeldPositionSources(value => changes.push(value));
    held.keyDown('KeyM', { ctrl: true });
    held.releaseMissingModifiers({ ctrlKey: true, altKey: false, shiftKey: false });
    expect(held.active).toBe(true);
    held.releaseMissingModifiers({ ctrlKey: false, altKey: false, shiftKey: false });
    expect(held.active).toBe(false);
    held.keyUp('KeyM');
    expect(changes).toEqual([true, false]);
  });

  it('does not cancel another held pointer or Shift when one chord modifier is lifted', async () => {
    const { HeldPositionSources } = await import('../../src/game/input/heldPositionSources');
    const changes: boolean[] = [];
    const held = new HeldPositionSources(value => changes.push(value));
    held.pointerDown(1, 2);
    held.keyDown('KeyZ', { alt: true, shift: true });
    held.keyDown('ShiftLeft');
    held.releaseMissingModifiers({ ctrlKey: false, altKey: false, shiftKey: true });
    expect(held.active).toBe(true);
    held.keyUp('ShiftLeft');
    expect(held.active).toBe(true);
    held.pointerUp(1, 2);
    expect(changes).toEqual([true, false]);
  });

});
