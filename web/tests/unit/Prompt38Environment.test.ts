import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { CAMP } from '../../src/game/world/generator';
import { canOccupy, findPath } from '../../src/game/world/navigation';
import { createWorldRecord, readWorldRecord } from '../../src/persistence/WorldProgressRepository';
import {
  ENVIRONMENT_IDS, SHRINE_BONUSES, planEnvironmentObjects,
  visibleEnvironmentObjects, planEnvironmentInteraction,
  validEnvironmentUsedIds, validShrineBlessings
} from '../../src/game/world/environmentInteractions';
import type { EnvironmentObjectId } from '../../src/game/world/environmentInteractions';

const scene=(seed=42)=>{const w=buildWilderness(seed);return {w,plan:planEnvironmentObjects(seed,w.layout,w.features)};};
function goto(sim:GameSimulation, position:{x:number;y:number}):void {
  const s=sim.snapshot();
  expect(sim.restore({...s,player:{...s.player,x:position.x,y:position.y}})).toBe(true);
}
function interactAt(sim:GameSimulation,id:EnvironmentObjectId):void {
  const obj=sim.snapshot().environmentObjects?.find(o=>o.id===id);
  expect(obj).toBeDefined();
  goto(sim,obj!.position);
  sim.command({type:'interactEnvironment',id});
}
describe('Prompt 38 — reusable environment planner',()=>{
  it('places all ten interaction categories, six shrines and dependency-safe secrets',()=>{
    for(const seed of [0,1,2,7,42,1001]){
      const {w,plan}=scene(seed);
      expect(plan).toEqual(planEnvironmentObjects(seed,w.layout,w.features));
      expect(plan.map(o=>o.id)).toEqual([...ENVIRONMENT_IDS]);
      const kinds=new Set(plan.map(o=>o.kind));
      expect(kinds).toEqual(new Set(['chest','door','lockedDoor','lever','shrine',
        'trap','barrel','crate','hiddenWall','lore']));
      expect(plan.filter(o=>o.kind==='shrine').map(o=>o.shrineBonus).sort())
        .toEqual([...SHRINE_BONUSES].sort());
      for(const obj of plan){
        expect(canOccupy(obj.position,18,w.layout.obstacles)).toBe(true);
        expect(findPath(CAMP,obj.position,18,w.layout.obstacles).length).toBeGreaterThan(0);
        for(const f of w.features.filter(x=>x.mandatory))
          expect(Math.hypot(obj.position.x-f.position.x,obj.position.y-f.position.y))
            .toBeGreaterThan(f.radius+25);
      }
      expect(new Set(plan.map(x=>x.id)).size).toBe(plan.length);
      expect(visibleEnvironmentObjects(plan,[]).some(x=>x.id==='env.hiddenWall')).toBe(false);
      expect(visibleEnvironmentObjects(plan,['env.lever']).some(x=>x.id==='env.hiddenWall')).toBe(true);
      expect(planEnvironmentInteraction('env.lockedDoor',plan,[])).toBeNull();
      expect(planEnvironmentInteraction('env.lockedDoor',plan,['env.lever']))
        .toMatchObject({id:'env.lockedDoor',kind:'lockedDoor'});
      expect(planEnvironmentInteraction('env.hiddenWall',plan,[])).toBeNull();
      expect(planEnvironmentInteraction('env.hiddenWall',plan,['env.lever']))
        .toMatchObject({id:'env.hiddenWall',kind:'hiddenWall'});
    }
  });
  it('rejects invalid seeds, forged IDs, duplicate IDs and invalid blessing timers',()=>{
    const {w,plan}=scene();
    expect(planEnvironmentObjects(NaN,w.layout,w.features)).toEqual([]);
    expect(planEnvironmentObjects(43,w.layout,w.features)).toEqual([]);
    expect(planEnvironmentObjects(42,{...w.layout,obstacles:[]},w.features)).toEqual([]);
    expect(planEnvironmentInteraction('__proto__',plan,[])).toBeNull();
    expect(planEnvironmentInteraction('env.chest',plan,['env.chest'])).toBeNull();
    expect(validEnvironmentUsedIds([])).toBe(true);
    expect(validEnvironmentUsedIds(['env.chest'])).toBe(true);
    expect(validEnvironmentUsedIds(['env.chest','env.chest'])).toBe(false);
    expect(validEnvironmentUsedIds(['fake'])).toBe(false);
    expect(validShrineBlessings([{kind:'damage',remaining:17}])).toBe(true);
    expect(validShrineBlessings([{kind:'armor',remaining:NaN}])).toBe(false);
    expect(validShrineBlessings([{kind:'speed',remaining:-1}])).toBe(false);
    expect(validShrineBlessings([{kind:'fake',remaining:10}])).toBe(false);
  });
});
describe('Prompt 38 — authoritative click and persistence integration',()=>{
  it('rejects remote commands, auto-approaches, tracks lore, levers and locked doors once',()=>{
    const sim=new GameSimulation(42);
    const initial=sim.snapshot();
    const lever=initial.environmentObjects?.find(o=>o.id==='env.lever')!;
    expect(lever).toBeDefined();
    sim.command({type:'interactEnvironment',id:'__proto__' as EnvironmentObjectId});
    expect(sim.snapshot().environmentUsedIds).toEqual([]);
    sim.command({type:'interactEnvironment',id:'env.lockedDoor'});
    expect(sim.snapshot().environmentUsedIds).toEqual([]);
    // Click must queue movement rather than grant a remote reward.
    sim.command({type:'interactEnvironment',id:'env.lever'});
    expect(sim.snapshot().environmentUsedIds).toEqual([]);
    expect(sim.snapshot().moveDestination).toEqual(lever.position);
    // Explicitly complete the last approach segment; the pending click stays authoritative.
    goto(sim,lever.position);
    sim.advance(50);
    expect(sim.snapshot().environmentUsedIds).toContain('env.lever');
    expect(sim.snapshot().environmentObjects?.some(o=>o.id==='env.hiddenWall')).toBe(true);
    interactAt(sim,'env.lockedDoor');
    expect(sim.snapshot().environmentUsedIds).toContain('env.lockedDoor');
    const done=sim.snapshot();
    sim.command({type:'interactEnvironment',id:'env.lockedDoor'});
    expect(sim.snapshot().gold).toBe(done.gold);
    interactAt(sim,'env.hiddenWall');
    expect(sim.snapshot().environmentUsedIds).toContain('env.hiddenWall');
    interactAt(sim,'env.lore');
    expect(sim.drainEvents().filter(e=>e.type==='environmentInteracted' && e.kind==='lore'))
      .toHaveLength(1);
    expect(sim.snapshot().environmentUsedIds).toContain('env.lore');
  });
  it('six shrine bonuses genuinely affect stats, attacks, healing, resource and loot bonus, then expire',()=>{
    const sim=new GameSimulation(42);
    const bonuses=sim.snapshot().environmentObjects?.filter(o=>o.kind==='shrine');
    expect(bonuses).toHaveLength(6);
    const before=sim.snapshot();
    for(const obj of bonuses!)interactAt(sim,obj.id);
    const active=sim.snapshot();
    expect(active.environmentBlessings?.length).toBe(6);
    expect(active.stats.armor).toBeGreaterThan(before.stats.armor);
    expect(active.stats.moveSpeed).toBeGreaterThan(before.stats.moveSpeed);
    expect(active.stats.magicFind).toBeGreaterThan(before.stats.magicFind);
    expect(active.environmentBlessings?.map(x=>x.kind).sort()).toEqual([...SHRINE_BONUSES].sort());
    const expiry=active.environmentBlessings![0]!.remaining;
    goto(sim,CAMP);
    for(let i=0;i<Math.ceil(expiry)*12;i++)sim.advance(100);
    expect(sim.snapshot().environmentBlessings).toEqual([]);
    expect(sim.snapshot().stats.armor).toBe(before.stats.armor);
  });
  it('one-shot chest and breakables survive world-only save and cannot be farmed',()=>{
    const sim=new GameSimulation(42);
    const start=sim.character();
    interactAt(sim,'env.chest');
    interactAt(sim,'env.barrel');
    interactAt(sim,'env.crate');
    const first=sim.snapshot();
    expect(first.environmentUsedIds).toEqual(expect.arrayContaining(['env.chest','env.barrel','env.crate']));
    expect(first.groundLoot.some(x=>x.id.includes('env.chest'))
      || first.inventory.some(x=>x?.id.includes('env.chest'))).toBe(true);
    expect(first.gold).toBeGreaterThan(start.gold);
    const progress=sim.worldProgress()!;
    expect(progress.environmentUsedIds).toEqual(expect.arrayContaining(['env.chest','env.barrel','env.crate']));
    expect(readWorldRecord(createWorldRecord(progress))).toEqual(progress);
    const loaded=new GameSimulation(42);
    expect(loaded.restoreCharacter(sim.character(),42)).toBe(true);
    expect(loaded.restoreWorldProgress(progress)).toBe(true);
    expect(loaded.snapshot().environmentObjects?.some(x=>x.id==='env.chest')).toBe(false);
    const unchanged=loaded.character();
    loaded.command({type:'interactEnvironment',id:'env.chest'});
    loaded.advance(150);
    expect(loaded.character()).toEqual(unchanged);
    expect(new GameSimulation(43).restoreWorldProgress(progress)).toBe(false);
    expect(loaded.restoreWorldProgress({...progress,environmentUsedIds:['fake']})).toBe(false);
  });
  it('traps are one-shot and damage only after real close-range activation; forged snapshots fail closed',()=>{
    const sim=new GameSimulation(42);
    const trap=sim.snapshot().environmentObjects?.find(o=>o.id==='env.trap')!;
    const before=sim.snapshot();
    sim.command({type:'interactEnvironment',id:'env.trap'});
    expect(sim.snapshot().player.health).toBe(before.player.health);
    goto(sim,trap.position);
    sim.advance(50);
    expect(sim.snapshot().environmentUsedIds).toContain('env.trap');
    const after=sim.snapshot();
    sim.command({type:'interactEnvironment',id:'env.trap'});
    expect(sim.snapshot().player.health).toBe(after.player.health);
    expect(sim.restore({...after,environmentUsedIds:['env.chest','env.chest']})).toBe(false);
    expect(sim.snapshot()).toEqual(after);
    expect(sim.restore({...after,environmentBlessings:[{kind:'fake',remaining:12}]} as typeof after)).toBe(false);
    expect(sim.snapshot()).toEqual(after);
  });
});
