import { describe, expect, it } from 'vitest';
import { planPointerUiAction, type PointerUiState } from '../../src/game/input/pointerUiActions';
import { GAME_BINDINGS } from '../../src/game/input/gameBindings';
import { rebindAction, resolvePointerAction, type InputAction } from '../../src/game/input/bindings';

describe('Issue #153: mouse UI mapping follows panel state', () => {
  it.each([
    ['MAP', 'openMap'], ['TALENTS', 'openTalents'],
    ['INVENTORY', 'openInventory'], ['CHARACTER', 'openCharacter'],
    ['MENU', 'togglePause']
  ] as const)('opens %s only from a bare gameplay canvas', (action, operation) => {
    expect(planPointerUiAction(action, 'gameplay', 'canvas')).toBe(operation);
    expect(planPointerUiAction(action, 'gameplay', 'other')).toBeNull();
    expect(planPointerUiAction(action, 'gameplay', 'backdrop')).toBeNull();
  });

  it.each([
    ['map', 'MAP', 'closeMap'], ['talents', 'TALENTS', 'closeTalents'],
    ['inventory', 'INVENTORY', 'closeInventory'],
    ['character', 'CHARACTER', 'closeCharacter'],
    ['pause', 'MENU', 'togglePause'], ['dialogue', 'MENU', 'closeDialogue']
  ] as const)('closes %s with its matching shortcut only on its backdrop', (state, action, operation) => {
    expect(planPointerUiAction(action, state, 'backdrop')).toBe(operation);
    expect(planPointerUiAction(action, state, 'canvas')).toBeNull();
    expect(planPointerUiAction(action, state, 'other')).toBeNull();
  });

  it.each([
    ['map', 'closeMap'], ['talents', 'closeTalents'],
    ['inventory', 'closeInventory'], ['character', 'closeCharacter']
  ] as const)('MENU closes existing %s before pausing or opening other panels', (state, operation) => {
    expect(planPointerUiAction('MENU', state, 'backdrop')).toBe(operation);
    expect(planPointerUiAction('MAP', state, 'other')).toBeNull();
    expect(planPointerUiAction('TALENTS', state, 'canvas')).toBeNull();
  });

  it('never executes combat or unsupported UI actions through the panel shortcut route', () => {
    for (const action of ['PRIMARY', 'SECONDARY', 'FORCE_MOVE', 'HOLD_POSITION',
      'POTION', 'EVADE', 'SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4', 'SLOT_5', 'SLOT_6',
      'SKILLS', 'JOURNAL'] as InputAction[]) {
      for (const state of ['gameplay','map','pause','blocked'] as PointerUiState[]) {
        expect(planPointerUiAction(action, state, 'canvas')).toBeNull();
        expect(planPointerUiAction(action, state, 'backdrop')).toBeNull();
      }
    }
  });

  it('keeps settings, controls, deaths and unrelated dialog content shielded', () => {
    for (const action of ['MAP', 'TALENTS', 'INVENTORY', 'CHARACTER', 'MENU'] as InputAction[]) {
      expect(planPointerUiAction(action, 'blocked', 'canvas')).toBeNull();
      expect(planPointerUiAction(action, 'blocked', 'backdrop')).toBeNull();
      expect(planPointerUiAction(action, 'dialogue', 'other')).toBeNull();
    }
    expect(planPointerUiAction('MAP', 'map', 'backdrop')).toBe('closeMap');
    expect(planPointerUiAction('INVENTORY', 'map', 'backdrop')).toBeNull();
    expect(planPointerUiAction('MAP', 'inventory', 'backdrop')).toBeNull();
  });

  it('accepts an actual validated rebound mouse action without breaking the defaults', () => {
    const result = rebindAction(GAME_BINDINGS, {
      action: 'MAP', device: 'mouse', button: 3
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const action = resolvePointerAction({ button: 3, uiCaptured: false }, result.bindings);
    expect(action).toBe('MAP');
    expect(planPointerUiAction(action, 'gameplay', 'canvas')).toBe('openMap');
    expect(resolvePointerAction({ button: 3, uiCaptured: true }, result.bindings)).toBeNull();
    expect(resolvePointerAction({ button: 0, uiCaptured: false }, result.bindings)).toBe('PRIMARY');
    expect(resolvePointerAction({ button: 2, uiCaptured: false }, result.bindings)).toBe('SECONDARY');
  });
});
