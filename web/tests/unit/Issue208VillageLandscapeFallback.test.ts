// GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { planVillagePopulation } from '../../src/game/world/villagePopulation';
import { planActOneTopology } from '../../src/game/world/regionalTopology';
import { planRegionalLandscape } from '../../src/game/world/regionalLandscape';

vi.mock('../../src/game/world/villagePopulation', async importOriginal=>{
  const original=await importOriginal<typeof import('../../src/game/world/villagePopulation')>();
  return {...original,planVillagePopulation:vi.fn(original.planVillagePopulation)};
});
vi.mock('../../src/game/world/regionalLandscape', async importOriginal=>{
  const original=await importOriginal<typeof import('../../src/game/world/regionalLandscape')>();
  return {...original,planRegionalLandscape:vi.fn(original.planRegionalLandscape)};
});

describe('Issue #208: population takes precedence over optional landscape',()=>{
  it('retries on base geometry when a regional landscape rejects the population',()=>{
    const landscape=vi.mocked(planRegionalLandscape);
    const populate=vi.mocked(planVillagePopulation);
    // Inject an optional form marker in an otherwise validated real proposal.
    // This isolates the orchestration from seed-specific landscape placement.
    const originalLandscape=landscape.getMockImplementation()!;
    const originalPopulate=populate.getMockImplementation()!;
    let proposed=false;
    landscape.mockImplementation((layout,tiles,sites,reserved,roads)=>{
      const topology=planActOneTopology(layout,tiles,sites,reserved);
      if(!topology.ok)return originalLandscape(layout,tiles,sites,reserved,roads);
      proposed=true;
      return {ok:true,layout,tiles:[...tiles],topology,usedFallback:false,
        forms:[{id:'test-optional',kind:'forest-belt',obstacles:[]}]};
    });
    try{
      let verified=false;
      for(const seed of [0,1,123,0xffffffff]){
        proposed=false;
        landscape.mockClear();
        populate.mockClear();
        let calls=0;
        populate.mockImplementation((...args)=>{
          if(++calls===1)return {villages:[],obstacles:args[0].obstacles,
            skipped:['north-village','east-village']};
          return originalPopulate(...args);
        });
        const world=buildWilderness(seed);
        if(!proposed)continue;
        expect(landscape).toHaveBeenCalledTimes(1);
        expect(populate.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(world.terrain.layout.obstacles).toEqual(world.layout.obstacles);
        const retried=populate.mock.results[1]?.value;
        if(retried?.villages.length){
          expect(world.villages?.length).toBeGreaterThanOrEqual(retried.villages.length);
          if(world.villages?.length===retried.villages.length)expect(world.villages).toEqual(retried.villages);
          expect(world.region?.forms).toEqual([]);
          expect(world.region?.usedLandscapeFallback).toBe(true);
        }else if(!world.villages?.length){
          expect(world.region?.forms.map(f=>f.id)).toContain('test-optional');
        }
        verified=true;
        break;
      }
      expect(verified).toBe(true);
    }finally{
      landscape.mockImplementation(originalLandscape);
      populate.mockImplementation(originalPopulate);
    }
  },60000);
});
