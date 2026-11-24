/** F1 — character-owned hotbar remapping, lifecycle and save validation. GPL-3.0-only. */
import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '../../src/game/data/classes';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { defaultHotbarLayout, swapHotbarSlots } from '../../src/game/input/hotbarRegistry';
import { dispatchCombatAction } from '../../src/game/input/combatActionDispatcher';
import type { GameCommand } from '../../src/game/core/types';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

describe('Issue #126 — persistent character-owned hotbar', () => {
  it.each(CLASS_IDS)('preserves the remapped %s layout through v11 save/load and resets on new hero', classId => {
    const game = new GameSimulation(0);
    game.command({ type: 'reset', classId, seed: 0 });
    const initial = game.snapshot();
    const layout = swapHotbarSlots(classId, defaultHotbarLayout(classId), 'SLOT_1', 'SLOT_6')!;
    game.command({ type: 'setHotbarLayout', layout });
    expect(game.snapshot().hotbarLayout).toEqual(layout);
    expect(game.snapshot().cooldowns).toEqual(initial.cooldowns);
    expect(game.snapshot().resource).toBe(initial.resource);
    expect(game.snapshot().gold).toBe(initial.gold);
    expect(game.character().hotbarLayout).toEqual(layout);
    // Caller-owned and projected arrays never mutate the authoritative mapping.
    layout.reverse();
    expect(game.character().hotbarLayout).not.toEqual(layout);
    const record = createSaveRecord(game.character())!;
    expect(record.format).toBe(11);
    const loaded = new GameSimulation(0);
    expect(loaded.restoreCharacter(readSaveRecord(record)!, 0)).toBe(true);
    expect(loaded.character()).toEqual(game.character());
    const commands: GameCommand[] = [];
    expect(dispatchCombatAction({
      snapshot: () => loaded.snapshot(), skillAim: () => null,
      pointerPosition: () => null, command: command => commands.push(command)
    }, 'SLOT_6')).toBe(true);
    expect(commands).toEqual([{ type: 'cast', slot: 'slot1' }]);
    loaded.command({ type: 'reset', classId, seed: 0 });
    expect(loaded.character().hotbarLayout).toBeUndefined();
  });

  it('rejects forged mappings without modifying a live character or resetting combat timers', () => {
    const game = new GameSimulation(0);
    const before = game.snapshot();
    const character = game.character();
    for (const layout of [defaultHotbarLayout('MAGE'), ['cleave'], Array(7).fill('cleave')]) {
      game.command({ type: 'setHotbarLayout', layout });
      expect(game.snapshot()).toEqual(before);
      expect(game.restoreCharacter({ ...character, hotbarLayout: layout }, 0)).toBe(false);
      expect(game.restore({ ...before, hotbarLayout: layout })).toBe(false);
      expect(createSaveRecord({ ...character, hotbarLayout: layout })).toBeNull();
      expect(game.snapshot()).toEqual(before);
    }
  });

  it('omits the default layout from saves, and restores defaults for older v11 characters', () => {
    const game = new GameSimulation(0);
    const old = game.character();
    expect(old.hotbarLayout).toBeUndefined();
    const layout = swapHotbarSlots('WARRIOR', defaultHotbarLayout('WARRIOR'), 'SECONDARY', 'SLOT_6')!;
    game.command({ type: 'setHotbarLayout', layout });
    expect(game.character().hotbarLayout).toEqual(layout);
    game.command({ type: 'setHotbarLayout', layout: defaultHotbarLayout('WARRIOR') });
    expect(game.character()).toEqual(old);
    expect(game.restoreCharacter(old, 0)).toBe(true);
    expect(game.character().hotbarLayout).toBeUndefined();
  });
});
