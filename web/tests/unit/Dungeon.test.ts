import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CAMP, CRYPT_BOSS_POSITIONS, CRYPT_EXIT, CRYPT_GATE, generateCrypt } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

const step = (sim: GameSimulation, frames: number): void => {
  for (let n = 0; n < frames; n++) sim.advance(16.667);
};
function enterCrypt(sim: GameSimulation): void {
  sim.command({ type: 'usePortal' });
  for (let i = 0; i < 240 && sim.snapshot().zone !== 'crypt'; i++) sim.advance(16.667);
  expect(sim.snapshot().zone).toBe('crypt');
}
function killUnit(sim: GameSimulation, index: number): void {
  const original = sim.snapshot();
  const target = original.enemies[index]!.actor;
  const player = { ...original.player, x: target.x - 34, y: target.y };
  expect(sim.restore({
    ...original,
    player,
    selectedTargetId: null,
    enemies: original.enemies.map((unit, i) => ({
      ...unit,
      actor: i === index ? { ...unit.actor, health: 1 } : { ...unit.actor },
      cooldown: 6, intent: null, effects: []
    }))
  })).toBe(true);
  sim.command({ type: 'attack', targetId: target.id });
  // Preserve fixed-tick impact timing while allowing the basic-attack cooldown
  // from the previous encounter to finish before this hit begins.
  for (let frame = 0; frame < 120 && sim.snapshot().enemies[index]!.actor.alive; frame++) {
    sim.advance(16.667);
  }
  expect(sim.snapshot().enemies[index]!.actor.alive).toBe(false);
}

