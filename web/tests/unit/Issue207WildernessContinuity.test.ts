// GPL-3.0-only — #207 B2b2e finite wilderness encounter continuity.
import {describe,it,expect} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import type {EnemyUnit} from '../../src/game/enemies/enemies';
import type {MiniBossState} from '../../src/game/enemies/miniBossRules';
import {createMiniBossState,getMiniBossDefinition} from '../../src/game/enemies/miniBossRules';
function fixture(){
  const sim=new GameSimulation(42);
  expect(sim.startFinitePopulation('continuity')).toBe(true);
  // Use actual zone/death handlers, with a deterministic wounded boss fixture.
  const runtime=sim as unknown as {units:EnemyUnit[];miniBossStates:Map<string,MiniBossState>;
    changeZone():void;hitPlayer(n:number):void;spawnOptionalMiniBosses():void};
  const p=buildWilderness(42).features.find(f=>f.id==='wild.encounter.1')!.position;
  const id='bandit_captain',def=getMiniBossDefinition(id)!;
  const boss:EnemyUnit={actor:{id,type:def.enemyType,level:1,...p,
    health:def.baseHealth-20,maxHealth:def.baseHealth,alive:true},intent:null,cooldown:1.3,effects:[],abilityCooldowns:{}};
  runtime.units.push(boss);runtime.miniBossStates.set(id,createMiniBossState(id,id)!);
  return {sim,runtime,boss};
}
describe('#207 wilderness continuity',()=>{
  it('does not evict an already created wounded unique at distance',()=>{
    const {sim,runtime,boss}=fixture();
    runtime.spawnOptionalMiniBosses();
    expect(runtime.units.find(u=>u.actor.id===boss.actor.id)).toBe(boss);
    expect(sim.snapshot().enemies.find(u=>u.actor.id===boss.actor.id)?.actor.health).toBe(boss.actor.health);
  });
  it('keeps wounded boss and phase state across actual player death and respawn',()=>{
    const {sim,runtime,boss}=fixture(),before=sim.snapshot();
    runtime.hitPlayer(1000000);
    sim.command({type:'respawn'});
    const after=sim.snapshot();
    expect(after.player.alive).toBe(true);
    expect(after.enemies.find(u=>u.actor.id===boss.actor.id)).toEqual(boss);
    expect(after.miniBossStates?.[boss.actor.id]).toEqual(before.miniBossStates?.[boss.actor.id]);
  });
  it('retains wilderness archive on a dungeon round trip and snapshot restore',()=>{
    const {sim,runtime,boss}=fixture(),before=sim.snapshot();
    runtime.changeZone();
    const inside=sim.snapshot();
    expect(inside.zone).toBe('crypt');
    expect(inside.wildernessCombat?.bosses).toContainEqual(boss);
    expect(sim.restore(inside)).toBe(true);
    runtime.changeZone();
    const after=sim.snapshot();
    expect(after.enemies.find(u=>u.actor.id===boss.actor.id)).toEqual(boss);
    expect(after.miniBossStates?.[boss.actor.id]).toEqual(before.miniBossStates?.[boss.actor.id]);
    expect(after.wildernessCombat).toBeUndefined();
  });
});
