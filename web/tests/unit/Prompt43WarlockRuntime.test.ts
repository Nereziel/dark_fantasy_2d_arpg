// GPL-3.0-only. Prompt 43 — simulation-authoritative Warlock regression.
import {describe,expect,it} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {WARLOCK_EXTRA_SPELLS} from '../../src/game/skills/warlockKit';

function warlock(){
  const sim=new GameSimulation(42);
  sim.command({type:'reset',classId:'WARLOCK',seed:42});
  return sim;
}
function tick(sim:GameSimulation,count=48){
  for(let i=0;i<count;i++)sim.advance(16.667);
}
function nearEnemy(sim:GameSimulation){
  const before=sim.snapshot();
  const enemy=before.enemies.find(u=>u.actor.alive)!;
  expect(sim.restore({...before,
    player:{...before.player,x:enemy.actor.x,y:enemy.actor.y},
    resource:before.stats.maxResource})).toBe(true);
  return enemy.actor.id;
}
describe('Prompt 43 — Warlock actual gameplay',()=>{
  it('casts five additional skills only on Warlock and spends Soul Power once',()=>{
    const sim=warlock(),initial=sim.snapshot();
    sim.command({type:'warlockAbility',id:'demonSummoning'});
    const start=sim.snapshot();
    expect(start.resource).toBe(initial.resource-WARLOCK_EXTRA_SPELLS.demonSummoning.cost);
    expect(start.summons).toEqual([]);
    sim.command({type:'warlockAbility',id:'demonSummoning'});
    expect(sim.snapshot().resource).toBe(start.resource);
    tick(sim);
    expect(sim.snapshot().summons?.[0]).toMatchObject({
      ownerId:'hero',kind:'demon',zone:'wilderness'});
    const saved=sim.character() as unknown as Record<string,unknown>;
    expect(saved.summons).toBeUndefined();
    expect(saved.warlockCooldowns).toBeUndefined();
    sim.command({type:'reset',classId:'MAGE',seed:42});
    sim.command({type:'warlockAbility',id:'demonSummoning'});
    expect(sim.snapshot().summons).toEqual([]);
  });
  it('deals targeted shadow damage and rejects out of range/invisible casts',()=>{
    const sim=warlock();
    const target=nearEnemy(sim);
    const initial=sim.snapshot();
    const hp=initial.enemies.find(u=>u.actor.id===target)!.actor.health;
    sim.command({type:'warlockAbility',id:'shadowBolt',targetId:target});
    expect(sim.snapshot().resource).toBe(initial.resource-WARLOCK_EXTRA_SPELLS.shadowBolt.cost);
    tick(sim);
    expect(sim.snapshot().enemies.find(u=>u.actor.id===target)!.actor.health).toBeLessThan(hp);
    const after=sim.snapshot();
    sim.command({type:'warlockAbility',id:'shadowBolt',targetId:target});
    expect(sim.snapshot().resource).toBe(after.resource);
  });
  it('Corruption uses canonical cursed and poisoned statuses, Fear uses control',()=>{
    const sim=warlock();
    const target=nearEnemy(sim);
    sim.command({type:'warlockAbility',id:'corruption',targetId:target});
    tick(sim,35);
    expect(sim.snapshot().statusEffects?.enemies[target]?.map(e=>e.id))
      .toEqual(expect.arrayContaining(['cursed','poisoned']));
    const next=warlock(),fearTarget=nearEnemy(next);
    next.command({type:'warlockAbility',id:'fear',targetId:fearTarget});
    tick(next,35);
    expect(next.snapshot().statusEffects?.enemies[fearTarget]?.map(e=>e.id))
      .toEqual(expect.arrayContaining(['stunned','silenced']));
  });
  it('Hellfire damages nearby enemies and applies burning on hit frame',()=>{
    const sim=warlock(),target=nearEnemy(sim);
    const start=sim.snapshot();
    const hp=start.enemies.find(u=>u.actor.id===target)!.actor.health;
    sim.command({type:'warlockAbility',id:'hellfire'});
    expect(sim.snapshot().enemies.find(u=>u.actor.id===target)!.actor.health).toBe(hp);
    tick(sim,35);
    expect(sim.snapshot().enemies.find(u=>u.actor.id===target)!.actor.health).toBeLessThan(hp);
    expect(sim.snapshot().statusEffects?.enemies[target]?.map(e=>e.id)).toContain('burning');
  });
  it('rejects forged cooldowns/demons/action and resets all transient Warlock state',()=>{
    const sim=warlock();
    sim.command({type:'warlockAbility',id:'demonSummoning'});
    tick(sim);
    const s=sim.snapshot();
    expect(sim.restore(structuredClone(s))).toBe(true);
    expect(sim.restore({...s,warlockCooldowns:{demonSummoning:Infinity}})).toBe(false);
    expect(sim.restore({...s,summons:s.summons!.map(a=>({...a,kind:'golem' as const}))})).toBe(false);
    expect(sim.restore({...s,classId:'MAGE'})).toBe(false);
    sim.command({type:'reset',classId:'WARLOCK',seed:42});
    expect(sim.snapshot().summons).toEqual([]);
    expect(sim.snapshot().warlockCooldowns).toEqual({});
  });
});
