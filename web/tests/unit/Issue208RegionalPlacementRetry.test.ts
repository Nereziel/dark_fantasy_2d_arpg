// GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { validateWildernessTerrain } from '../../src/game/world/wildernessTerrain';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';

import { planActOneTopology } from '../../src/game/world/regionalTopology';
import { planSettlementStructures } from '../../src/game/world/settlementStructures';
import { planVillagePopulation } from '../../src/game/world/villagePopulation';

vi.mock('../../src/game/world/regionalTopology',async original=>{
  const mod=await original<typeof import('../../src/game/world/regionalTopology')>();
  return {...mod,planActOneTopology:vi.fn(mod.planActOneTopology)};
});
vi.mock('../../src/game/world/settlementStructures',async original=>{
  const mod=await original<typeof import('../../src/game/world/settlementStructures')>();
  return {...mod,planSettlementStructures:vi.fn(mod.planSettlementStructures)};
});
vi.mock('../../src/game/world/villagePopulation',async original=>{
  const mod=await original<typeof import('../../src/game/world/villagePopulation')>();
  return {...mod,planVillagePopulation:vi.fn(mod.planVillagePopulation)};
});

describe('Issue #208: alternate regional placement',()=>{
  it('improves coverage over the seven reproducible incomplete seeds from CI 45482524485',()=>{
    const seeds=[15838,23757,63352,79190,134623,142542,158380];
    const incomplete:number[]=[];
    const topology=vi.mocked(planActOneTopology);
    const structures=vi.mocked(planSettlementStructures);
    const populate=vi.mocked(planVillagePopulation);
    const originalPopulate=populate.getMockImplementation()!;
    for(const seed of seeds){
      topology.mockClear();structures.mockClear();populate.mockClear();
      const populationAttempts:unknown[]=[];
      populate.mockImplementation((layout,settlements,roads,reserved,accept)=>{
        const start=structures.mock.calls.length;
        let accepted=0,rejected=0;
        const result=originalPopulate(layout,settlements,roads,reserved,walls=>{
          const ok=accept?.(walls)??true;
          if(ok)accepted++;else rejected++;
          return ok;
        });
        const proposals=structures.mock.calls.slice(start).map((args,i)=>{
          const value=structures.mock.results[start+i]?.value;
          const [candidateLayout,,protectedPoints,sites]=args;
          const count=value?.structures?.length??0;
          // An unreachable protected point rejects all structures before
          // placement starts. Record its coordinates, not just a count.
          const unreachable=count===0
            ?[candidateLayout.camp,...candidateLayout.encounterPositions,...protectedPoints]
              .filter(p=>!canOccupy(p,ACTOR_RADIUS,candidateLayout.obstacles)
                ||(Math.hypot(p.x-candidateLayout.camp.x,p.y-candidateLayout.camp.y)>=1
                  &&!findPath(candidateLayout.camp,p,ACTOR_RADIUS,candidateLayout.obstacles).length))
            :[];
          return {sites:sites.map(q=>q.id),count,unreachable};
        });
        populationAttempts.push({anchors:settlements.map(s=>({id:s.id,p:s.position})),
          roads:roads.length,populated:result.villages.map(v=>v.id),skipped:result.skipped,
          accepted,rejected,proposals});
        return result;
      });
      let world:ReturnType<typeof buildWilderness>;
      try{world=buildWilderness(seed);}finally{populate.mockImplementation(originalPopulate);}
      if(world.villages?.length!==2){
        console.info('[Act I placement diagnostic] '+JSON.stringify({seed,
          topology:topology.mock.results.map(r=>r.value?.ok?'ok':r.value),
          populationAttempts}));
      }
      expect(world.layout.seed).toBe(seed);
      expect(validateWildernessTerrain(world.terrain)).toEqual([]);
      expect(buildWilderness(seed)).toEqual(world);
      if(world.villages?.length!==2){incomplete.push(seed);continue;}
      expect(world.region?.settlements.map(s=>s.id)).toEqual(['camp','north-village','east-village']);
      expect(world.terrain.roadNetwork).toBe('regional');
      for(const village of world.villages){
        expect(village.residents).toHaveLength(2);
        for(const n of village.residents)
          expect(findPath(world.layout.camp,n.position,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
      }
    }
    // This gate is deliberately stronger than the previous 0/7 baseline.
    // Full coverage remains the separate strict seed sweep acceptance.
    expect(incomplete.length, 'Still incomplete seeds: '+incomplete.join(', ')).toBeLessThan(seeds.length);
  },60000);
});
