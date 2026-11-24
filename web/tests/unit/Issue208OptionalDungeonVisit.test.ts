// GPL-3.0-only
import {describe,expect,it} from 'vitest';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {planActIDungeonEntrances} from '../../src/game/world/actIDungeonEntrances';
import {ACTOR_RADIUS,canOccupy,findPath} from '../../src/game/world/navigation';
import {planOptionalDungeonEntry,planOptionalDungeonExit} from '../../src/game/world/optionalDungeonVisit';

describe('Issue #208 C2.1: optional dungeon transition contracts',()=>{
  it.each([0,42,99])('round-trips the available optional entrances in world %i',seed=>{
    const world=buildWilderness(seed);
    const entrances=planActIDungeonEntrances(world).filter(e=>e.id!=='crypt');
    expect(entrances.length).toBeGreaterThan(0);
    for(const e of entrances){
      const actor={...e.position,alive:true};
      const visit=planOptionalDungeonEntry(world,e.id,actor)!;
      expect(visit).not.toBeNull();
      expect(visit.identity).toEqual({worldSeed:seed,dungeonId:e.id});
      expect(visit.layout.seed).toBe(seed);
      expect(visit.interior.seed).toBe(e.interiorSeed);
      expect(visit.layout.camp).toEqual(visit.interior.playerSpawn);
      expect(visit.layout.encounterPositions).toHaveLength(3);
      for(const p of [...visit.layout.encounterPositions,visit.interior.bossSpawn,...visit.interior.bossGuardSpawns]){
        expect(canOccupy(p,ACTOR_RADIUS,visit.layout.obstacles)).toBe(true);
        expect(findPath(visit.layout.camp,p,ACTOR_RADIUS,visit.layout.obstacles).length).toBeGreaterThan(0);
      }
      expect(planOptionalDungeonExit(world,visit.identity,{...visit.interior.bossSpawn,alive:true})).toBeNull();
      expect(planOptionalDungeonExit(world,visit.identity,{...visit.interior.exitPosition,alive:false})).toBeNull();
      expect(planOptionalDungeonExit(world,visit.identity,{...visit.interior.exitPosition,alive:true}))
        .toEqual(e.returnPosition);
      expect(planOptionalDungeonEntry(world,e.id,actor)).toEqual(visit);
    }
  },30000);
  it('rejects distant, invalid, dead and unavailable entry requests and foreign world exits',()=>{
    const world=buildWilderness(42);
    const e=planActIDungeonEntrances(world).find(e=>e.id!=='crypt')!;
    expect(e).toBeDefined();
    expect(planOptionalDungeonEntry(world,e.id,{...world.layout.camp,alive:true})).toBeNull();
    expect(planOptionalDungeonEntry(world,e.id,{...e.position,alive:false})).toBeNull();
    expect(planOptionalDungeonEntry(world,'crypt',{...e.position,alive:true})).toBeNull();
    expect(planOptionalDungeonEntry(world,'forged',{...e.position,alive:true})).toBeNull();
    expect(planOptionalDungeonEntry(world,e.id,{x:NaN,y:e.position.y,alive:true})).toBeNull();
    const visit=planOptionalDungeonEntry(world,e.id,{...e.position,alive:true})!;
    expect(planOptionalDungeonExit(buildWilderness(99),visit.identity,{...visit.interior.exitPosition,alive:true})).toBeNull();
    const absent={...world,structures:[],features:world.features.filter(f=>f.kind!=='poi')};
    expect(planOptionalDungeonEntry(absent,e.id,{...e.position,alive:true})).toBeNull();
    expect(planOptionalDungeonExit(absent,visit.identity,{...visit.interior.exitPosition,alive:true})).toBeNull();
  },30000);
  it('rejects near actors separated by a wall even within interaction radius',()=>{
    const world=buildWilderness(42);
    const e=planActIDungeonEntrances(world).find(e=>e.id!=='crypt')!;
    const p={x:e.position.x+56,y:e.position.y};
    // The thin obstacle leaves each actor radius clear but blocks line of sight.
    const wall={id:'test-entry-wall',x:e.position.x+25,y:e.position.y-8,width:6,height:16};
    const modified={...world,layout:{...world.layout,obstacles:[...world.layout.obstacles,wall]}};
    expect(planOptionalDungeonEntry(modified,e.id,{...p,alive:true})).toBeNull();
  },15000);
});
