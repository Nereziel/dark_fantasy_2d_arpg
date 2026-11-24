// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { getTownManifest } from '../../src/game/world/townManifest';
import { planEnvironmentObjects } from '../../src/game/world/environmentInteractions';
import { planWorldEvents } from '../../src/game/world/worldEvents';
import { WORLD_OBJECTS } from '../../src/game/world/interactables';
import { canOccupy, findPath, ACTOR_RADIUS } from '../../src/game/world/navigation';
import { routeClear } from '../../src/game/world/wildernessTerrain';

describe('Issue #208: settlement collision integrated into the generated world',()=>{
  it('keeps structures, terrain and navigation in sync across representative seeds',()=>{
    let count=0;
    for(const seed of [0,1,123,0xffffffff]){
      const world=buildWilderness(seed);
      const structures=world.structures ?? [];
      count+=structures.length;
      expect(world.terrain.layout.obstacles).toEqual(world.layout.obstacles);
      expect(buildWilderness(seed)).toEqual(world);
      const base={...world.layout,obstacles:world.layout.obstacles.filter(o=>!o.id.startsWith('structure-'))};
      const env=planEnvironmentObjects(seed,base,world.features);
      const events=planWorldEvents(seed,base,world.features);
      expect(planEnvironmentObjects(seed,world.layout,world.features)).toEqual(env);
      expect(planWorldEvents(seed,world.layout,world.features)).toEqual(events);
      for(const point of [...getTownManifest().map(n=>n.position),...WORLD_OBJECTS.map(o=>o.position),
        ...world.features.map(f=>f.position),...world.layout.encounterPositions,
        ...env.map(o=>o.position),...events.flatMap(e=>e.enemySpawns.map(s=>s.position)),
        ...structures.map(s=>s.approach)]){
        expect(canOccupy(point,ACTOR_RADIUS,world.layout.obstacles)).toBe(true);
        expect(findPath(world.layout.camp,point,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
      }
      for(const s of structures){
        expect(world.layout.obstacles).toContainEqual(s.obstacle);
        expect(canOccupy({x:s.obstacle.x+s.obstacle.width/2,y:s.obstacle.y+s.obstacle.height/2},
          ACTOR_RADIUS,world.layout.obstacles)).toBe(false);
      }
      for(const road of world.terrain.roads){
        if(routeClear(road.points,base.obstacles))expect(routeClear(road.points,world.layout.obstacles)).toBe(true);
      }
    }
    expect(count).toBeGreaterThan(0);
  },30000);
});
