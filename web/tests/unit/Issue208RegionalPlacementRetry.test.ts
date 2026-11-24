// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { validateWildernessTerrain } from '../../src/game/world/wildernessTerrain';
import { ACTOR_RADIUS, findPath } from '../../src/game/world/navigation';

describe('Issue #208: alternate regional placement',()=>{
  it('improves coverage over the seven reproducible incomplete seeds from CI 45482524485',()=>{
    const seeds=[15838,23757,63352,79190,134623,142542,158380];
    const incomplete:number[]=[];
    for(const seed of seeds){
      const world=buildWilderness(seed);
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
