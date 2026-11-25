// GPL-3.0-only
import {describe,expect,it} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {planActIDungeonEntrances,buildActIDungeonInterior} from '../../src/game/world/actIDungeonEntrances';
import {planOptionalDungeonFeatures} from '../../src/game/world/optionalDungeonFeatures';
import {ACTOR_RADIUS,canOccupy,findPath} from '../../src/game/world/navigation';
import {createWorldRecord,readWorldRecord} from '../../src/persistence/WorldProgressRepository';

describe('Issue #208 C3.4: optional dungeon treasure and hazards',()=>{
  it.each(['mine','cave'] as const)('plans reachable %s treasure and hazard in the actual rooms',id=>{
    for(const seed of [0,42,99,15838]){
      const d=buildActIDungeonInterior(seed,id),before=JSON.stringify(d);
      const plan=planOptionalDungeonFeatures(d,id);
      expect(plan).toEqual(planOptionalDungeonFeatures(d,id));
      expect(plan.chest.position).toEqual(d.rooms.find(r=>r.type==='treasure')!.center);
      expect(plan.trap.trigger.center).toEqual(d.rooms.find(r=>r.type==='trap')!.center);
      for(const p of [plan.chest.position,plan.trap.trigger.center]){
        expect(canOccupy(p,ACTOR_RADIUS,d.obstacles)).toBe(true);
        expect(findPath(d.playerSpawn,p,ACTOR_RADIUS,d.obstacles).length).toBeGreaterThan(0);
      }
      expect(JSON.stringify(d)).toBe(before);
    }
  },30000);
  it.each(['mine','cave'] as const)('claims %s chest and dodged trap once, persists them and rejects replay',id=>{
    const seed=42,sim=new GameSimulation(seed);
    const entry=planActIDungeonEntrances(buildWilderness(seed)).find(e=>e.id===id)!;
    const snapshot=sim.snapshot();
    expect(sim.restore({...snapshot,player:{...snapshot.player,...entry.position}})).toBe(true);
    sim.command({type:'usePortal',dungeonId:id});
    const plan=planOptionalDungeonFeatures(buildActIDungeonInterior(seed,id),id);
    const entered=sim.snapshot();
    expect(entered.cryptInteractables).toEqual([plan.chest]);
    sim.command({type:'interactCrypt',id:plan.chest.id});
    expect(sim.worldProgress()?.optionalDungeonRewardIds??[]).toEqual([]);
    expect(sim.restore({...entered,player:{...entered.player,...plan.chest.position}})).toBe(true);
    const gold=sim.character().gold;
    sim.command({type:'interactCrypt',id:plan.chest.id});
    expect(sim.character().gold).toBe(gold+plan.gold);
    sim.command({type:'interactCrypt',id:plan.chest.id});
    expect(sim.character().gold).toBe(gold+plan.gold);
    expect(sim.snapshot().cryptInteractables).toEqual([]);
    const current=sim.snapshot();
    expect(sim.restore({...current,player:{...current.player,...plan.trap.trigger.center}})).toBe(true);
    const internal=sim as unknown as {player:{x:number;y:number;health:number};tickCryptTraps:(dt:number)=>void};
    sim.drainEvents();
    internal.tickCryptTraps(.1);
    expect(sim.drainEvents()).toContainEqual(expect.objectContaining({type:'cryptTrapWindup',id:plan.trap.id}));
    const hp=internal.player.health;
    Object.assign(internal.player,{x:entered.player.x,y:entered.player.y});
    internal.tickCryptTraps(plan.trap.telegraphSeconds+.1);
    expect(internal.player.health).toBe(hp);
    expect(sim.worldProgress()?.optionalDungeonRewardIds).toEqual([id+':treasure',id+':trap']);
    const record=readWorldRecord(createWorldRecord(sim.worldProgress()!))!;
    const loaded=new GameSimulation(seed);
    expect(loaded.restoreCharacter(sim.character(),seed)).toBe(true);
    expect(loaded.restoreWorldProgress(record)).toBe(true);
    const start=loaded.snapshot();
    expect(loaded.restore({...start,player:{...start.player,...entry.position}})).toBe(true);
    loaded.command({type:'usePortal',dungeonId:id});
    expect(loaded.snapshot().cryptInteractables).toEqual([]);
    expect(loaded.worldProgress()?.optionalDungeonRewardIds).toEqual([id+':treasure',id+':trap']);
    expect(loaded.character()).not.toHaveProperty('optionalDungeonRewardIds');
  },30000);
});
