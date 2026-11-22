import { describe, expect, it } from 'vitest';
import {
  rebindAction, resolveKeyboardAction, type InputBinding, type KeyboardInput
} from '../../src/game/input/bindings';
import { GAME_BINDINGS } from '../../src/game/input/gameBindings';

function press(input: Partial<KeyboardInput>, bindings: readonly InputBinding[] = GAME_BINDINGS) {
  return resolveKeyboardAction({
    code: 'KeyM', uiCaptured: false, isTyping: false, ...input
  }, bindings);
}

describe('Issue #153 — AltGr is not a gameplay shortcut', () => {
  it('does not fire ordinary shortcuts while AltGraph is reported on a key', () => {
    expect(press({ altGraphKey: true })).toBeNull();
    expect(press({
      altGraphKey: true, ctrlKey: true, altKey: true
    })).toBeNull();
    expect(press({ altGraphKey: false })).toBe('MAP');
  });

  it('blocks Ctrl+Alt platform fallback even when AltGraph is not exposed', () => {
    const mapped = rebindAction(GAME_BINDINGS, {
      action: 'HOLD_POSITION', device: 'keyboard', code: 'AltRight'
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(press({
      code: 'AltRight', ctrlKey: true, altKey: true
    }, mapped.bindings)).toBeNull();
    expect(press({
      code: 'AltRight', ctrlKey: true, altKey: true, altGraphKey: true
    }, mapped.bindings)).toBeNull();
    expect(press({
      code: 'AltRight', altKey: true
    }, mapped.bindings)).toBe('HOLD_POSITION');
  });

  it('does not let Ctrl+Alt invoke plain or explicit shortcuts', () => {
    const mapped = rebindAction(GAME_BINDINGS, {
      action: 'MAP', device: 'keyboard', code: 'KeyM',
      modifiers: { ctrl: true }
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(press({ ctrlKey: true }, mapped.bindings)).toBe('MAP');
    expect(press({
      ctrlKey: true, altKey: true
    }, mapped.bindings)).toBeNull();
    expect(press({
      ctrlKey: true, altKey: true, shiftKey: true
    }, mapped.bindings)).toBeNull();
  });

  it('fails closed on malformed AltGraph state and UI capture', () => {
    expect(press({ altGraphKey: 'true' } as unknown as KeyboardInput)).toBeNull();
    expect(press({ altGraphKey: true, uiCaptured: true })).toBeNull();
    expect(press({ altGraphKey: true, isTyping: true })).toBeNull();
  });
});
