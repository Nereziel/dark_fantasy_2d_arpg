// GPL-3.0-only — #207 finite roster progression without wave numbers.
import {describe,it,expect} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {ActIWildernessSession} from '../../src/game/world/actIWildernessSession';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {NPC_POSITIONS} from '../../src/game/world/npcs';
import {rollCombatGem} from '../../src/game/items/gems';
import type {EnemyUnit} from '../../src/game/enemies/enemies';

function start(seed=42,token='progression'){
  const sim=new GameSimulation(seed);
  expect(sim.startFinitePopulation(token)).toBe(true);
  const runtime=sim as unknown as {units:EnemyUnit[];defeatEnemy(u:EnemyUnit):void};
  return {sim,runtime};
}
describe('#207 finite progression',()=>{
  it('reconciles pre-accept ordinary deaths exactly once, without duplicate kill rewards',()=>{
    const {sim,runtime}=start();
    const ordinary=runtime.units.filter(u=>u.actor.id.startsWith('population-'));
    runtime.defeatEnemy(ordinary[0]!);
    runtime.defeatEnemy(ordinary[1]!);
    const before=sim.snapshot();
    expect(before.quest.status).toBe('available');
    const atWarden={...before,player:{...before.player,...NPC_POSITIONS.warden_vesna}};
    expect(sim.restore(atWarden)).toBe(true);
    sim.command({type:'questAccept'});
    const accepted=sim.snapshot();
    expect(accepted.quest.defeated).toBe(2);
    expect(accepted.gold).toBe(before.gold);
    expect(accepted.kills).toBe(before.kills);
    sim.command({type:'questAccept'});
    expect(sim.snapshot().quest.defeated).toBe(2);
    runtime.defeatEnemy(runtime.units.find(u=>u.actor.id===ordinary[2]!.actor.id)!);
    expect(sim.snapshot().quest.status).toBe('ready');
    expect(sim.snapshot().kills).toBe(before.kills+1);
  });
  it('seeds deterministic elites away from the starter groups and never rerolls after restore',()=>{
    const world=buildWilderness(42),{sim}=start();
    const plan=new ActIWildernessSession(world,1,'plan');
    const ordered=[...plan.ordinary.groups].sort((a,b)=>
      Math.hypot(a.anchor.x-world.layout.camp.x,a.anchor.y-world.layout.camp.y)
      -Math.hypot(b.anchor.x-world.layout.camp.x,b.anchor.y-world.layout.camp.y)
      ||a.id.localeCompare(b.id));
    const protectedIds=new Set(ordered.slice(0,2).flatMap(g=>g.members.map(m=>m.id)));
    const s=sim.snapshot(),elite=s.enemies.filter(u=>u.elite);
    expect(elite.length).toBeGreaterThan(0);
    expect(elite.every(u=>!protectedIds.has(u.actor.id)&&u.actor.id.startsWith('population-'))).toBe(true);
    const other=start(42,'other').sim.snapshot();
    expect(other.enemies).toEqual(s.enemies);
    expect(sim.restore(s)).toBe(true);
    expect(sim.snapshot().enemies).toEqual(s.enemies);
  });
  it('keeps combat gem eligibility for finite ordinary elites at wave zero',()=>{
    const {sim,runtime}=start();
    const elite=runtime.units.find(u=>u.elite)!;
    expect(elite).toBeDefined();
    let kills=0;
    while(!rollCombatGem(42,kills+1,'elite')&&kills<500)kills++;
    expect(kills).toBeLessThan(500);
    const s=sim.snapshot();s.kills=kills;
    expect(sim.restore(s)).toBe(true);
    runtime.defeatEnemy(runtime.units.find(u=>u.actor.id===elite.actor.id)!);
    const after=sim.snapshot();
    expect(after.wave).toBe(0);
    expect(after.gems?.[rollCombatGem(42,kills+1,'elite')!]).toBeGreaterThan(0);
  });
});
