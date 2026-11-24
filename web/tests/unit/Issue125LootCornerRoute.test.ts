// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { ACTOR_RADIUS, canOccupy, findPickupPath, moveActor } from '../../src/game/world/navigation';

describe('Issue #125: collision-safe pickup route',()=>{
  it('does not cut a shallow corner between coarse line samples',()=>{
    const walls=[{id:'corner',x:100,y:100,width:100,height:100}];
    const from={x:60,y:105},loot={x:125,y:40},range=36;
    const path=findPickupPath(from,loot,range,walls);
    expect(path.length).toBeGreaterThan(0);
    let previous=from;
    for(const goal of path){
      const steps=Math.max(1,Math.ceil(Math.hypot(goal.x-previous.x,goal.y-previous.y)/.1));
      for(let step=0;step<=steps;step++){
        const t=step/steps;
        expect(canOccupy({x:previous.x+(goal.x-previous.x)*t,
          y:previous.y+(goal.y-previous.y)*t},ACTOR_RADIUS,walls)).toBe(true);
      }
      previous=goal;
    }
    const actor={...from};
    for(const goal of path){
      for(let i=0;i<1000&&Math.hypot(actor.x-goal.x,actor.y-goal.y)>.01;i++)
        moveActor(actor,goal,2.5,ACTOR_RADIUS,walls);
      expect(Math.hypot(actor.x-goal.x,actor.y-goal.y)).toBeLessThanOrEqual(.01);
    }
    expect(Math.hypot(actor.x-loot.x,actor.y-loot.y)).toBeLessThanOrEqual(range);
    expect(findPickupPath(from,loot,range,walls)).toEqual(path);
  });
});
