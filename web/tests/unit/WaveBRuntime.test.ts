import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createPack, packTypesForWave } from '../../src/game/enemies/enemies';
import { generateWorld } from '../../src/game/world/generator';

const frame = 1000 / 60;
const advance = (sim: GameSimulation, ticks: number) => {
  for (let n = 0; n < ticks; n++) sim.advance(frame + 0.001);
};
function warriorNearSkeleton(): GameSimulation {
  const sim = new GameSimulation();
  const state = sim.snapshot();
  expect(sim.restore({
    ...state,
    player: { ...state.player, x: 860, y: 635 },
    enemies: state.enemies.map((unit, index) => ({
      ...unit, cooldown: 3,
      ...(index === 1 ? {} : { actor: { ...unit.actor, alive: false, health: 0 } })
    }))
  })).toBe(true);
  return sim;
}

describe('Wave B integrated Warrior abilities and status engine', () => {
  it('casts War Cry on an authoritative hit tick, gains Rage and exposes active statuses', () => {
    const sim = new GameSimulation();
    const before = sim.snapshot();
    sim.command({ type: 'warriorAbility', id: 'warCry' });
    expect(sim.snapshot().warriorAction?.id).toBe('warCry');
    expect(sim.snapshot().resource).toBe(before.resource);
    advance(sim, 6);
    expect(sim.snapshot().statusEffects?.player).toHaveLength(0);
    advance(sim, 14);
    const after = sim.snapshot();
    expect(after.resource).toBeGreaterThan(before.resource);
    expect(after.statusEffects?.player.some(effect => effect.id === 'haste')).toBe(true);
    expect(after.statusEffects?.player.some(effect => effect.id === 'fortified')).toBe(true);
    expect(after.warriorCooldowns?.warCry).toBeGreaterThan(0);
  });

  it('applies Execute only after windup and starts its Rage cooldown', () => {
    const sim = warriorNearSkeleton();
    const before = sim.snapshot();
    const enemy = before.enemies[1]!.actor;
    sim.command({ type: 'warriorAbility', id: 'execute', targetId: enemy.id });
    expect(sim.snapshot().resource).toBe(before.resource - 20);
    expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
    advance(sim, 10);
    expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
    advance(sim, 22);
    expect(sim.snapshot().enemies[1]!.actor.health).toBeLessThan(enemy.health);
    expect(sim.snapshot().warriorCooldowns?.execute).toBeGreaterThan(0);
  });

  it('prevents hold-position from initiating out-of-range auto-approach', () => {
    const sim = new GameSimulation();
    const before = sim.snapshot();
    sim.command({ type: 'holdPosition', value: true });
    sim.command({ type: 'warriorAbility', id: 'execute', targetId: before.enemies[1]!.actor.id });
    advance(sim, 10);
    expect(sim.snapshot().player.x).toEqual(before.player.x);
    expect(sim.snapshot().warriorAction).toBeNull();
    expect(sim.snapshot().warriorCooldowns?.execute ?? 0).toBe(0);
  });

  it('keeps new combat runtime state out of character-only saves', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'warriorAbility', id: 'warCry' });
    advance(sim, 21);
    const character = sim.character();
    expect('statusEffects' in character).toBe(false);
    expect('warriorCooldowns' in character).toBe(false);
    expect('warriorAction' in character).toBe(false);
  });
  it('spawns all Wave B family rosters deterministically after the tutorial', () => {
    expect(packTypesForWave(0)).toEqual(['wraith', 'skeleton', 'wolf']);
    expect(packTypesForWave(1)).toEqual(['wraith', 'skeleton', 'wolf']);
    expect(packTypesForWave(2)).toEqual(['skeletonArcher', 'ghoul', 'zombie']);
    expect(packTypesForWave(3)).toEqual(['spider', 'corruptedBoar', 'skeletonMage']);
    expect(packTypesForWave(4)).toEqual(['banditFighter', 'banditArcher', 'banditRogue']);
    expect(packTypesForWave(5)).toEqual(['fanatic', 'cultMage', 'cultHealer']);
    const sim = new GameSimulation();
    const state = sim.snapshot();
    const encounter = createPack(2, 1, generateWorld(state.worldSeed).encounterPositions);
    expect(sim.restore({ ...state, wave: 2, selectedTargetId: null, enemies: encounter })).toBe(true);
    expect(sim.snapshot().enemies.map(u => u.actor.type)).toEqual(packTypesForWave(2));
  });

  it('cultist healer uses tactical AI to heal an injured nearby ally', () => {
    const sim = new GameSimulation();
    const state = sim.snapshot();
    const pack = createPack(5, 1, generateWorld(state.worldSeed).encounterPositions);
    pack[1]!.actor.health = Math.floor(pack[1]!.actor.maxHealth / 5);
    for (const unit of pack) unit.cooldown = unit.actor.type === 'cultHealer' ? 0 : 10;
    expect(sim.restore({
      ...state, wave: 5, selectedTargetId: null,
      player: { ...state.player, x: 860, y: 635 },
      enemies: pack
    })).toBe(true);
    const damaged = sim.snapshot().enemies[1]!.actor.health;
    advance(sim, 4);
    expect(sim.snapshot().enemies[1]!.actor.health).toBeGreaterThan(damaged);
    expect(sim.drainEvents().some(event => event.type === 'enemyHeal')).toBe(true);
  });

});
