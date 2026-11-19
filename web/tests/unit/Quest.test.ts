import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';
import { QUEST_REWARD_GOLD, QUEST_REQUIRED_KILLS, validQuest, WARDEN_ID } from '../../src/game/quests/firstQuest';
import { WARDEN_POSITION } from '../../src/game/world/npcs';

const tick = (sim: GameSimulation, frames = 5): void => {
  for (let i = 0; i < frames; i++) sim.advance(16.667);
};
function defeat(sim: GameSimulation, index: number): void {
  const state = sim.snapshot();
  const unit = state.enemies[index]!;
  expect(sim.restore({
    ...state,
    player: { ...state.player, x: unit.actor.x - 34, y: unit.actor.y },
    selectedTargetId: null,
    enemies: state.enemies.map((u, j) => j === index ? {
      ...u,
      actor: { ...u.actor, health: 1 },
      cooldown: 5, intent: null, effects: []
    } : {
      ...u, cooldown: 5, intent: null, effects: []
    })
  })).toBe(true);
  sim.command({ type: 'attack', targetId: unit.actor.id });
  tick(sim, 5);
  expect(sim.snapshot().enemies[index]!.actor.alive).toBe(false);
}

describe('first permanent campaign quest and NPC interaction', () => {
  it('offers a quest in camp and does not accept it from arbitrary distances', () => {
    const sim = new GameSimulation(1);
    expect(sim.snapshot().quest).toEqual({
      id: 'ashes_at_gate', status: 'available', defeated: 0
    });
    const initial = sim.snapshot();
    const farAway = { ...initial, player: { ...initial.player, x: 820, y: 500 } };
    expect(sim.restore(farAway)).toBe(true);
    sim.command({ type: 'questAccept' });
    expect(sim.snapshot().quest.status).toBe('available');
    sim.command({ type: 'interactNpc', npcId: WARDEN_ID });
    tick(sim, 240);
    expect(sim.drainEvents().some(e => e.type === 'npcDialogue')).toBe(true);
    expect(Math.hypot(sim.snapshot().player.x - WARDEN_POSITION.x,
      sim.snapshot().player.y - WARDEN_POSITION.y)).toBeLessThanOrEqual(106);
    sim.command({ type: 'pause', value: true });
    sim.command({ type: 'questAccept' });
    expect(sim.snapshot().quest.status).toBe('active');
  });

  it('counts only defeated enemies after acceptance and awards the reward once', () => {
    const sim = new GameSimulation(0);
    defeat(sim, 0);
    expect(sim.snapshot().quest).toMatchObject({ status: 'available', defeated: 0 });
    sim.command({ type: 'questAccept' });
    expect(sim.snapshot().quest.status).toBe('available'); // not at the warden
    // Return to camp for the quest.
    const previous = sim.snapshot();
    expect(sim.restore({
      ...previous,
      player: { ...previous.player, x: 390, y: 470 }
    })).toBe(true);
    sim.command({ type: 'questAccept' });
    expect(sim.snapshot().quest).toMatchObject({ status: 'active', defeated: 0 });
    // Reset combat only to obtain three live targets; quest state persists.
    const state = sim.snapshot();
    expect(sim.restore({
      ...state,
      enemies: state.enemies.map((u, i) => i === 0 ? {
        ...u, actor: { ...u.actor, health: u.actor.maxHealth, alive: true }
      } : u)
    })).toBe(true);
    for (let i = 0; i < 3; i++) {
      defeat(sim, i);
      expect(sim.snapshot().quest.defeated).toBe(i + 1);
    }
    expect(sim.snapshot().quest.status).toBe('ready');
    sim.command({ type: 'questTurnIn' });
    expect(sim.snapshot().quest.status).toBe('ready'); // outside camp
    const completed = sim.snapshot();
    expect(sim.restore({ ...completed, player: { ...completed.player, x: 390, y: 470 } })).toBe(true);
    const before = sim.snapshot();
    sim.command({ type: 'questTurnIn' });
    expect(sim.snapshot().quest.status).toBe('completed');
    expect(sim.snapshot().gold).toBe(before.gold + QUEST_REWARD_GOLD);
    const rewarded = sim.snapshot();
    sim.command({ type: 'questTurnIn' });
    expect(sim.snapshot().gold).toBe(rewarded.gold);
    expect(sim.snapshot().xp).toBe(rewarded.xp);
    expect(QUEST_REQUIRED_KILLS).toBe(3);
  });

  it('keeps quest progress through character-only saves while replacing the world', () => {
    const sim = new GameSimulation(11);
    sim.command({ type: 'questAccept' });
    const state = sim.snapshot();
    const quest = { ...state.quest, status: 'active' as const, defeated: 2 };
    expect(sim.restore({ ...state, quest })).toBe(true);
    const record = createSaveRecord(sim.character());
    expect(record?.format).toBe(8);
    expect(record?.character.quest).toEqual(quest);
    expect(JSON.stringify(record)).not.toContain('worldSeed');
    const next = new GameSimulation(123);
    expect(next.restoreCharacter(readSaveRecord(record)!, 987)).toBe(true);
    expect(next.character().quest).toEqual(quest);
    expect(next.snapshot().worldSeed).toBe(987);
    expect(next.snapshot().player.health).toBe(next.snapshot().player.maxHealth);
    expect(next.snapshot().enemies.every(u => u.actor.alive)).toBe(true);
  });

  it('rejects impossible quest states and does not corrupt the current hero', () => {
    const sim = new GameSimulation(0);
    const hero = sim.character();
    expect(validQuest({ id: 'ashes_at_gate', status: 'ready', defeated: 1 })).toBe(false);
    expect(validQuest({ id: 'ashes_at_gate', status: 'completed', defeated: 3 })).toBe(true);
    expect(sim.restoreCharacter({ ...hero, quest: {
      id: 'ashes_at_gate', status: 'completed', defeated: 1
    } })).toBe(false);
    expect(sim.character()).toEqual(hero);
    expect(readSaveRecord({ format: 6, characterId: 'hero', character: hero })).toBeNull();
  });
});
