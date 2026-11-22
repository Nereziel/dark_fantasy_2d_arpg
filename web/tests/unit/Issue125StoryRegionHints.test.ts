import { describe, expect, it } from 'vitest';
import { ACT_I_STORY_QUEST_IDS } from '../../src/game/quests/actIQuestChain';
import { activeStoryRegionHint } from '../../src/game/ui/storyRegionHints';

describe('Issue #125 — discoverable narrative guidance without map spoilers', () => {
  it('provides broad directions for current wilderness objectives only', () => {
    expect(activeStoryRegionHint('trail_of_black_ash', 'active'))
      .toBe('quest.actI.regionTrail');
    expect(activeStoryRegionHint('blighted_pack', 'active'))
      .toBe('quest.actI.regionBoars');
    expect(activeStoryRegionHint('forgotten_graves', 'active'))
      .toBe('quest.actI.regionGraves');
    expect(activeStoryRegionHint('morrow_gravebound', 'active'))
      .toBe('quest.actI.regionMorrow');
    expect(activeStoryRegionHint('seal_of_rot', 'active'))
      .toBe('quest.actI.regionSeal');
    expect(activeStoryRegionHint('crypt_descent', 'active'))
      .toBe('quest.actI.regionCrypt');
    expect(activeStoryRegionHint('vesnas_report', 'active'))
      .toBe('quest.actI.regionReport');
    expect(activeStoryRegionHint('crypt_lord_fallen', 'active')).toBeNull();
    expect(ACT_I_STORY_QUEST_IDS).toContain('trail_of_black_ash');
  });

  it('never leaks a future, completed, offered or forged quest direction', () => {
    for (const value of ['available', 'ready', 'completed', 'failed', null, undefined, '']) {
      expect(activeStoryRegionHint('trail_of_black_ash', value)).toBeNull();
    }
    for (const value of ['__proto__', 'constructor', 'future_quest', null, 42,
      {}, [], 'ashes_at_gate']) {
      expect(activeStoryRegionHint(value, 'active')).toBeNull();
    }
  });

  it('is a stable presentation lookup without mutating ledger input', () => {
    const state = Object.freeze({ questId: 'seal_of_rot', status: 'active' });
    expect(activeStoryRegionHint(state.questId, state.status)).toBe('quest.actI.regionSeal');
    expect(state).toEqual({ questId: 'seal_of_rot', status: 'active' });
  });
});
