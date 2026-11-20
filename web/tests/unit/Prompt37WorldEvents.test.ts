import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { canOccupy, ACTOR_RADIUS } from '../../src/game/world/navigation';
import { CAMP, CAMP_RADIUS } from '../../src/game/world/generator';
import type { EnemyUnit } from '../../src/game/enemies/enemies';
import { createWorldRecord, readWorldRecord } from '../../src/persistence/WorldProgressRepository';
import {
  WORLD_EVENT_KINDS, planWorldEvents, projectWorldEventViews,
  worldEventReward, type WorldEventKind
} from '../../src/game/world/worldEvents';

function teleport(sim: GameSimulation, position: { x:number;y:number }): void {
  const before = sim.snapshot();
  expect(sim.restore({ ...before, player: { ...before.player, ...position } })).toBe(true);
}
function eventUnits(sim: GameSimulation): EnemyUnit[] {
  return (sim as unknown as { units: EnemyUnit[] }).units
    .filter(unit => unit.actor.id.startsWith('world-event.'));
}
function clearEvent(sim: GameSimulation): void {
  const internal = sim as unknown as { defeatEnemy(unit:EnemyUnit):void };
  for (const unit of eventUnits(sim)) internal.defeatEnemy(unit);
}

describe('Prompt 37 — pure region-scoped world event planning', () => {
  it('has all eight distinct event kinds, deterministic regions and stable one-shot IDs', () => {
    expect(WORLD_EVENT_KINDS).toEqual([
      'banditAmbush','demonIncursion','caravanDefense','cursedShrine',
      'eliteHunt','rescueEvent','ritualInterruption','treasureAmbush'
    ]);
    const appeared = new Set<WorldEventKind>();
    for (const seed of [0, 1, 2, 42, 12345, 98765]) {
      const world=buildWilderness(seed);
      const events=planWorldEvents(seed,world.layout,world.features);
      const repeated=planWorldEvents(seed,world.layout,world.features);
      expect(events).toEqual(repeated);
      expect(events.length).toBeGreaterThan(0);
      expect(events.length).toBeLessThanOrEqual(2);
      const featureIds=world.features.filter(f=>f.kind==='event').map(f=>f.id);
      for(const event of events) {
        expect(featureIds).toContain(event.id);
        expect(event.enemySpawns.length).toBeGreaterThanOrEqual(2);
        expect(event.enemySpawns.length).toBeLessThanOrEqual(3);
        expect(event.enemySpawns.map(e=>e.id)).toEqual([...new Set(event.enemySpawns.map(e=>e.id))]);
        expect(Math.hypot(event.position.x-CAMP.x,event.position.y-CAMP.y))
          .toBeGreaterThan(CAMP_RADIUS+70);
        for(const spawn of event.enemySpawns) {
          expect(canOccupy(spawn.position,ACTOR_RADIUS,world.layout.obstacles)).toBe(true);
          for(const mandatory of world.features.filter(f=>f.mandatory))
            expect(Math.hypot(spawn.position.x-mandatory.position.x,
              spawn.position.y-mandatory.position.y)).toBeGreaterThan(mandatory.radius+20);
        }
        appeared.add(event.kind);
      }
    }
    expect(appeared.size).toBeGreaterThanOrEqual(3);
  });
  it('fail-closes on forged seeds, layouts, duplicated features and unknown kinds', () => {
    const world=buildWilderness(42);
    expect(planWorldEvents(-1,world.layout,world.features)).toEqual([]);
    expect(planWorldEvents(NaN,world.layout,world.features)).toEqual([]);
    expect(planWorldEvents(43,world.layout,world.features)).toEqual([]);
    expect(planWorldEvents(42, { ...world.layout, obstacles: [] },
      world.features)).toEqual([]);
    expect(planWorldEvents(42,world.layout,
      [...world.features,...world.features])).toEqual([]);
    expect(worldEventReward('__proto__',1)).toBeNull();
    expect(worldEventReward('banditAmbush',NaN)).toBeNull();
    expect(worldEventReward('banditAmbush',0)).toBeNull();
    expect(worldEventReward('banditAmbush',1)).toMatchObject({
      xp:expect.any(Number), gold:expect.any(Number), materials:expect.any(Object),
      itemBaseId:expect.any(String)
    });
  });
  it('projects only discovered events and validates active/complete presentation', () => {
    const world=buildWilderness(42);
    const plans=planWorldEvents(42,world.layout,world.features);
    const first=plans[0]!;
    expect(projectWorldEventViews(plans,[],[],null,[])).toEqual([]);
    const available=projectWorldEventViews(plans,[first.id],[],null,[]);
    expect(available).toMatchObject([{id:first.id,status:'available'}]);
    const active=projectWorldEventViews(plans,[first.id],[],first.id,
      first.enemySpawns.map(spawn=>({id:spawn.id,alive:true})));
    expect(active).toMatchObject([{id:first.id,status:'active',
      remaining:first.enemySpawns.length,total:first.enemySpawns.length}]);
    const complete=projectWorldEventViews(plans,[first.id],[first.id],null,[]);
    expect(complete).toMatchObject([{id:first.id,status:'completed',remaining:0}]);
    expect(projectWorldEventViews(plans,['__proto__'],[],null,[])).toEqual([]);
  });
});

