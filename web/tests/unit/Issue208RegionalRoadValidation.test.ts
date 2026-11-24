// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { generateWildernessTerrain, validateWildernessTerrain } from '../../src/game/world/wildernessTerrain';
import { ACTOR_RADIUS, findPath } from '../../src/game/world/navigation';

describe('Issue #208 A4: regional road validation',()=>{
  it('accepts connected trade roads with off-road encounters, not missing links',()=>{
    let covered=false;
    for(const seed of [0,1,123,0xffffffff]){
      const world=buildWilderness(seed);
      if(!world.region)continue;
      const terrain=structuredClone(world.terrain);
      terrain.roads=terrain.roads.filter(r=>r.id==='road-crypt-gate'||/^road-(trade|trail)-/.test(r.id));
      expect(terrain.roads.some(r=>r.id.startsWith('road-encounter-'))).toBe(false);
      for(const target of terrain.layout.encounterPositions)
        expect(findPath(terrain.layout.camp,target,ACTOR_RADIUS,terrain.layout.obstacles).length).toBeGreaterThan(0);
      // Legacy callers still require their original radial road manifest.
      expect(validateWildernessTerrain(terrain)).toContainEqual({code:'invalidRoad',id:'road-encounter-0'});
      const regional={...terrain,roadNetwork:'regional' as const};
      expect(validateWildernessTerrain(regional)).toEqual([]);
      for(const id of ['road-crypt-gate','road-trade-camp-north-village','road-trade-north-village-east-village']){
        expect(validateWildernessTerrain({...regional,roads:regional.roads.filter(r=>r.id!==id)}))
          .toContainEqual({code:'invalidRoad',id});
      }
      // A road with the expected name but reversed endpoints is not a
      // valid camp -> north -> east trade chain.
      const reversed=regional.roads.map(r=>r.id==='road-trade-camp-north-village'
        ?{...r,from:r.to,to:r.from,points:[...r.points].reverse()}:r);
      expect(validateWildernessTerrain({...regional,roads:reversed}))
        .toContainEqual({code:'invalidRoad',id:'road-trade-camp-north-village'});
      covered=true;break;
    }
    expect(covered).toBe(true);
  },60000);
  it('does not weaken legacy validation or allow unknown road modes',()=>{
    const legacy=generateWildernessTerrain(0);
    expect(validateWildernessTerrain(legacy)).toEqual([]);
    expect(validateWildernessTerrain({...legacy,roadNetwork:'invalid'}))
      .toContainEqual({code:'invalidLayout'});
    expect(validateWildernessTerrain({...legacy,roadNetwork:'regional'}))
      .toContainEqual({code:'invalidRoad',id:'road-trade-camp-north-village'});
  });
});
