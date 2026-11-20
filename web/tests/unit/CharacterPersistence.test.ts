import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createSaveRecord, readSaveRecord, validateCharacter } from '../../src/persistence/SaveRepository';
import { rollItem, SeededRng } from '../../src/game/data/items';
import type { GameSnapshot } from '../../src/game/core/types';

describe('Diablo-style character persistence', () => {
  it('restores character progression but creates a completely new world and combat session', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'MAGE' });
    const starting = sim.snapshot();
    const item = rollItem(1, 3, new SeededRng(42));
    const bag = Array.from({ length: 24 }, (_, index) => index === 0 ? item : null);
    const pending = {
      pattern: 'bolt' as const, x: 500, y: 510,
      radius: 45, remaining: 0.6, total: 1.15
    };
    const combat: GameSnapshot = {
      ...starting,
      player: { ...starting.player, x: 510, y: 500, health: starting.player.maxHealth - 90 },
      level: 3, xp: 42, kills: 8, gold: 555,
      cooldowns: { rmb: 2.4, slot1: 5.8 },
      resource: 15,
      rngState: 987654,
      wave: 0,
      selectedTargetId: 'skeleton-2',
      inventory: bag,
      enemies: starting.enemies.map((unit, index) => ({
        ...unit,
        actor: { ...unit.actor, health: unit.actor.health - (index + 1) * 5 },
        effects: index === 1
          ? [{ id: 'burning', remaining: 3, magnitude: 4, tick: 0.25 }] : [],
        intent: index === 0 ? pending : null
      })),
      effects: {
        player: [{ id: 'consecration', remaining: 3, magnitude: 0.7, tick: 0.4 }],
        enemy: []
      },
      groundLoot: [{
        id: 'drop-debug', x: 610, y: 510, item
      }]
    };
    expect(sim.restore(combat)).toBe(true);
    sim.command({ type: 'equip', index: 0 });
    const character = sim.character();
    const save = createSaveRecord(character, 1710000000)!;
    const savedText = JSON.stringify(save);

    for (const key of ['enemies', 'enemyIntent', 'cooldowns', 'effects',
      'groundLoot', 'selectedTargetId', 'respawnTimer', 'rngState', 'wave', 'player']) {
      expect(savedText).not.toContain('"' + key + '"');
    }
    expect(save.character.classId).toBe('MAGE');
    expect(save.character.level).toBe(3);
    expect(save.character.xp).toBe(42);
    expect(save.character.gold).toBe(555);
    expect(save.character.kills).toBe(8);
    expect(save.character.quest).toEqual({ id: 'ashes_at_gate', status: 'available', defeated: 0 });
    expect(Object.values(save.character.equipment).filter(Boolean)).toHaveLength(1);

    const loaded = readSaveRecord(JSON.parse(savedText));
    expect(loaded).toEqual(character);
    const nextSession = new GameSimulation();
    expect(nextSession.restoreCharacter(loaded!)).toBe(true);
    const state = nextSession.snapshot();

    expect(nextSession.character()).toEqual(character);
    expect(state.player.x).toBe(390);
    expect(state.player.y).toBe(470);
    expect(state.player.health).toBe(state.player.maxHealth);
    expect(state.wave).toBe(0);
    expect(state.enemies.map(unit => unit.actor.id))
      .toEqual(['wraith-1', 'skeleton-2', 'wolf-3']);
    expect(state.enemies.every(unit => unit.actor.alive
      && unit.actor.health === unit.actor.maxHealth
      && unit.intent === null
      && unit.effects.length === 0)).toBe(true);
    expect(state.groundLoot).toHaveLength(0);
    expect(state.selectedTargetId).toBeNull();
    expect(state.respawnTimer).toBe(0);
    expect(state.cooldowns).toEqual({ rmb: 0, slot1: 0 });
    expect(state.effects).toEqual({ player: [], enemy: [] });
    expect(state.resource).toBe(120);
    expect(state.rngState).toBe(new GameSimulation().snapshot().rngState);
  });

  it('fails safely on malformed character data without disturbing the current session', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'ROGUE' });
    const current = sim.snapshot();
    const hero = sim.character();
    expect(sim.restoreCharacter({ ...hero, gold: -1 })).toBe(false);
    expect(sim.restoreCharacter({ ...hero, inventory: [null] })).toBe(false);
    expect(sim.restoreCharacter({ ...hero, xp: Number.NaN })).toBe(false);
    expect(sim.restoreCharacter({ ...hero, classId: 'UNKNOWN' as typeof hero.classId })).toBe(false);
    expect(sim.snapshot()).toEqual(current);
    expect(validateCharacter(null)).toBeNull();
    expect(createSaveRecord({ ...hero, inventory: [] })).toBeNull();
    expect(readSaveRecord({ format: 5, snapshot: current })).toBeNull();
    expect(readSaveRecord({ format: 6, character: hero })).toBeNull();
    expect(readSaveRecord({ format: 7, character: hero })).toBeNull();
    expect(validateCharacter({ ...hero, quest: { id: 'ashes_at_gate', status: 'ready', defeated: 1 } })).toBeNull();
  });

  it('excludes snapshot-only data even if an untrusted caller supplies extra keys', () => {
    const sim = new GameSimulation();
    const raw = {
      ...sim.character(),
      enemies: [{ id: 'fake', health: 1 }],
      groundLoot: ['fake-item'],
      cooldowns: { rmb: 999 },
      player: { x: 999 }
    };
    const record = createSaveRecord(raw)!;
    expect(Object.keys(record.character).sort()).toEqual([
      'classId', 'equipment', 'gold', 'inventory', 'kills', 'level', 'quest', 'stash', 'skillPoints', 'talentPoints', 'xp'
    ].sort());
    expect(record.character).toEqual(sim.character());
  });
});
