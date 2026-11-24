import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { getTownManifest } from '../../src/game/world/townManifest';
import { WORLD_OBJECTS } from '../../src/game/world/interactables';
import { createWorldRecord, readWorldRecord } from '../../src/persistence/WorldProgressRepository';
import {
  WAYPOINT_IDS, waypointPosition, activatedWaypoints, planWaypointTravel
} from '../../src/game/world/waypointTravel';

const town = getTownManifest().find(e => e.id === 'waypoint_camp')!;
const shrine = WORLD_OBJECTS.find(e => e.id === 'soul-shrine')!;
function context(position = town.position) {
  return {
    world: buildWilderness(42).layout,
    zone: 'wilderness' as const,
    player: { ...position, alive: true },
    activated: [...WAYPOINT_IDS]
  };
}
function reposition(sim: GameSimulation, point: { x: number; y: number }): void {
  const previous = sim.snapshot();
  expect(sim.restore({ ...previous,
    player: { ...previous.player, ...point } })).toBe(true);
}

describe('Prompt 36 — canonical waypoint rules', () => {
  it('uses existing town and actual soul shrine, without changing procedural world fingerprint', () => {
    expect(WAYPOINT_IDS).toEqual(['town.waypoint', 'shrine.soul-shrine']);
    expect(waypointPosition('town.waypoint')).toEqual(town.position);
    expect(waypointPosition('shrine.soul-shrine')).toEqual(shrine.position);
    expect(waypointPosition('__proto__')).toBeNull();
    expect(activatedWaypoints(['town.waypoint'], [])).toEqual(['town.waypoint']);
    expect(activatedWaypoints(['town.waypoint'], ['shrine.soul-shrine']))
      .toEqual(['town.waypoint', 'shrine.soul-shrine']);
    expect(activatedWaypoints([], ['shrine.soul-shrine'])).toEqual(['shrine.soul-shrine']);
    expect(activatedWaypoints(['__proto__'], ['shrine.fake'])).toEqual([]);
  });
  it('permits only an activated source within reach and an activated safe destination', () => {
    const plan = planWaypointTravel(context(), 'shrine.soul-shrine');
    expect(plan).toMatchObject({
      from: 'town.waypoint', to: 'shrine.soul-shrine', position: shrine.position
    });
    expect(planWaypointTravel({ ...context(), activated: ['town.waypoint'] },
      'shrine.soul-shrine')).toBeNull();
    expect(planWaypointTravel({ ...context(), activated: ['shrine.soul-shrine'] },
      'shrine.soul-shrine')).toBeNull();
    expect(planWaypointTravel(context({x:390,y:470}), 'shrine.soul-shrine')).toBeNull();
    expect(planWaypointTravel(context(), 'town.waypoint')).toBeNull();
    expect(planWaypointTravel({ ...context(), zone:'crypt' }, 'shrine.soul-shrine')).toBeNull();
    expect(planWaypointTravel({ ...context(), player: { ...town.position, alive:false } },
      'shrine.soul-shrine')).toBeNull();
    for (const invalid of ['__proto__', 'constructor', '', null, {}, 3, Infinity]) {
      expect(planWaypointTravel(context(),invalid)).toBeNull();
    }
    for (const invalid of [
      ['town.waypoint','town.waypoint'],
      ['shrine.soul-shrine','fake'],
      ['__proto__'],
      Array(99).fill('town.waypoint')
    ]) expect(planWaypointTravel({ ...context(), activated: invalid as never }, 'shrine.soul-shrine'))
      .toBeNull();
  });
  it('fails closed on blocked destinations and invalid layouts', () => {
    const blocked = buildWilderness(42).layout;
    blocked.obstacles.push({ id:'blocked-waypoint', x:shrine.position.x-30,
      y:shrine.position.y-30, width:60, height:60 });
    expect(planWaypointTravel({ ...context(), world: blocked }, 'shrine.soul-shrine')).toBeNull();
    expect(planWaypointTravel({ ...context(), world:{ ...blocked, obstacles: [] }, 
      player:{ ...town.position, alive:true } }, 'shrine.soul-shrine')?.to)
      .toBe('shrine.soul-shrine');
  });
});

