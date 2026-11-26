/** F1 — saved builds are plans, never a second talent economy. GPL-3.0-only. */
import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '../../src/game/data/classes';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { defaultHotbarLayout, swapHotbarSlots } from '../../src/game/input/hotbarRegistry';
import { previewBuildPreset, validateBuildPresets } from '../../src/game/progression/buildPresets';
import { allTalentsForClass, respecGoldCost } from '../../src/game/progression/talentTree';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

describe('Issue #126 — three optional character build presets', () => {
  it.each(CLASS_IDS)('round-trips independent presets for %s', classId => {
    const game = new GameSimulation(0);
    game.command({ type: 'reset', classId, seed: 0 });
    const first = allTalentsForClass(classId).find(talent => talent.unlockLevel <= 10 && !talent.prerequisites.length)!;
    expect(game.restoreCharacter({ ...game.character(), level: 10, xp: 0, talentPoints: 2, gold: 1000 }, 0)).toBe(true);
    game.command({ type: 'spendTalent', id: first.id });
    const custom = swapHotbarSlots(classId, defaultHotbarLayout(classId), 'SLOT_1', 'SLOT_6')!;
    game.command({ type: 'setHotbarLayout', layout: custom });
    game.command({ type: 'captureBuildPreset', index: 0 });
    game.command({ type: 'setHotbarLayout', layout: defaultHotbarLayout(classId) });
    game.command({ type: 'captureBuildPreset', index: 2 });
    const saved = game.character();
    expect(saved.buildPresets?.map(p => p?.layout ?? null)).toEqual([custom, null, defaultHotbarLayout(classId)]);
    expect(saved.buildPresets?.[0]?.talentRanks).toEqual({ [first.id]: 1 });
    const record = createSaveRecord(saved)!;
    expect(record.format).toBe(11);
    const loaded = new GameSimulation(0);
    expect(loaded.restoreCharacter(readSaveRecord(record)!, 0)).toBe(true);
    expect(loaded.character()).toEqual(saved);
    loaded.command({ type: 'applyBuildPreset', index: 0 });
    expect(loaded.character().hotbarLayout).toEqual(custom);
    loaded.command({ type: 'clearBuildPreset', index: 0 });
    expect(loaded.character().buildPresets?.[0]).toBeNull();
    expect(loaded.character().buildPresets?.[2]).not.toBeNull();
    loaded.command({ type: 'reset', classId, seed: 0 });
    expect(loaded.character().buildPresets).toBeUndefined();
  });

  it('previews required respec gold but never performs one or changes combat state', () => {
    const game = new GameSimulation(0);
    expect(game.restoreCharacter({ ...game.character(), level: 10, xp: 0, talentPoints: 2, gold: 500 }, 0)).toBe(true);
    game.command({ type: 'spendTalent', id: 'berserker.battleFury' });
    game.command({ type: 'captureBuildPreset', index: 0 });
    game.command({ type: 'spendTalent', id: 'guardian.ironSkin' });
    const before = game.snapshot();
    const preview = previewBuildPreset(before, before.buildPresets![0]!);
    expect(preview?.respecRequired).toBe(true);
    expect(preview?.respecGold).toBe(respecGoldCost(before.level, before.talentRanks!));
    game.command({ type: 'applyBuildPreset', index: 0 });
    expect(game.snapshot()).toEqual(before);
    expect(game.character().talentRanks).toEqual({ 'berserker.battleFury': 1, 'guardian.ironSkin': 1 });
    const projected = game.character();
    projected.buildPresets![0]!.talentRanks['berserker.battleFury'] = 3;
    projected.buildPresets![0]!.layout.reverse();
    expect(game.character().buildPresets?.[0]?.talentRanks['berserker.battleFury']).toBe(1);
    expect(game.character().buildPresets?.[0]?.layout).toEqual(defaultHotbarLayout('WARRIOR'));
  });

  it('rejects malformed slots, foreign talents, locked ranks and invalid indices atomically', () => {
    const game = new GameSimulation(0);
    const before = game.snapshot();
    const saved = game.character();
    const layout = defaultHotbarLayout('WARRIOR');
    const valid = { layout, talentRanks: {} };
    for (const invalid of [
      [], [valid], [valid, null, null, null], Array(3), 
      [{ layout: defaultHotbarLayout('MAGE'), talentRanks: {} }, null, null],
      [{ layout, talentRanks: { 'berserker.battleFury': 1 } }, null, null],
      [{ layout, talentRanks: { 'rogue.precision': 1 } }, null, null],
      [{ layout, talentRanks: {}, gold: 9000 }, null, null]
    ]) {
      expect(validateBuildPresets('WARRIOR', 1, invalid)).toBe(false);
      expect(createSaveRecord({ ...saved, buildPresets: invalid })).toBeNull();
    }
    for (const index of [-1, 3, 0.5, NaN]) {
      game.command({ type: 'captureBuildPreset', index });
      game.command({ type: 'applyBuildPreset', index });
      game.command({ type: 'clearBuildPreset', index });
    }
    expect(game.snapshot()).toEqual(before);
    game.command({ type: 'pause', value: true });
    const paused = game.snapshot();
    game.command({ type: 'captureBuildPreset', index: 0 });
    expect(game.character().buildPresets?.[0]?.layout).toEqual(layout);
    expect(game.snapshot().paused).toBe(true);
    expect(game.snapshot().player).toEqual(paused.player);
    expect(game.snapshot().resource).toBe(paused.resource);
  });
});
