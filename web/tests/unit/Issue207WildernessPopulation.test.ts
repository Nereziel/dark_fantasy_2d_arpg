// GPL-3.0-only — Issue #207 A, final-world population contract.
import {describe,expect,it} from 'vitest';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {chunkForPoint,chunkId} from '../../src/game/world/chunkStreaming';
import {ACTOR_RADIUS,canOccupy,findPath} from '../../src/game/world/navigation';
import {validEnemyType} from '../../src/game/enemies/enemies';
import {planWildernessPopulation,populationReservations,MAX_WILDERNESS_GROUPS} from '../../src/game/world/wildernessPopulation';

const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);

describe('Issue #207 A: ordinary wilderness population',()=>{
  it.each([0,1,2,42,99,245489,411788,2296510,4775157,7808134,0xffffffff])(
    'seed %i has deterministic reachable groups outside protected gameplay locations',seed=>{
      const world=buildWilderness(seed),before=structuredClone(world);
      const plan=planWildernessPopulation(world);
      expect(planWildernessPopulation(world)).toEqual(plan);
      expect(world).toEqual(before);
      expect(plan.seed).toBe(seed);
      expect(plan.groups.length).toBeGreaterThanOrEqual(6);
      expect(plan.groups.length).toBeLessThanOrEqual(MAX_WILDERNESS_GROUPS);
      const reservations=populationReservations(world);
      const ids=new Set<string>(),chunks=new Set<string>();
      const members=plan.groups.flatMap(g=>g.members);
      for(const group of plan.groups){
        expect(ids.has(group.id)).toBe(false);ids.add(group.id);
        expect(chunks.has(group.homeChunkId)).toBe(false);chunks.add(group.homeChunkId);
        expect(chunkId(chunkForPoint(group.anchor)!)).toBe(group.homeChunkId);
        expect(group.terrainId).not.toBe('town_clearing');
        expect(group.members.length).toBeGreaterThanOrEqual(2);
        expect(group.members.length).toBeLessThanOrEqual(4);
        expect(group.territoryRadius).toBeGreaterThan(0);
        expect(canOccupy(group.anchor,ACTOR_RADIUS,world.layout.obstacles)).toBe(true);
        expect(findPath(world.layout.camp,group.anchor,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
        for(const p of [group.anchor,...group.members.map(m=>m.spawn)])
          for(const reservation of reservations)
            expect(distance(p,reservation.position)).toBeGreaterThanOrEqual(reservation.radius);
        for(const member of group.members){
          expect(ids.has(member.id)).toBe(false);ids.add(member.id);
          expect(validEnemyType(member.type)).toBe(true);
          expect(chunkId(chunkForPoint(member.spawn)!)).toBe(group.homeChunkId);
          expect(distance(group.anchor,member.spawn)).toBeLessThanOrEqual(group.territoryRadius);
          expect(canOccupy(member.spawn,ACTOR_RADIUS,world.layout.obstacles)).toBe(true);
          expect(findPath(group.anchor,member.spawn,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
          expect(findPath(world.layout.camp,member.spawn,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
          for(const other of members)if(other.id!==member.id)
            expect(distance(member.spawn,other.spawn)).toBeGreaterThanOrEqual(ACTOR_RADIUS*2);
        }
      }
      expect(new Set(plan.groups.map(g=>g.terrainId)).size).toBeGreaterThanOrEqual(2);
    },30000);
  it('uses different seeded layouts and rejects an invalid seed',()=>{
    const a=buildWilderness(42),b=buildWilderness(99);
    expect(planWildernessPopulation(a).groups).not.toEqual(planWildernessPopulation(b).groups);
    expect(()=>planWildernessPopulation({...a,layout:{...a.layout,seed:-1}})).toThrow();
  });
});
