// GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { planVillagePopulation } from '../../src/game/world/villagePopulation';
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
    landscape.mockImplementation((...args)=>{
      const result=originalLandscape(...args);
      if(!result.ok)return result;
      return {...result,forms:[...result.forms,{id:'test-optional',kind:'forest-belt',obstacles:[]}]};
    });
    populate.mockImplementationOnce(layout=>({
      villages:[],obstacles:layout.obstacles,skipped:['north-village','east-village']
    }));
    try{
      const world=buildWilderness(123);
      expect(landscape).toHaveBeenCalledTimes(1);
      expect(populate).toHaveBeenCalledTimes(2);
      expect(world.terrain.layout.obstacles).toEqual(world.layout.obstacles);
    }finally{
      landscape.mockImplementation(originalLandscape);
      populate.mockImplementation(originalPopulate);
    }
  },60000);
});
