// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { CAMP, type WorldLayout } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy } from '../../src/game/world/navigation';
import { planActOneTopology, regionalRoadClear } from '../../src/game/world/regionalTopology';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';

describe('Issue #208: bounded regional anchor search',()=>{
  it('uses distinct distance bands rather than repeatedly choosing the nearest clearing',()=>{
    const layout:WorldLayout={seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[]};
    const initial=planActOneTopology(layout,[],[]);
    const retry=planActOneTopology(layout,[],[],[],4);
    expect(initial.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if(!initial.ok||!retry.ok)throw Error('Expected connected topology');
    const n=retry.settlements[1]!;
    const shift=Math.hypot(n.position.x-n.anchor.x,n.position.y-n.anchor.y);
    expect(shift).toBeGreaterThan(200);
    expect(shift).toBeLessThanOrEqual(400);
    expect(retry.roads.every(r=>regionalRoadClear(r.points,r.width,layout.obstacles))).toBe(true);
    expect(planActOneTopology(layout,[],[],[],4)).toEqual(retry);
    expect(planActOneTopology(layout,[],[])).toEqual(initial);
  });
  it('finds a northern clearing beyond the original 240-unit search',()=>{
    const layout:WorldLayout={seed:123,camp:{...CAMP},encounterPositions:[],
      obstacles:[{id:'wide-ridge',x:820,y:0,width:600,height:410}]};
    const plan=planActOneTopology(layout,[],[]);
    expect(plan.ok).toBe(true);
    if(!plan.ok)throw Error(plan.reason+'/'+plan.id);
    const n=plan.settlements[1]!;
    expect(Math.hypot(n.position.x-n.anchor.x,n.position.y-n.anchor.y)).toBeGreaterThan(240);
    expect(canOccupy(n.position,n.radius+ACTOR_RADIUS,layout.obstacles)).toBe(true);
    expect(plan.roads.every(r=>regionalRoadClear(r.points,r.width,layout.obstacles))).toBe(true);
  });
  it('recovers regional topology for the previously blocked seed 63352',()=>{
    const world=buildWilderness(63352);
    expect(world.layout.seed).toBe(63352);
    expect(world.region?.settlements.map(s=>s.id)).toEqual(['camp','north-village','east-village']);
    expect(world.region?.roads.every(r=>regionalRoadClear(r.points,r.width,world.layout.obstacles))).toBe(true);
  },60000);
});
