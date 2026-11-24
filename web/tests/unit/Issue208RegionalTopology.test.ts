// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { CAMP, type WorldLayout } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath, type Obstacle } from '../../src/game/world/navigation';
import { planActOneTopology, regionalRoadClear, type RegionalSite } from '../../src/game/world/regionalTopology';

const sites:RegionalSite[]=[
  {id:'wild-cabin',kind:'cabin',position:{x:800,y:900},access:'trail'},
  {id:'wild-mine',kind:'mine',position:{x:1850,y:500},access:'trail'},
  {id:'wild-cave',kind:'cave',position:{x:1800,y:1200},access:'offroad'},
  {id:'wild-shrine',kind:'shrine',position:{x:1500,y:650},access:'offroad'}
];
const layout=(seed:number,obstacles:Obstacle[]=[]):WorldLayout=>({
  seed,camp:{...CAMP},obstacles,encounterPositions:[{x:800,y:500}]
});

describe('Issue #208: first regional topology foundation',()=>{
  it('connects three named stable settlement IDs with full-width trade roads and selective branches',()=>{
    const world=layout(123);
    const plan=planActOneTopology(world,[],sites);
    expect(plan.ok).toBe(true);
    if(!plan.ok)throw Error(plan.reason);
    expect(plan.settlements.map(s=>s.id)).toEqual(['camp','north-village','east-village']);
    expect(plan.settlements[0]?.position).toEqual(CAMP);
    expect(plan.settlements.slice(1).every(s=>Math.hypot(s.position.x-s.anchor.x,s.position.y-s.anchor.y)<=120)).toBe(true);
    const trade=plan.roads.filter(r=>r.kind==='trade');
    expect(trade).toHaveLength(2);
    expect(trade.map(r=>[r.fromId,r.toId])).toEqual([['camp','north-village'],['north-village','east-village']]);
    expect(plan.roads.filter(r=>r.kind==='trail').map(r=>r.toId)).toEqual(['wild-cabin','wild-mine']);
    expect(plan.offroadIds).toEqual(['wild-cave','wild-shrine']);
    for(const r of plan.roads){
      expect(regionalRoadClear(r.points,r.width,world.obstacles)).toBe(true);
      expect(r.points[0]).toEqual(r.from);
      expect(r.points.at(-1)).toEqual(r.to);
    }
    expect(planActOneTopology(world,[],sites)).toEqual(plan);
    expect(planActOneTopology(layout(124),[],sites)).not.toEqual(plan);
    expect(world.obstacles).toEqual([]);
  });
  it('routes around a continuous barrier without crossing it',()=>{
    const wall={id:'ridge',x:700,y:170,width:100,height:680};
    const world=layout(7,[wall]);
    const plan=planActOneTopology(world,[],sites);
    expect(plan.ok).toBe(true);
    if(!plan.ok)throw Error(plan.reason);
    expect(plan.roads.every(r=>regionalRoadClear(r.points,r.width,world.obstacles))).toBe(true);
    for(const s of plan.settlements)expect(findPath(CAMP,s.position,ACTOR_RADIUS,world.obstacles).length).toBeGreaterThan(0);
    for(const site of sites)expect(canOccupy(site.position,ACTOR_RADIUS,world.obstacles)).toBe(true);
    expect(regionalRoadClear([CAMP,{x:1100,y:300}],40,[wall])).toBe(false);
  });
  it('finds a nearby clearing outside the first anchor search when terrain covers it',()=>{
    // Every original north anchor offset is covered or lacks the 90-unit
    // clearing margin. The region immediately south remains accessible.
    const wall={id:'north-ridge',x:920,y:0,width:400,height:340};
    const world=layout(123,[wall]);
    const plan=planActOneTopology(world,[],[]);
    expect(plan.ok).toBe(true);
    if(!plan.ok)throw Error(plan.reason+'/'+plan.id);
    expect(plan.settlements.map(s=>s.id)).toEqual(['camp','north-village','east-village']);
    const north=plan.settlements[1]!;
    const shift=Math.hypot(north.position.x-north.anchor.x,north.position.y-north.anchor.y);
    expect(shift).toBeGreaterThan(120);
    expect(shift).toBeLessThanOrEqual(240);
    expect(canOccupy(north.position,north.radius+ACTOR_RADIUS,world.obstacles)).toBe(true);
    expect(plan.roads.filter(r=>r.kind==='trade')).toHaveLength(2);
    expect(plan.roads.every(r=>regionalRoadClear(r.points,r.width,world.obstacles))).toBe(true);
    expect(planActOneTopology(world,[],[])).toEqual(plan);
    expect(world.obstacles).toEqual([wall]);
  });
  it('returns an explicit failure for a disconnected world instead of inventing roads',()=>{
    const plan=planActOneTopology(layout(5,[{id:'barrier',x:650,y:0,width:140,height:1400}]),[],[]);
    expect(plan.ok).toBe(false);
    expect(plan).not.toHaveProperty('roads');
  });
  it('rejects malformed geometry and duplicate site IDs',()=>{
    expect(()=>planActOneTopology(layout(-1),[],[])).toThrow(RangeError);
    expect(()=>planActOneTopology(layout(1),[],[sites[0]!,sites[0]!])).toThrow(RangeError);
    expect(regionalRoadClear([CAMP,{x:NaN,y:100}],40,[])).toBe(false);
  });
});
