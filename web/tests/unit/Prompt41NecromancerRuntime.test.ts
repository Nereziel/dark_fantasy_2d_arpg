// GPL-3.0-only — Prompt 41 Necromancer authoritative runtime regression.
import {describe,expect,it} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {NECRO_EXTRA_SPELLS} from '../../src/game/skills/necromancerKit';
function necro(){
  const sim=new GameSimulation(42);
  sim.command({type:'reset',classId:'NECROMANCER',seed:42});
  return sim;
}
function tick(sim:GameSimulation,frames=40){
  for(let i=0;i<frames;i++)sim.advance(16.667);
}
function prepareWeakEnemy(sim:GameSimulation){
  const before=sim.snapshot();
  const unit=before.enemies.find(u=>u.actor.alive)!;
  const updated={
    ...before,player:{...before.player,x:unit.actor.x,y:unit.actor.y},
    enemies:before.enemies.map(u=>u.actor.id===unit.actor.id
      ? {...u,actor:{...u.actor,health:1}}:u)
  };
  expect(sim.restore(updated)).toBe(true);
  return unit.actor.id;
}
describe('Prompt 41 — Necromancer real combat and persistence',()=>{
  it('raises real owner-bound skeletons at hit frame instead of a cosmetic buff',()=>{
    const sim=necro(),before=sim.snapshot();
    expect(before.classId).toBe('NECROMANCER');
    expect(before.summons).toEqual([]);
    sim.command({type:'cast',slot:'slot1'});
    const started=sim.snapshot();
    expect(started.resource).toBe(before.resource-20);
    expect(started.summons).toEqual([]);
    tick(sim,40);
    const after=sim.snapshot();
    expect(after.summons).toHaveLength(1);
    expect(after.summons![0]).toMatchObject({ownerId:'hero',kind:'skeleton',
      zone:'wilderness'});
    expect(after.effects.player.some(e=>e.id==='skeleton')).toBe(false);
    expect(after.nextSummonSequence).toBe(2);
  });
  it('spends Essence once on Golem, refuses duplicates and other classes cannot cast',()=>{
    const sim=necro(),before=sim.snapshot();
    sim.command({type:'necroAbility',id:'summonGolem'});
    expect(sim.snapshot().resource).toBe(before.resource-NECRO_EXTRA_SPELLS.summonGolem.cost);
    sim.command({type:'necroAbility',id:'summonGolem'});
    expect(sim.snapshot().resource).toBe(before.resource-NECRO_EXTRA_SPELLS.summonGolem.cost);
    tick(sim,40);
    expect(sim.snapshot().summons?.filter(s=>s.kind==='golem')).toHaveLength(1);
    const second=sim.snapshot();
    sim.command({type:'necroAbility',id:'summonGolem'});
    expect(sim.snapshot().resource).toBe(second.resource);
    sim.command({type:'reset',classId:'MAGE',seed:42});
    const mage=sim.snapshot();
    sim.command({type:'necroAbility',id:'summonGolem'});
    expect(sim.snapshot().resource).toBe(mage.resource);
    expect(sim.snapshot().summons).toEqual([]);
  });
  it('converts only real defeated enemies to corpse tokens then consumes each once',()=>{
    const sim=necro();
    const enemyId=prepareWeakEnemy(sim);
    sim.command({type:'cast',slot:'rmb',targetId:enemyId});
    tick(sim,45);
    const afterKill=sim.snapshot();
    expect(afterKill.enemies.find(u=>u.actor.id===enemyId)?.actor.alive).toBe(false);
    expect(afterKill.corpses?.map(c=>c.enemyId)).toContain(enemyId);
    const corpse=afterKill.corpses!.find(c=>c.enemyId===enemyId)!;
    const essence=afterKill.resource;
    sim.command({type:'necroAbility',id:'corpseExplosion',
      position:{x:corpse.x,y:corpse.y}});
    expect(sim.snapshot().resource).toBe(essence-NECRO_EXTRA_SPELLS.corpseExplosion.cost);
    tick(sim,35);
    expect(sim.snapshot().corpses?.some(c=>c.enemyId===enemyId)).toBe(false);
    const spent=sim.snapshot().resource;
    sim.command({type:'necroAbility',id:'corpseExplosion',
      position:{x:corpse.x,y:corpse.y}});
    expect(sim.snapshot().resource).toBe(spent);
  });
  it('snapshots replay, reject forged owners and never save minions or bodies',()=>{
    const sim=necro();
    sim.command({type:'cast',slot:'slot1'});
    tick(sim,40);
    const snapshot=sim.snapshot();
    expect(sim.restore(structuredClone(snapshot))).toBe(true);
    expect(sim.snapshot().summons).toEqual(snapshot.summons);
    expect(sim.restore({...snapshot,
      summons:[{...snapshot.summons![0]!,ownerId:'not-hero'}]})).toBe(false);
    expect(sim.restore({...snapshot,
      necroCooldowns:{summonGolem:Infinity}})).toBe(false);
    const character=sim.character();
    expect('summons' in character).toBe(false);
    expect('corpses' in character).toBe(false);
    expect('necroCooldowns' in character).toBe(false);
  });
  it('cleans allies and corpses on cross-zone transition and class reset',()=>{
    const sim=necro();
    sim.command({type:'cast',slot:'slot1'});
    tick(sim,40);
    expect(sim.snapshot().summons?.length).toBe(1);
    sim.command({type:'reset',classId:'NECROMANCER',seed:42});
    expect(sim.snapshot().summons).toEqual([]);
    expect(sim.snapshot().corpses).toEqual([]);
    expect(sim.snapshot().nextSummonSequence).toBe(1);
  });
});
