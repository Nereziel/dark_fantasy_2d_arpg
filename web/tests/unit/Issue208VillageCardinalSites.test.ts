// GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { CAMP, type WorldLayout } from '../../src/game/world/generator';
import { ACTOR_RADIUS, findPath } from '../../src/game/world/navigation';
import { planVillagePopulation } from '../../src/game/world/villagePopulation';
import { planSettlementStructures } from '../../src/game/world/settlementStructures';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { validateWildernessTerrain } from '../../src/game/world/wildernessTerrain';
import { regionalRoadClear, type RegionalSettlement } from '../../src/game/world/regionalTopology';

vi.mock('../../src/game/world/settlementStructures',async original=>{
  const mod=await original<typeof import('../../src/game/world/settlementStructures')>();
  return {...mod,planSettlementStructures:vi.fn(mod.planSettlementStructures)};
});

describe('Issue #208: cardinal village building proposals',()=>{
  it('finds a building after all diagonal site proposals fail',()=>{
    const layout:WorldLayout={seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[]};
    const p={x:1120,y:230};
    const north:RegionalSettlement={id:'north-village',anchor:p,position:p,radius:72,nameKey:'region.north-village'};
    const planner=vi.mocked(planSettlementStructures),original=planner.getMockImplementation()!;
    planner.mockClear();
    planner.mockImplementation((...args)=>{
      if(args[3].every(s=>s.anchor.x!==p.x&&s.anchor.y!==p.y))
        return {structures:[],obstacles:[...args[0].obstacles],skipped:args[3].map(s=>s.id)};
      return original(...args);
    });
    try{
      const plan=planVillagePopulation(layout,[north],[],[]);
      expect(plan.villages).toHaveLength(1);
      expect(plan.villages[0]!.structures.length).toBeGreaterThan(0);
      expect(plan.villages[0]!.residents).toHaveLength(2);
      expect(plan.skipped).toEqual([]);
      expect(planner.mock.calls.length).toBeGreaterThan(5);
      expect(layout.obstacles).toEqual([]);
      for(const n of plan.villages[0]!.residents)
        expect(findPath(CAMP,n.position,ACTOR_RADIUS,plan.obstacles).length).toBeGreaterThan(0);
    }finally{planner.mockImplementation(original);}
  });
  it('fully populates the remaining incomplete seed 15838',()=>{
    const world=buildWilderness(15838);
    expect(world.layout.seed).toBe(15838);
    expect(world.villages?.map(v=>v.id)).toEqual(['north-village','east-village']);
    expect(world.terrain.roadNetwork).toBe('regional');
    expect(validateWildernessTerrain(world.terrain)).toEqual([]);
    expect(world.region?.roads.every(r=>regionalRoadClear(r.points,r.width,world.layout.obstacles))).toBe(true);
    for(const village of world.villages??[]){
      expect(village.structures.length).toBeGreaterThan(0);
      expect(village.residents).toHaveLength(2);
      for(const n of village.residents)
        expect(findPath(CAMP,n.position,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
      for(const s of village.structures)
        expect(findPath(CAMP,s.approach,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
    }
    expect(buildWilderness(15838)).toEqual(world);
  },60000);
});
