import { describe, it, expect } from 'vitest';
import { HeldPositionSources } from '../../src/game/input/heldPositionSources';
import { GAME_BINDINGS } from '../../src/game/input/gameBindings';
import { applyBindingOverrides, resolvePointerAction } from '../../src/game/input/bindings';

const make = () => {
  const emitted: boolean[] = [];
  const input = new HeldPositionSources(value => emitted.push(value));
  return { input, emitted };
};
describe('Issue 153: aggregated hold-position sources', () => {
  it('holds until both Shift keys are released and suppresses repeat emissions', () => {
    const { input, emitted } = make();
    input.keyDown('ShiftLeft'); input.keyDown('ShiftLeft');
    input.keyDown('ShiftRight'); input.keyUp('ShiftLeft');
    expect(input.active).toBe(true);
    input.keyUp('ShiftRight'); input.keyUp('ShiftRight');
    expect(emitted).toEqual([true, false]);
  });
  it('keyboard and pointer do not release each other', () => {
    const { input, emitted } = make();
    input.keyDown('ShiftLeft'); input.pointerDown(1, 2); input.keyUp('ShiftLeft');
    expect(input.active).toBe(true);
    expect(emitted).toEqual([true]);
    input.pointerUp(1, 2);
    input.pointerDown(1, 2); input.keyDown('ShiftRight'); input.pointerUp(1, 2);
    expect(input.active).toBe(true);
    input.keyUp('ShiftRight');
    expect(emitted).toEqual([true, false, true, false]);
  });
  it('ignores unknown releases, preserves other pointers/buttons until all released', () => {
    const { input, emitted } = make();
    input.pointerDown(1, 2); input.pointerDown(1, 2);
    input.pointerDown(1, 0); input.pointerDown(2, 2);
    input.pointerUp(99, 2); input.pointerUp(1, 3);
    input.pointerUp(1, 2); input.pointerCancel(1);
    expect(input.active).toBe(true);
    input.pointerCancel(2);
    expect(emitted).toEqual([true, false]);
  });
  it('clear on blur/pause/death/scene teardown is idempotent', () => {
    const { input, emitted } = make();
    input.keyDown('ShiftLeft'); input.pointerDown(1, 2);
    input.clear(); input.clear();
    input.keyUp('ShiftLeft'); input.pointerUp(1, 2);
    expect(input.active).toBe(false);
    expect(emitted).toEqual([true, false]);
  });
  it('rejects invalid pointer or button indices and empty keys', () => {
    const { input, emitted } = make();
    input.pointerDown(-1, 2); input.pointerDown(2.25, 2);
    input.pointerDown(1, 5); input.pointerDown(1, Number.NaN);
    input.pointerDown(Number.NaN, 2); input.keyDown('');
    expect(input.active).toBe(false);
    expect(emitted).toEqual([]);
  });
  it('restores multi-source HOLD_POSITION with legacy v1 overrides', () => {
    const result = applyBindingOverrides(GAME_BINDINGS, [
      { action: 'SECONDARY', device: 'keyboard', code: 'KeyY' },
      { action: 'HOLD_POSITION', device: 'keyboard', code: 'ShiftLeft' },
      { action: 'HOLD_POSITION', device: 'keyboard', code: 'ShiftRight' },
      { action: 'HOLD_POSITION', device: 'mouse', button: 2 }
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolvePointerAction({ button: 2, uiCaptured: false }, result.bindings))
      .toBe('HOLD_POSITION');
    expect(resolvePointerAction({ button: 2, uiCaptured: true }, result.bindings))
      .toBeNull();
  });
});