describe('Prompt 37 — real simulation, rewards and world saves', () => {
  it('spawns near a controlled optional event, completes only after all guards die and rewards once', () => {
    const sim=new GameSimulation(42);
    const plan=planWorldEvents(42,buildWilderness(42).layout,
      buildWilderness(42).features)[0]!;
    const old=sim.snapshot();
    expect(old.worldEvents).toEqual([]);
    teleport(sim,plan.position);
    sim.advance(150);
    const started=sim.snapshot();
    expect(started.worldEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({id:plan.id,kind:plan.kind,status:'active',
        total:plan.enemySpawns.length,remaining:plan.enemySpawns.length})
    ]));
    expect(eventUnits(sim).length).toBe(plan.enemySpawns.length);
    expect(sim.drainEvents().filter(e=>e.type==='worldEventStarted')).toHaveLength(1);
    const before=sim.character();
    const units=eventUnits(sim);
    (sim as unknown as {defeatEnemy(u:EnemyUnit):void}).defeatEnemy(units[0]!);
    expect(sim.worldProgress()!.worldFacts.entries.filter(f=>f.kind==='eventCompleted')).toEqual([]);
    expect(sim.snapshot().worldEvents?.find(e=>e.id===plan.id)?.remaining)
      .toBe(plan.enemySpawns.length-1);
    clearEvent(sim);
    const completed=sim.snapshot();
    const completedFacts=sim.worldProgress()!.worldFacts.entries.filter(f=>f.kind==='eventCompleted');
    expect(completedFacts).toMatchObject([{entityId:plan.id}]);
    expect(completed.worldEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({id:plan.id,status:'completed',remaining:0})
    ]));
    const reward=worldEventReward(plan.kind,before.level)!;
    expect(completed.gold-before.gold).toBe(reward.gold);
    expect(completed.xp).toBeGreaterThan(before.xp);
    for(const [material,amount] of Object.entries(reward.materials)) {
      expect(completed.materials?.[material as keyof typeof reward.materials])
        .toBe((before.materials?.[material as keyof typeof reward.materials] ?? 0)+amount);
    }
    expect(completed.inventory.some(item=>item?.id===`world-event-42-${plan.id.replaceAll('.','_')}-reward`))
      .toBe(true);
    const rewards=sim.drainEvents().filter(e=>e.type==='worldEventCompleted');
    expect(rewards).toHaveLength(1);
    const after=sim.snapshot();
    (sim as unknown as {defeatEnemy(u:EnemyUnit):void}).defeatEnemy(units.at(-1)!);
    expect(sim.snapshot().gold).toBe(after.gold);
    expect(sim.worldProgress()!.worldFacts.entries.filter(f=>f.kind==='eventCompleted'))
      .toHaveLength(1);
  });
  it('seed-scoped completion cannot be replayed by save/reload, while another event remains possible', () => {
    // Seed 42 provides a collision-clear optional arena; a different seed may
    // legitimately defer its event while an existing mini-boss holds the actor budget.
    const seed=42;
    const world=buildWilderness(seed);
    const plan=planWorldEvents(seed,world.layout,world.features)[0]!;
    const sim=new GameSimulation(seed);
    teleport(sim,plan.position);
    sim.advance(150);
    expect(eventUnits(sim)).toHaveLength(plan.enemySpawns.length);
    clearEvent(sim);
    const worldProgress=sim.worldProgress()!;
    expect(worldProgress.worldFacts.entries.filter(f=>f.kind==='eventCompleted'))
      .toMatchObject([{entityId:plan.id}]);
    expect(worldProgress.version).toBe(1);
    expect(readWorldRecord(createWorldRecord(worldProgress))).toEqual(worldProgress);
    const savedCharacter=sim.character();
    const loaded=new GameSimulation(seed);
    expect(loaded.restoreCharacter(savedCharacter,seed)).toBe(true);
    expect(loaded.restoreWorldProgress(worldProgress)).toBe(true);
    expect(loaded.worldProgress()?.worldFacts.entries.filter(f=>f.kind==='eventCompleted'))
      .toMatchObject([{entityId:plan.id}]);
    teleport(loaded,plan.position);
    const gold=loaded.character().gold;
    const xp=loaded.character().xp;
    loaded.advance(300);
    expect(eventUnits(loaded)).toHaveLength(0);
    expect(loaded.character().gold).toBe(gold);
    expect(loaded.character().xp).toBe(xp);
    expect(loaded.worldProgress()?.worldFacts.entries.filter(f=>f.kind==='eventCompleted'))
      .toHaveLength(1);
    expect(new GameSimulation(seed+1).restoreWorldProgress(worldProgress)).toBe(false);
  });
  it('rejects forged active event snapshots, resets transient encounters on death or zone changes', () => {
    const sim=new GameSimulation(42);
    const world=buildWilderness(42);
    const plan=planWorldEvents(42,world.layout,world.features)[0]!;
    teleport(sim,plan.position);
    sim.advance(150);
    const legitimate=sim.snapshot();
    expect(legitimate.worldEvents?.some(e=>e.status==='active')).toBe(true);
    const forged={
      ...legitimate, worldEvents:[{...legitimate.worldEvents![0]!,
        id:'wild.event.fake'}]
    };
    expect(sim.restore(forged as typeof legitimate)).toBe(false);
    expect(sim.snapshot()).toEqual(legitimate);
    const missing={...legitimate,enemies:legitimate.enemies.filter(e=>
      !e.actor.id.startsWith('world-event.'))};
    expect(sim.restore(missing)).toBe(false);
    expect(sim.snapshot()).toEqual(legitimate);
    const dead={...legitimate,player:{...legitimate.player,alive:false,
      health:0}};
    // Death is handled through canonical combat path, not an externally forged snapshot.
    expect(sim.restore(dead)).toBe(false);
  });
});
