// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { regionalRoadClear } from '../../src/game/world/regionalTopology';
import { createChunkIndex } from '../../src/game/world/chunkStreaming';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';

describe('Issue #208: shared regional runtime',()=>{
  it('adds real regional roads on representative seeds without disconnecting story targets',()=>{
    let connected=0;
    for(const seed of [0,1,123,0xffffffff]){
      const world=buildWilderness(seed);
      expect(world.terrain.layout.obstacles).toEqual(world.layout.obstacles);
      expect(buildWilderness(seed)).toEqual(world);
      if(!world.region)continue;
      connected++;
      expect(world.region.settlements.map(s=>s.id)).toEqual(['camp','north-village','east-village']);
      expect(world.region.roads.filter(r=>r.kind==='trade')).toHaveLength(2);
      for(const road of world.region.roads){
        expect(world.terrain.roads).toContainEqual(road);
        expect(regionalRoadClear(road.points,road.width,world.layout.obstacles)).toBe(true);
      }
      for(const point of [...world.features.map(f=>f.position),...world.region.settlements.map(s=>s.position),
        ...(world.structures??[]).map(s=>s.approach)]){
        expect(canOccupy(point,ACTOR_RADIUS,world.layout.obstacles)).toBe(true);
        expect(findPath(world.layout.camp,point,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
      }
      for(const village of world.villages??[]){
        expect(village.residents).toHaveLength(2);
        expect(village.structures.length).toBeGreaterThan(0);
        for(const resident of village.residents){
          expect(canOccupy(resident.position,ACTOR_RADIUS,world.layout.obstacles)).toBe(true);
          expect(findPath(world.layout.camp,resident.position,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
        }
        for(const structure of village.structures)expect(world.structures).toContainEqual(structure);
      }
      // The existing map/chunk renderer accepts the same road IDs and geometry.
      const index=createChunkIndex(world);
      expect(index.chunks.some(c=>c.roads.some(r=>r.roadId.startsWith('road-trade-')))).toBe(true);
    }
    expect(connected).toBeGreaterThan(0);
  },60000);
});
