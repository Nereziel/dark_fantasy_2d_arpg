// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { routeClear } from '../../src/game/world/wildernessTerrain';

describe('Issue #208: forest trail extended seed regressions',()=>{
  it.each([1369987,3634821])('connects both forest trail branches for seed %i',seed=>{
    const world=buildWilderness(seed);
    const main=world.terrain.roads.find(r=>r.id==='road-story-corruption_site');
    const side=world.terrain.roads.find(r=>r.id==='road-forest-side');
    expect(main).toBeDefined();
    expect(side).toBeDefined();
    if(!main||!side)throw Error('Missing forest trail');
    expect(main.points).toContainEqual(side.from);
    expect(main.points).toContainEqual(side.to);
    expect(routeClear(main.points,world.layout.obstacles)).toBe(true);
    expect(routeClear(side.points,world.layout.obstacles)).toBe(true);
    expect(buildWilderness(seed)).toEqual(world);
  },60000);
});
