// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { planObstacleArt, obstacleMaterial } from '../../src/game/phaser/isometricProps';
import { isometricDepth, isometricFootprint } from '../../src/game/phaser/isometricProjection';
import { occluderDepthAt } from '../../src/game/phaser/isometricOcclusion';

const origin = {x:1400,y:100};
const bounds = {x:100,y:120,width:72,height:56};
describe('Issue #210/#124: original obstacle art', () => {
  it('selects distinct forest, ruin, rock, timber and crypt presentation', () => {
    expect(obstacleMaterial('forest-1','wilderness')).toBe('forest');
    expect(obstacleMaterial('trail-edge-ravine-0','wilderness')).toBe('rock');
    expect(obstacleMaterial('trail-edge-ruins-0','wilderness')).toBe('ruin');
    expect(obstacleMaterial('north-barricade','wilderness')).toBe('timber');
    expect(obstacleMaterial('fallen-tower','wilderness')).toBe('ruin');
    expect(obstacleMaterial('shrine','wilderness')).toBe('ruin');
    expect(obstacleMaterial('forest-1','crypt')).toBe('crypt');
  });
  it('preserves the exact base footprint and painter order without changing collision', () => {
    const before = JSON.stringify(bounds);
    for (const material of ['forest','rock','ruin','timber','crypt'] as const) {
      const art = planObstacleArt(bounds, material, 12, origin);
      expect(art.base).toEqual(isometricFootprint(bounds,0,origin));
      expect(art.occluder.depth).toBe(isometricDepth({x:172,y:176}));
      expect(art.occluder.faces).toEqual(art.paint.filter(p=>p.opaque).map(p=>p.points));
      expect(art.paint.length).toBeGreaterThan(3);
      for (const face of art.occluder.faces) {
        const center = {x:face.reduce((s,p)=>s+p.x,0)/face.length,
          y:face.reduce((s,p)=>s+p.y,0)/face.length};
        expect(occluderDepthAt(center,[art.occluder])).toBe(348);
      }
    }
    expect(JSON.stringify(bounds)).toBe(before);
  });
  it('is deterministic, varies by seed and produces taller silhouettes for forest', () => {
    const tree = planObstacleArt(bounds,'forest',123,origin);
    expect(tree).toEqual(planObstacleArt(bounds,'forest',123,origin));
    expect(tree).not.toEqual(planObstacleArt(bounds,'forest',124,origin));
    const rock = planObstacleArt(bounds,'rock',123,origin);
    const minY = (a:typeof tree) => Math.min(...a.paint.flatMap(p=>p.points.map(q=>q.y)));
    expect(minY(tree)).toBeLessThan(minY(rock));
  });
});
