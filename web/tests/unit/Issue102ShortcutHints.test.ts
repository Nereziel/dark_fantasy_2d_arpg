import { describe, expect, it } from 'vitest';
import { GAME_BINDINGS } from '../../src/game/input/gameBindings';
import { rebindAction, type InputBinding } from '../../src/game/input/bindings';
import { shortcutHint } from '../../src/game/ui/shortcutHints';

describe('Issue #102: live shortcut hints', () => {
  it('uses the gameplay defaults and selects the primary key for multi-trigger slots', () => {
    expect(shortcutHint(GAME_BINDINGS, 'SECONDARY')).toBe('RMB');
    expect(shortcutHint(GAME_BINDINGS, 'SLOT_1')).toBe('1');
    expect(shortcutHint(GAME_BINDINGS, 'SLOT_2')).toBe('2');
    expect(shortcutHint(GAME_BINDINGS, 'SLOT_6')).toBe('6');
    expect(shortcutHint(GAME_BINDINGS, 'POTION')).toBe('Q');
    expect(shortcutHint(GAME_BINDINGS, 'TALENTS')).toBe('T');
    expect(shortcutHint(GAME_BINDINGS, 'INVENTORY')).toBe('I');
    expect(shortcutHint(GAME_BINDINGS, 'CHARACTER')).toBe('C');
  });

  it('immediately reflects new keyboard triggers without mutating original mappings', () => {
    const edited = rebindAction(GAME_BINDINGS, {
      action: 'SLOT_1', device: 'keyboard', code: 'KeyZ'
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(shortcutHint(edited.bindings, 'SLOT_1')).toBe('Z');
    expect(shortcutHint(GAME_BINDINGS, 'SLOT_1')).toBe('1');
    const potion = rebindAction(edited.bindings, {
      action: 'POTION', device: 'keyboard', code: 'Numpad7'
    });
    expect(potion.ok).toBe(true);
    if (!potion.ok) return;
    expect(shortcutHint(potion.bindings, 'POTION')).toBe('Num 7');
    expect(shortcutHint(potion.bindings, 'SLOT_1')).toBe('Z');
  });

  it('distinguishes physical mouse buttons for left-handed configurations', () => {
    const custom: InputBinding[] = [
      { action: 'SECONDARY', device: 'mouse', button: 0 },
      { action: 'PRIMARY', device: 'mouse', button: 2 },
      { action: 'POTION', device: 'mouse', button: 3 },
      { action: 'MAP', device: 'keyboard', code: 'Escape' },
      { action: 'TALENTS', device: 'keyboard', code: 'ShiftRight' }
    ];
    expect(shortcutHint(custom, 'SECONDARY')).toBe('LMB');
    expect(shortcutHint(custom, 'PRIMARY')).toBe('RMB');
    expect(shortcutHint(custom, 'POTION')).toBe('Mouse 4');
    expect(shortcutHint(custom, 'MAP')).toBe('Esc');
    expect(shortcutHint(custom, 'TALENTS')).toBe('Shift R');
  });

  it('never displays a stale shortcut when an action has no valid trigger', () => {
    expect(shortcutHint([], 'SLOT_2')).toBe('—');
    expect(shortcutHint([{ action: 'SLOT_2', device: 'mouse', button: 8 } as InputBinding], 'SLOT_2')).toBe('—');
    expect(shortcutHint([{ action: 'SLOT_2', device: 'keyboard', code: '' }], 'SLOT_2')).toBe('—');
  });
});
