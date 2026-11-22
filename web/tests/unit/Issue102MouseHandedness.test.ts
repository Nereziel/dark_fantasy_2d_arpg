import { describe, expect, it } from 'vitest';
import { GAME_BINDINGS } from '../../src/game/input/gameBindings';
import {
  applyBindingOverrides, rebindAction, resolveKeyboardAction, resolvePointerAction,
  swapPrimarySecondaryMouse, type InputBinding
} from '../../src/game/input/bindings';

const pointer = (button: number, bindings: readonly InputBinding[]) =>
  resolvePointerAction({ button, uiCaptured: false }, bindings);
const key = (code: string, bindings: readonly InputBinding[]) =>
  resolveKeyboardAction({ code, isTyping: false, uiCaptured: false }, bindings);

describe('Issue #102: atomic left-handed mouse settings', () => {
  it('switches LMB/RMB gameplay actions without affecting force move or defaults', () => {
    const original = GAME_BINDINGS.map(binding => ({ ...binding }));
    const swapped = swapPrimarySecondaryMouse(GAME_BINDINGS);
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(pointer(0, swapped.bindings)).toBe('SECONDARY');
    expect(pointer(2, swapped.bindings)).toBe('PRIMARY');
    expect(pointer(1, swapped.bindings)).toBe('FORCE_MOVE');
    expect(key('Digit1', swapped.bindings)).toBe('SLOT_1');
    expect(key('KeyM', swapped.bindings)).toBe('MAP');
    expect(GAME_BINDINGS).toEqual(original);
    expect(pointer(0, GAME_BINDINGS)).toBe('PRIMARY');
  });

  it('reverses cleanly and preserves all original physical triggers', () => {
    const first = swapPrimarySecondaryMouse(GAME_BINDINGS);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = swapPrimarySecondaryMouse(first.bindings);
    expect(second).toEqual({ ok: true, bindings: GAME_BINDINGS.map(binding => ({ ...binding })) });
  });

  it('rehydrates swapped mouse assignments as atomic v1 overrides after reload', () => {
    const swapped = swapPrimarySecondaryMouse(GAME_BINDINGS);
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    const overrides = swapped.bindings.filter(binding => ['PRIMARY', 'SECONDARY'].includes(binding.action));
    expect(rebindAction(GAME_BINDINGS, overrides[0])).toEqual({ ok: false, reason: 'CONFLICT' });
    const parsed: InputBinding[] = JSON.parse(JSON.stringify(overrides));
    const restored = applyBindingOverrides(GAME_BINDINGS, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    // Persisted v1 overrides are grouped by action, not by their previous
    // physical button order; compare triggers semantically, not by index.
    expect(restored.bindings).toHaveLength(swapped.bindings.length);
    for (const trigger of swapped.bindings) {
      expect(restored.bindings).toContainEqual(trigger);
    }
    expect(pointer(0, restored.bindings)).toBe('SECONDARY');
    expect(pointer(2, restored.bindings)).toBe('PRIMARY');
  });

  it('preserves legacy single-action keyboard overrides and unchanged dual Shift keys', () => {
    const result = applyBindingOverrides(GAME_BINDINGS, [
      { action: 'MAP', device: 'keyboard', code: 'KeyO' },
      { action: 'TALENTS', device: 'keyboard', code: 'KeyP' }
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(key('KeyO', result.bindings)).toBe('MAP');
    expect(key('KeyM', result.bindings)).toBeNull();
    expect(key('ShiftLeft', result.bindings)).toBe('HOLD_POSITION');
    expect(key('ShiftRight', result.bindings)).toBe('HOLD_POSITION');
  });

  it('preserves unrelated custom mouse and keyboard bindings while switching', () => {
    const entries: InputBinding[] = [
      { action: 'PRIMARY', device: 'mouse', button: 4 },
      { action: 'SECONDARY', device: 'mouse', button: 3 },
      { action: 'FORCE_MOVE', device: 'mouse', button: 1 },
      { action: 'POTION', device: 'keyboard', code: 'KeyV' },
      { action: 'INVENTORY', device: 'keyboard', code: 'KeyO' }
    ];
    const swapped = swapPrimarySecondaryMouse(entries);
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(pointer(4, swapped.bindings)).toBe('SECONDARY');
    expect(pointer(3, swapped.bindings)).toBe('PRIMARY');
    expect(key('KeyV', swapped.bindings)).toBe('POTION');
    expect(key('KeyO', swapped.bindings)).toBe('INVENTORY');
    expect(entries[0].action).toBe('PRIMARY');
  });

  it('rejects unknown triggers, collisions and incomplete layouts without mutation', () => {
    const malformed: InputBinding[] = [
      { action: 'PRIMARY', device: 'mouse', button: 9 },
      { action: 'SECONDARY', device: 'mouse', button: 2 }
    ];
    expect(swapPrimarySecondaryMouse(malformed)).toEqual({ ok: false, reason: 'INVALID' });
    const conflict: InputBinding[] = [
      { action: 'PRIMARY', device: 'mouse', button: 2 },
      { action: 'SECONDARY', device: 'mouse', button: 2 }
    ];
    expect(swapPrimarySecondaryMouse(conflict)).toEqual({ ok: false, reason: 'CONFLICT' });
    expect(swapPrimarySecondaryMouse([{ action: 'PRIMARY', device: 'mouse', button: 0 }]))
      .toEqual({ ok: false, reason: 'INVALID' });
    expect(conflict[0].action).toBe('PRIMARY');
  });

  it('rejects invalid persisted v1 entries and collisions without partially applying overrides', () => {
    expect(applyBindingOverrides(GAME_BINDINGS, [
      { action: 'MAP', device: 'keyboard', code: 'KeyC' }
    ])).toEqual({ ok: false, reason: 'CONFLICT' });
    expect(applyBindingOverrides(GAME_BINDINGS, [
      { action: 'PRIMARY', device: 'mouse', button: 8 }
    ])).toEqual({ ok: false, reason: 'INVALID' });
    expect(applyBindingOverrides(GAME_BINDINGS, [
      { action: 'MAP', device: 'keyboard', code: 'KeyO' },
      { action: 'TALENTS', device: 'keyboard', code: 'KeyO' }
    ])).toEqual({ ok: false, reason: 'CONFLICT' });
    expect(pointer(0, GAME_BINDINGS)).toBe('PRIMARY');
    expect(key('KeyM', GAME_BINDINGS)).toBe('MAP');
  });
});