describe('Crypt of the Hollow Crown', () => {
  it('generates deterministic playable tomb geometry, with distinct seeds', () => {
    for (const seed of [0, 1, 127, 8712, 49182, 0xffffffff]) {
      const layout = generateCrypt(seed);
      expect(layout).toEqual(generateCrypt(seed));
      expect(layout.obstacles.length).toBeGreaterThan(7);
      for (const point of [layout.camp, ...layout.encounterPositions, ...CRYPT_BOSS_POSITIONS]) {
        expect(canOccupy(point, ACTOR_RADIUS, layout.obstacles)).toBe(true);
        expect(findPath(layout.camp, point, ACTOR_RADIUS, layout.obstacles).length)
          .toBeGreaterThan(0);
      }
      expect(layout.camp).toEqual(CRYPT_EXIT);
    }
    expect(generateCrypt(41).obstacles).not.toEqual(generateCrypt(42).obstacles);
    expect(generateCrypt(41).encounterPositions).not.toEqual(generateCrypt(42).encounterPositions);
  });

  it('opens the crypt through a real portal and returns to the camp while keeping hero progression', () => {
    const sim = new GameSimulation(9371);
    const first = sim.snapshot();
    expect(first.zone).toBe('wilderness');
    expect(first.dungeonStage).toBe(0);
    expect(first.dungeonCleared).toBe(false);
    expect(canOccupy(CRYPT_GATE)).toBe(true);
    enterCrypt(sim);
    const inside = sim.snapshot();
    expect(inside.worldSeed).toBe(first.worldSeed);
    expect(inside.player).toMatchObject(CRYPT_EXIT);
    expect(inside.enemies.map(unit => unit.actor.type))
      .toEqual(['skeleton', 'wolf', 'wraith']);
    expect(inside.enemies[0]!.actor.maxHealth).toBeGreaterThan(100);
    expect(inside.enemies.every(unit => unit.intent === null)).toBe(true);
    const hero = sim.character();
    sim.command({ type: 'buyItem', offerId: 'belt' }); // no camp commerce inside
    sim.command({ type: 'questAccept' }); // no camp quest interactions inside
    expect(sim.character()).toEqual(hero);
    sim.command({ type: 'usePortal' });
    const outside = sim.snapshot();
    expect(outside.zone).toBe('wilderness');
    expect(outside.player).toMatchObject(CAMP);
    expect(outside.enemies.map(unit => unit.actor.type))
      .toEqual(['wraith', 'skeleton', 'wolf']);
    expect(sim.character()).toEqual(hero);
  });

  it('spawns the boss phase only after all three crypt guardians fall', () => {
    const sim = new GameSimulation(0);
    enterCrypt(sim);
    for (let i = 0; i < 3; i++) {
      killUnit(sim, i);
      expect(sim.snapshot().dungeonStage).toBe(0);
    }
    const first = sim.snapshot();
    expect(first.enemies.every(unit => !unit.actor.alive)).toBe(true);
    expect(first.respawnTimer).toBeGreaterThan(0);
    step(sim, 210);
    const second = sim.snapshot();
    expect(second.dungeonStage).toBe(1);
    expect(second.wave).toBe(1);
    expect(second.enemies.map(unit => unit.actor.type))
      .toEqual(['crypt_lord', 'skeleton', 'wraith']);
    expect(second.enemies[0]!.actor.maxHealth).toBeGreaterThan(400);
    expect(second.enemies[0]!.actor.id).toBe('crypt_lord-4');
    expect(second.dungeonCleared).toBe(false);
    expect(sim.drainEvents().some(event => event.type === 'defeat')).toBe(true);
  });

  it('awards the boss and a one-time crypt-clear bonus without endlessly respawning', () => {
    const sim = new GameSimulation(0);
    enterCrypt(sim);
    for (let i = 0; i < 3; i++) killUnit(sim, i);
    step(sim, 210);
    const goldBeforeBoss = sim.snapshot().gold;
    killUnit(sim, 0);
    expect(sim.snapshot().gold).toBeGreaterThan(goldBeforeBoss + 100);
    const bossLoot = sim.snapshot().groundLoot.find(drop => drop.id === 'drop-4');
    expect(bossLoot?.item.rarity).not.toBe('COMMON');
    killUnit(sim, 1);
    killUnit(sim, 2);
    step(sim, 3);
    const cleared = sim.snapshot();
    expect(cleared.dungeonCleared).toBe(true);
    const rewarded = sim.character();
    step(sim, 360);
    expect(sim.snapshot().enemies.every(unit => !unit.actor.alive)).toBe(true);
    expect(sim.snapshot().dungeonCleared).toBe(true);
    expect(sim.character()).toEqual(rewarded);
    expect(sim.drainEvents().filter(event => event.type === 'dungeonCleared')).toHaveLength(1);
  });

  it('does not save dungeon maps, current stage, boss progress or uncollected ground loot', () => {
    const sim = new GameSimulation(101);
    enterCrypt(sim);
    killUnit(sim, 0);
    const before = sim.snapshot();
    const save = createSaveRecord(sim.character());
    expect(save?.format).toBe(8);
    const text = JSON.stringify(save);
    for (const key of ['zone', 'dungeonStage', 'dungeonCleared', 'worldSeed',
      'enemies', 'groundLoot', 'cooldowns', 'effects', 'respawnTimer']) {
      expect(text).not.toContain('"' + key + '"');
    }
    const next = new GameSimulation(333);
    expect(next.restoreCharacter(readSaveRecord(save)!, 444)).toBe(true);
    const after = next.snapshot();
    expect(after.zone).toBe('wilderness');
    expect(after.worldSeed).toBe(444);
    expect(after.player).toMatchObject(CAMP);
    expect(after.enemies.every(unit => unit.actor.alive)).toBe(true);
    expect(after.groundLoot).toHaveLength(0);
    expect(next.character()).toEqual(sim.character());
    expect(before.zone).toBe('crypt');
  });

  it('validates crypt-only bosses, area transitions and the completed encounter state', () => {
    const sim = new GameSimulation(2);
    const wild = sim.snapshot();
    expect(sim.restore({ ...wild, zone: 'crypt' })).toBe(false);
    expect(sim.restore({ ...wild, dungeonStage: 1 })).toBe(false);
    expect(sim.restore({ ...wild, dungeonCleared: true })).toBe(false);
    expect(sim.snapshot()).toEqual(wild);
    enterCrypt(sim);
    const crypt = sim.snapshot();
    expect(sim.restore(structuredClone(crypt))).toBe(true);
    expect(sim.snapshot()).toEqual(crypt);
    expect(sim.restore({ ...crypt, dungeonStage: 1 })).toBe(false);
    expect(sim.restore({ ...crypt, dungeonCleared: true })).toBe(false);
    expect(sim.restore({ ...crypt, enemies: [] })).toBe(false);
  });
});
