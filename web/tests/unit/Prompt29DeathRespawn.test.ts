import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CAMP, CRYPT_GATE } from '../../src/game/world/generator';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { getTownManifest } from '../../src/game/world/townManifest';
import { WORLD_OBJECTS } from '../../src/game/world/interactables';
import {
  chooseRespawnDestination, validCheckpointIds, RESPAWN_PROTECTION_SECONDS
} from '../../src/game/core/deathRespawn';
import { createWorldRecord, readWorldRecord } from '../../src/persistence/WorldProgressRepository';

const shrine = WORLD_OBJECTS.find(object => object.id === 'soul-shrine')!;
const town = getTownManifest().find(entry => entry.role === 'waypoint')!;

function kill(sim: GameSimulation): void {
  const prior = sim.snapshot();
  (sim as unknown as { hitPlayer(amount: number): void })
    .hitPlayer(prior.player.maxHealth + 100);
  expect(sim.snapshot().player.alive).toBe(false);
}

describe('Prompt 29 death / respawn rules', () => {
  it('selects only an activated, reachable nearby checkpoint; uses town fallback', () => {
    const layout = buildWilderness(42).layout;
    expect(validCheckpointIds([])).toBe(true);
    expect(validCheckpointIds(['shrine.soul-shrine'])).toBe(true);
    expect(validCheckpointIds(['shrine.soul-shrine', 'shrine.soul-shrine'])).toBe(false);
    expect(validCheckpointIds(['crypt.fake'])).toBe(false);
    expect(validCheckpointIds(['__proto__'])).toBe(false);
    expect(chooseRespawnDestination('wilderness', shrine.position,
      ['shrine.soul-shrine'], layout)).toEqual({
      id: 'shrine.soul-shrine', position: shrine.position
    });
    expect(chooseRespawnDestination('wilderness', CAMP, ['shrine.soul-shrine'], layout))
      .toEqual({ id: 'town.waypoint', position: town.position });
    expect(chooseRespawnDestination('crypt', shrine.position,
      ['shrine.soul-shrine'], layout)).toEqual({
      id: 'town.waypoint', position: town.position
    });
  });

  it('stops movement, interactions, attacks and effects on death without resetting character', () => {
    const sim = new GameSimulation(42);
    const before = sim.character();
    sim.command({ type: 'move', destination: { x: 615, y: 510 } });
    kill(sim);
    const dead = sim.snapshot();
    expect(dead.status).toBe('dead');
    expect(dead.moveDestination).toBeNull();
    expect(dead.holdPosition).toBe(false);
    expect(dead.projectiles).toEqual([]);
    expect(dead.statusEffects?.player).toEqual([]);
    expect(dead.effects.player).toEqual([]);
    expect(dead.warriorAction).toBeNull();
    expect(dead.classAction).toBeNull();
    expect(dead.shield).toBe(0);
    expect(dead.respawnAt).toEqual({ id: 'town.waypoint', position: town.position });
    sim.command({ type: 'move', destination: { x: 1400, y: 900 } });
    sim.command({ type: 'usePortal' });
    sim.command({ type: 'interactObject', id: 'field-chest' });
    sim.command({ type: 'pause', value: true });
    sim.advance(1000);
    expect(sim.snapshot().status).toBe('dead');
    expect(sim.snapshot().player).toEqual(dead.player);
    expect(sim.character()).toEqual(before);
    expect(sim.drainEvents().filter(event => event.type === 'playerDeath')).toHaveLength(1);
  });

  it('respawns at activated Soul Shrine and persists checkpoint activation separately from character', () => {
    const sim = new GameSimulation(42);
    const start = sim.snapshot();
    expect(sim.restore({ ...start, player: { ...start.player, ...shrine.position } })).toBe(true);
    sim.command({ type: 'interactObject', id: 'soul-shrine' });
    expect(sim.snapshot().activatedCheckpointIds).toEqual(['shrine.soul-shrine']);
    const progress = sim.worldProgress()!;
    expect(progress.activatedCheckpointIds).toEqual(['shrine.soul-shrine']);
    expect(readWorldRecord(createWorldRecord(progress))?.activatedCheckpointIds)
      .toEqual(['shrine.soul-shrine']);
    const permanent = sim.character();
    kill(sim);
    expect(sim.snapshot().respawnAt?.id).toBe('shrine.soul-shrine');
    sim.command({ type: 'respawn' });
    const restored = sim.snapshot();
    expect(restored.player).toMatchObject({
      ...shrine.position, alive: true, health: restored.player.maxHealth
    });
    expect(restored.status).toBe('ready');
    expect(restored.zone).toBe('wilderness');
    expect(restored.respawnAt).toBeNull();
    expect(restored.respawnProtectionSeconds).toBe(RESPAWN_PROTECTION_SECONDS);
    expect(sim.character()).toEqual(permanent);
    expect(sim.worldProgress()?.activatedCheckpointIds).toEqual(['shrine.soul-shrine']);
    const health = restored.player.health;
    (sim as unknown as { dealPlayerDamage(base: number, type: 'physical', source: string): boolean })
      .dealPlayerDamage(99999, 'physical', 'unit-test');
    expect(sim.snapshot().player.health).toBe(health);
    expect(sim.drainEvents().filter(e => e.type === 'playerRespawn')).toHaveLength(1);
    const loaded = new GameSimulation(42);
    expect(loaded.restoreWorldProgress(progress)).toBe(true);
    expect(loaded.snapshot().activatedCheckpointIds).toEqual(['shrine.soul-shrine']);
    // A saved activation does not allow reusing the same shrine for XP or shield.
    expect(loaded.snapshot().interactables.some(object => object.id === 'soul-shrine'))
      .toBe(false);
    loaded.command({ type: 'respawn' });
    expect(loaded.snapshot().player.x).toBe(CAMP.x);
  });

  it('death inside the crypt returns to the safe town waypoint and resets combat state', () => {
    const sim = new GameSimulation(1);
    const first = sim.snapshot();
    expect(sim.restore({ ...first, player: { ...first.player, ...CRYPT_GATE } })).toBe(true);
    sim.command({ type: 'usePortal' });
    expect(sim.snapshot().zone).toBe('crypt');
    const character = sim.character();
    kill(sim);
    expect(sim.snapshot().respawnAt).toEqual({
      id: 'town.waypoint', position: town.position
    });
    sim.command({ type: 'respawn' });
    const resumed = sim.snapshot();
    expect(resumed.zone).toBe('wilderness');
    expect(resumed.player).toMatchObject({
      ...town.position, health: resumed.player.maxHealth, alive: true
    });
    expect(resumed.dungeonStage).toBe(0);
    expect(resumed.dungeonCleared).toBe(false);
    expect(resumed.enemies.every(enemy => enemy.intent === null)).toBe(true);
    expect(resumed.projectiles).toEqual([]);
    expect(resumed.hollowKing).toBeNull();
    expect(sim.character()).toEqual(character);
  });

  it('supports repeated death and rejects corrupted checkpoint records/snapshots', () => {
    const sim = new GameSimulation(0);
    for (let i = 0; i < 3; i++) {
      kill(sim);
      const dead = sim.snapshot();
      expect(sim.restore({ ...dead, activatedCheckpointIds: ['shrine.forged'] as never }))
        .toBe(false);
      expect(sim.snapshot()).toEqual(dead);
      sim.command({ type: 'respawn' });
      expect(sim.snapshot().player.alive).toBe(true);
      expect(sim.snapshot().player.health).toBe(sim.snapshot().player.maxHealth);
    }
    const before = sim.snapshot();
    sim.command({ type: 'respawn' });
    expect(sim.snapshot()).toEqual(before);
    const progress = sim.worldProgress()!;
    expect(readWorldRecord({ format: 1, characterId: 'hero', progress: {
      ...progress, activatedCheckpointIds: ['shrine.soul-shrine', 'shrine.soul-shrine']
    } })).toBeNull();
    const legacy = { ...progress };
    delete legacy.activatedCheckpointIds;
    expect(readWorldRecord(createWorldRecord(legacy))?.activatedCheckpointIds)
      .toBeUndefined();
    expect(new GameSimulation(0).restoreWorldProgress({

      ...progress, activatedCheckpointIds: ['fake'] as never
    })).toBe(false);
  });
});
