// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { CRYPT_GATE } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';
import { validateProceduralDungeon } from '../../src/game/world/proceduralDungeon';
import { planActIDungeonEntrances, dungeonInteriorSeed, buildActIDungeonInterior,
  ACT_I_DUNGEON_IDS } from '../../src/game/world/actIDungeonEntrances';

describe('Issue #208 C1: Act I dungeon entrance manifest',()=>{
  it.each([0,1,42,99,15838,0xffffffff])('preserves safe deterministic entrances in world %i',seed=>{
    const world=buildWilderness(seed);
    const before=structuredClone(world);
    const entrances=planActIDungeonEntrances(world);
    expect(entrances[0]).toMatchObject({id:'crypt',position:CRYPT_GATE,returnPosition:CRYPT_GATE,interiorSeed:seed});
    expect(new Set(entrances.map(e=>e.id)).size).toBe(entrances.length);
    expect(new Set(entrances.map(e=>e.interiorSeed)).size).toBe(entrances.length);
    expect(planActIDungeonEntrances(world)).toEqual(entrances);
    for(const e of entrances){
      expect(e.returnPosition).toEqual(e.position);
      expect(canOccupy(e.position,ACTOR_RADIUS,world.layout.obstacles)).toBe(true);
      expect(findPath(world.layout.camp,e.position,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
      const interior=buildActIDungeonInterior(seed,e.id);
      expect(interior.seed).toBe(e.interiorSeed);
      expect(validateProceduralDungeon(interior).valid).toBe(true);
      expect(findPath(interior.playerSpawn,interior.bossSpawn,ACTOR_RADIUS,interior.obstacles).length).toBeGreaterThan(0);
    }
    expect(world).toEqual(before);
  },30000);
  it('uses both optional entrance types across real seeds and varied room geometry',()=>{
    const seen=new Set<string>(), graphs=new Set<string>();
    for(const seed of [0,1,42,99]){
      for(const e of planActIDungeonEntrances(buildWilderness(seed))){
        seen.add(e.id);
        if(e.id==='crypt')continue;
        const d=buildActIDungeonInterior(seed,e.id);
        graphs.add(JSON.stringify(d.rooms.map(r=>[r.type,r.slot])));
      }
    }
    expect([...seen].sort()).toEqual([...ACT_I_DUNGEON_IDS].sort());
    expect(graphs.size).toBeGreaterThan(1);
  },30000);
  it('omits unavailable optional anchors rather than inventing unreachable entrances',()=>{
    const world=buildWilderness(42);
    const stripped={...world,structures:[],features:world.features.filter(f=>f.kind!=='poi')};
    expect(planActIDungeonEntrances(stripped).map(e=>e.id)).toEqual(['crypt']);
  });
  it('derives independent uint32 streams and rejects invalid identities',()=>{
    for(const seed of [0,1,0xffffffff]){
      const streams=ACT_I_DUNGEON_IDS.map(id=>dungeonInteriorSeed(seed,id));
      expect(new Set(streams).size).toBe(3);
      expect(streams.every(s=>Number.isInteger(s)&&s>=0&&s<=0xffffffff)).toBe(true);
      expect(streams[0]).toBe(seed);
    }
    expect(()=>dungeonInteriorSeed(-1,'crypt')).toThrow(RangeError);
    expect(()=>dungeonInteriorSeed(0,'forged')).toThrow(RangeError);
    expect(()=>dungeonInteriorSeed(2**32,'mine')).toThrow(RangeError);
  });
});
