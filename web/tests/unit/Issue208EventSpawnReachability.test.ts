// GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { planWorldEvents } from '../../src/game/world/worldEvents';
import { planEnvironmentObjects } from '../../src/game/world/environmentInteractions';
import { ACTOR_RADIUS, findPath } from '../../src/game/world/navigation';

vi.mock('../../src/game/world/navigation',async original=>{
  const mod=await original<typeof import('../../src/game/world/navigation')>();
  return {...mod,findPath:vi.fn(mod.findPath)};
});

describe('Issue #208: reachable event enemies',()=>{
  it('rejects a locally reachable spawn if camp navigation cannot reach it',()=>{
    const path=vi.mocked(findPath), original=path.getMockImplementation()!;
    let tested=false;
    for(const seed of [23757,0,1,42,99]){
      const world=buildWilderness(seed);
      const {layout,features}=world;
      const events=planWorldEvents(seed,layout,features);
      if(!events.length)continue;
      const event=events[0]!, target=event.enemySpawns[0]!.position;
      expect(original(event.position,target,ACTOR_RADIUS,layout.obstacles).length).toBeGreaterThan(0);
      path.mockImplementation((from,to,...args)=>{
        if(from.x===layout.camp.x&&from.y===layout.camp.y&&to.x===target.x&&to.y===target.y)return [];
        return original(from,to,...args);
      });
      try{
        const revised=planWorldEvents(seed,layout,features);
        expect(revised.flatMap(e=>e.enemySpawns).some(s=>s.position.x===target.x&&s.position.y===target.y)).toBe(false);
        for(const e of revised)expect(e.enemySpawns).toHaveLength(2);
        expect(planWorldEvents(seed,layout,features)).toEqual(revised);
        tested=true;
      }finally{path.mockImplementation(original);}
      break;
    }
    expect(tested).toBe(true);
  },60000);
  it('checks actual event spawn routes and identifies the protected point on seed 23757',()=>{
    const seed=23757, world=buildWilderness(seed);
    const {layout,features}=world;
    const events=planWorldEvents(seed,layout,features);
    const all=[
      ...features.map(f=>({id:f.id,position:f.position})),
      ...planEnvironmentObjects(seed,layout,features),
      ...events.flatMap(e=>e.enemySpawns),
      ...(world.structures??[]).map(s=>({id:s.id,position:s.approach}))
    ];
    console.info('[Act I seed 23757 point] '+JSON.stringify(all.filter(p=>p.position.x===2036&&p.position.y===742)));
    for(const event of events)for(const spawn of event.enemySpawns){
      expect(findPath(layout.camp,spawn.position,ACTOR_RADIUS,layout.obstacles).length,spawn.id).toBeGreaterThan(0);
      expect(findPath(event.position,spawn.position,ACTOR_RADIUS,layout.obstacles).length,spawn.id).toBeGreaterThan(0);
    }
  },60000);
});
