// GPL-3.0-only — #207 B2b2d: opt-in finite roster in real simulation.
import {describe,it,expect} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {ActIWildernessSession} from '../../src/game/world/actIWildernessSession';
const seed=42;
function start(){
  const sim=new GameSimulation(seed);
  expect(sim.startFinitePopulation('test-instance')).toBe(true);
  return sim;
}
function changeActors(sim:GameSimulation, edit:(s:ReturnType<GameSimulation['snapshot']>)=>void){
  const s=sim.snapshot();edit(s);
  // A wilderness snapshot contains the live zone roster; only canonical records
  // are copied into the off-zone population archive.
  const ids=new Set(s.wildernessPopulation!.enemies.map(u=>u.actor.id));
  s.wildernessPopulation!.enemies=structuredClone(s.enemies.filter(u=>ids.has(u.actor.id)));
  expect(sim.restore(s)).toBe(true);
}
describe('#207 finite wilderness runtime',()=>{
  it('starts with the whole canonical ordinary and hunt roster, not three wave enemies',()=>{
    const sim=start(),s=sim.snapshot();
    const expected=new ActIWildernessSession(buildWilderness(seed),1,'test-instance');
    expect(s.enemies.map(u=>u.actor.id)).toEqual(expected.population.snapshot().map(u=>u.actor.id));
    expect(s.enemies.length).toBeGreaterThan(3);
    expect(s.wildernessPopulation?.sessionId).toBe('test-instance');
    expect(sim.startFinitePopulation('other')).toBe(false);
  });
  it('never generates ordinary waves after all canonical enemies die',()=>{
    const sim=start();
    changeActors(sim,s=>{
      for(const u of s.enemies){u.actor.alive=false;u.actor.health=0;u.intent=null;}
      s.enemy={...s.enemies[0]!.actor};s.enemyIntent=null;s.respawnTimer=0;
    });
    const before=sim.snapshot().wildernessPopulation!;
    for(let i=0;i<60;i++)sim.advance(100);
    const after=sim.snapshot();
    expect(after.wave).toBe(0);
    expect(after.respawnTimer).toBe(0);
    expect(after.wildernessPopulation).toEqual(before);
  });
  it('retains canonical deaths, wounds and cooldowns across hero respawn',()=>{
    const sim=start();
    changeActors(sim,s=>{
      const dead=s.enemies[0]!,hurt=s.enemies[1]!;
      dead.actor.health=0;dead.actor.alive=false;
      hurt.actor.health-=5;hurt.cooldown=2;
      s.enemy={...hurt.actor};s.enemyCooldown=hurt.cooldown;
      s.player.alive=false;s.player.health=0;s.status='dead';s.respawnAt=undefined;
    });
    const before=sim.snapshot().wildernessPopulation!;
    sim.command({type:'respawn'});
    expect(sim.snapshot().player.alive).toBe(true);
    expect(sim.snapshot().wildernessPopulation).toEqual(before);
  });
  it('rejects a conflicting live roster or session atomically and resets on new game',()=>{
    const sim=start(),before=sim.snapshot();
    const invalid=structuredClone(before);
    invalid.enemies[0]!.actor.health-=1;
    expect(sim.restore(invalid)).toBe(false);
    expect(sim.snapshot()).toEqual(before);
    const conflicting=structuredClone(before);
    conflicting.wildernessPopulation!.sessionId='other';
    expect(sim.restore(conflicting)).toBe(false);
    sim.reset('WARRIOR',seed);
    expect(sim.snapshot().wildernessPopulation).toBeUndefined();
    expect(sim.startFinitePopulation('next-instance')).toBe(true);
    expect(sim.snapshot().wildernessPopulation?.sessionId).toBe('next-instance');
    expect(sim.snapshot().enemies.every(u=>u.actor.alive)).toBe(true);
  });
});