describe('Prompt 36 — simulation, map and persistence integration', () => {
  it('requires actual town and shrine activation, then travels both directions without resetting world facts', () => {
    const sim = new GameSimulation(42);
    const initial = sim.worldProgress()!;
    const oldFingerprint = initial.mapDiscovery.worldFingerprint;
    const start = sim.snapshot();
    sim.command({ type: 'travelWaypoint', destinationId: 'shrine.soul-shrine' });
    expect(sim.snapshot().player).toEqual(start.player);

    reposition(sim, town.position);
    sim.command({ type: 'interactTown', entryId: 'waypoint_camp' });
    expect(sim.snapshot().mapDiscovery?.activatedWaypointIds).toContain('town.waypoint');
    sim.command({ type: 'travelWaypoint', destinationId: 'shrine.soul-shrine' });
    expect(sim.snapshot().player.x).toBe(town.position.x);

    reposition(sim, shrine.position);
    sim.command({ type: 'interactObject', id: 'soul-shrine' });
    expect(sim.snapshot().activatedCheckpointIds).toEqual(['shrine.soul-shrine']);
    const before = sim.snapshot();
    const quest = sim.character().questLedger;
    const stash = sim.character().stash;
    const idHealth = before.enemies.map(enemy => [enemy.actor.id, enemy.actor.health]);
    const beforeWorld = sim.worldProgress()!;
    sim.command({ type: 'travelWaypoint', destinationId: 'town.waypoint' });
    const atTown = sim.snapshot();
    expect(atTown.player).toMatchObject(town.position);
    expect(atTown.player.health).toBe(before.player.health);
    expect(atTown.gold).toBe(before.gold);
    expect(atTown.kills).toBe(before.kills);
    expect(atTown.enemies.map(enemy => [enemy.actor.id, enemy.actor.health])).toEqual(idHealth);
    expect(atTown.projectiles).toEqual([]);
    expect(sim.character().questLedger).toEqual(quest);
    expect(sim.character().stash).toEqual(stash);
    expect(sim.worldProgress()?.mapDiscovery.worldFingerprint).toBe(oldFingerprint);
    expect(sim.worldProgress()?.activatedCheckpointIds).toEqual(beforeWorld.activatedCheckpointIds);
    const discoveredBefore = sim.worldProgress()!.mapDiscovery.revealedCells.length;
    sim.command({ type: 'travelWaypoint', destinationId: 'shrine.soul-shrine' });
    expect(sim.snapshot().player).toMatchObject(shrine.position);
    expect(sim.worldProgress()!.mapDiscovery.revealedCells.length).toBeGreaterThanOrEqual(discoveredBefore);
    expect(sim.mapProjection('world')?.markers).toEqual(expect.arrayContaining([
      expect.objectContaining({id:'shrine.soul-shrine',kind:'waypoint',activated:true})
    ]));
    const travelEvents = sim.drainEvents().filter(e=>e.type==='waypointTravel');
    expect(travelEvents).toHaveLength(2);
  });
  it('rejects remote and crypt travel, persists activation in world record format 1', () => {
    const sim = new GameSimulation(42);
    reposition(sim, shrine.position);
    sim.command({type:'interactObject',id:'soul-shrine'});
    const current = sim.snapshot();
    sim.command({type:'travelWaypoint',destinationId:'town.waypoint'});
    expect(sim.snapshot().player).toEqual(current.player);
    reposition(sim,town.position);
    sim.command({type:'interactTown',entryId:'waypoint_camp'});
    const world = sim.worldProgress()!;
    expect(readWorldRecord(createWorldRecord(world))).toEqual(world);
    expect(world.version).toBe(1);
    const reloaded = new GameSimulation(42);
    expect(reloaded.restoreWorldProgress(world)).toBe(true);
    expect(reloaded.worldProgress()?.mapDiscovery.activatedWaypointIds).toContain('town.waypoint');
    expect(reloaded.worldProgress()?.activatedCheckpointIds).toContain('shrine.soul-shrine');
    reposition(reloaded,town.position);
    reloaded.command({type:'travelWaypoint',destinationId:'shrine.soul-shrine'});
    expect(reloaded.snapshot().player).toMatchObject(shrine.position);
    const otherSeed = new GameSimulation(43);
    expect(otherSeed.restoreWorldProgress(world)).toBe(false);
  },15000);
});
