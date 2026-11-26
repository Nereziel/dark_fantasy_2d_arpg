import { describe, expect, it } from 'vitest';
import { questTravelLeg, knownQuestRoute, projectDungeonMap } from '../../src/game/world/questNavigation';
import { createMapDiscovery, revealAtPosition, type MapWorldInput } from '../../src/game/world/mapDiscovery';
import { canOccupy, ACTOR_RADIUS } from '../../src/game/world/navigation';
import type { Point } from '../../src/game/core/types';

const world:MapWorldInput={seed:1,worldInstanceId:'dungeon-crypt',features:[]};
const start={x:200,y:200};
const goal={x:520,y:200};
const wall={id:'wall',x:320,y:100,width:60,height:220};
function reveal(points:Point[],radius=80){
  const initial=createMapDiscovery(world);
  if(!initial.ok)throw Error(initial.error);
  let state=initial.value;
  for(const point of points){const next=revealAtPosition(state,point,radius,world);if(!next.ok)throw Error(next.error);state=next.value;}
  return state;
}
describe('zone-aware tracked quest route',()=>{
  it('chooses exit, correct entrance or local objective without mixing dungeon identities',()=>{
    expect(questTravelLeg('wilderness','crypt')).toBe('enter');
    expect(questTravelLeg('mine','crypt')).toBe('exit');
    expect(questTravelLeg('crypt','crypt')).toBe('objective');
    expect(questTravelLeg('crypt','wilderness')).toBe('exit');
    expect(questTravelLeg('wilderness','wilderness')).toBe('objective');
    expect(questTravelLeg('wilderness','cave')).toBe('enter');
  });
  it('follows collision-safe detours, not the direct line through a wall',()=>{
    const known=reveal([start,{x:240,y:380},{x:400,y:380},goal,{x:480,y:320}],180);
    const route=knownQuestRoute(start,goal,[wall],known.revealedCells);
    expect(route.length).toBeGreaterThan(2);
    expect(route.at(-1)).toEqual(goal);
    for(let i=1;i<route.length;i++){
      const a=route[i-1]!,b=route[i]!;
      for(let step=0;step<=100;step++)expect(canOccupy({x:a.x+(b.x-a.x)*step/100,y:a.y+(b.y-a.y)*step/100},ACTOR_RADIUS,[wall])).toBe(true);
    }
  });
  it('never emits the unknown goal or walls behind fog; shows only the known prefix',()=>{
    const known=reveal([start],40);
    const p=projectDungeonMap(known,world,start,[wall],{id:'boss',status:'active',position:goal},'minimap',{},'crypt');
    expect(p?.navigationTarget).toBeUndefined();
    expect(p?.markers.some(m=>m.id==='quest/boss')).toBe(false);
    expect(p?.markers.some(m=>m.kind==='town')).toBe(false);
    expect(p?.walls).toEqual([]);
    const route=knownQuestRoute(start,goal,[wall],known.revealedCells);
    expect(route.at(-1)).not.toEqual(goal);
    expect(route.every(p=>known.revealedCells.includes('fog/'+Math.floor(p.x/80)+'/'+Math.floor(p.y/80)))).toBe(true);
  });
});
