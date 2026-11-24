// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { planBuildingArt, type BuildingAppearance } from '../../src/game/phaser/isometricBuildings';
import { isometricFootprint, projectIsometric } from '../../src/game/phaser/isometricProjection';
import { occluderDepthAt } from '../../src/game/phaser/isometricOcclusion';
import { heroCutaway } from '../../src/game/phaser/isometricCutaway';

const origin={x:1400,y:100};
const rect={x:100,y:100,width:72,height:64};
const input:BuildingAppearance={kind:'house',entranceSide:'south',variant:0};

describe('Issue #210/#208: isometric building art',()=>{
  it('draws distinct four building types and preserves the collision footprint',()=>{
    const kinds=['house','smithy','cabin','mine'] as const;
    const plans=kinds.map(kind=>planBuildingArt(rect,{...input,kind},origin));
    expect(new Set(plans.map(p=>JSON.stringify(p.paint))).size).toBe(4);
    for(const p of plans){
      expect(p.base).toEqual(isometricFootprint(rect,0,origin));
      expect(p.occluder.depth).toBe(336);
      expect(p.occluder.faces).toEqual(p.paint.filter(f=>f.opaque).map(f=>f.points));
      expect(p.paint.some(f=>f.layer==='roof')).toBe(true);
      expect(p.paint.some(f=>f.layer==='wall')).toBe(true);
      expect(p.paint.every(f=>f.points.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)))).toBe(true);
    }
  });
  it('uses the same opaque roof silhouettes for pointer picking and hero cutaway',()=>{
    const p=planBuildingArt(rect,input,origin);
    for(const face of p.paint.filter(f=>f.layer==='roof'&&f.opaque)){
      const point={x:face.points.reduce((n,q)=>n+q.x,0)/face.points.length,
        y:face.points.reduce((n,q)=>n+q.y,0)/face.points.length};
      expect(occluderDepthAt(point,[p.occluder])).toBe(336);
    }
    expect(heroCutaway({x:90,y:90},origin,[p.occluder]).alphas).toEqual([0.35]);
    expect(heroCutaway({x:230,y:230},origin,[p.occluder]).alphas).toEqual([1]);
  });
  it('places the visible doorway on the correct front face, not on a hidden facade',()=>{
    const south=planBuildingArt(rect,input,origin);
    const east=planBuildingArt(rect,{...input,entranceSide:'east'},origin);
    const north=planBuildingArt(rect,{...input,entranceSide:'north'},origin);
    const door=(p:typeof south)=>p.paint.find(f=>f.layer==='door');
    expect(door(south)?.points).not.toEqual(door(east)?.points);
    expect(door(north)).toBeUndefined();
    const middle={x:rect.x+rect.width/2,y:rect.y+rect.height};
    expect(door(south)?.points.some(q=>q.y>projectIsometric(middle,20,origin).y)).toBe(true);
  });
  it('keeps variants deterministic and rejects unsupported variant indexes',()=>{
    expect(planBuildingArt(rect,input,origin)).toEqual(planBuildingArt(rect,input,origin));
    expect(planBuildingArt(rect,{...input,variant:1},origin)).not.toEqual(planBuildingArt(rect,input,origin));
    expect(()=>planBuildingArt(rect,{...input,variant:-1},origin)).toThrow(RangeError);
  });
});
