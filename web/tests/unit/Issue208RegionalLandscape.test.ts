// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { CAMP, type WorldLayout } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';
import { makeWildernessTiles } from '../../src/game/world/wildernessTerrain';
import { planRegionalLandscape } from '../../src/game/world/regionalLandscape';
import { regionalRoadClear } from '../../src/game/world/regionalTopology';

const world=(seed:number):WorldLayout=>({seed,camp:{...CAMP},obstacles:[],encounterPositions:[{x:650,y:1050}]});
describe('Issue #208: macro landscape before routing',()=>{
  it('adds contiguous ridge flanks with an open, reachable pass and connected trade roads',()=>{
    const base=world(123),tiles=makeWildernessTiles(base.seed,[]);
    const result=planRegionalLandscape(base,tiles,[],[]);
    expect(result.ok).toBe(true);
    if(!result.ok)throw Error(result.reason);
    const ridge=result.forms.find(f=>f.kind==='ridge');
    expect(ridge).toBeDefined();
    expect(ridge?.obstacles).toHaveLength(2);
    const [north,south]=ridge!.obstacles;
    expect(north!.x).toBe(south!.x);
    expect(north!.y+north!.height+120).toBeLessThanOrEqual(south!.y);
    expect(canOccupy(ridge!.pass!,42,result.layout.obstacles)).toBe(true);
    expect(findPath(CAMP,ridge!.pass!,ACTOR_RADIUS,result.layout.obstacles).length).toBeGreaterThan(0);
    expect(result.topology.roads.filter(r=>r.kind==='trade')).toHaveLength(2);
    expect(result.topology.roads.every(r=>regionalRoadClear(r.points,r.width,result.layout.obstacles))).toBe(true);
    expect(result.tiles).toHaveLength(tiles.length);
    expect(result.tiles.some((t,i)=>t.terrainId!==tiles[i]?.terrainId)).toBe(true);
    expect(base.obstacles).toEqual([]);
  });
  it('reproduces identical geometry and varies landforms across seeds',()=>{
    const plan=(seed:number)=>planRegionalLandscape(world(seed),makeWildernessTiles(seed,[]),[],[]);
    const first=plan(123),second=plan(124);
    expect(first).toEqual(plan(123));
    expect(first.ok&&second.ok).toBe(true);
    if(first.ok&&second.ok)expect(first.forms).not.toEqual(second.forms);
  });
  it('protects reserved destinations and pre-existing roads, or falls back without new collision',()=>{
    const base=world(9);
    const reserved=[{x:860,y:360},{x:940,y:680},{x:1480,y:1040}];
    const road={id:'existing',from:{...CAMP},to:{x:1800,y:470},width:40,
      points:[{...CAMP},{x:1800,y:470}]};
    const result=planRegionalLandscape(base,makeWildernessTiles(9,[road]),[],reserved,[road]);
    expect(result.ok).toBe(true);
    if(!result.ok)throw Error(result.reason);
    expect(regionalRoadClear(road.points,road.width,result.layout.obstacles)).toBe(true);
    for(const p of reserved){
      expect(canOccupy(p,ACTOR_RADIUS,result.layout.obstacles)).toBe(true);
      expect(findPath(CAMP,p,ACTOR_RADIUS,result.layout.obstacles).length).toBeGreaterThan(0);
    }
  });
  it('does not claim success on an already disconnected region',()=>{
    const base={...world(8),obstacles:[{id:'barrier',x:650,y:0,width:140,height:1400}]};
    expect(planRegionalLandscape(base,makeWildernessTiles(8,[]),[],[]).ok).toBe(false);
  });
});
