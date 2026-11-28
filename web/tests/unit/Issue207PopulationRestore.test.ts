// GPL-3.0-only — #207 B2b2c: validate and restore authoritative roster.
import {describe,it,expect} from 'vitest';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {ActIWildernessSession} from '../../src/game/world/actIWildernessSession';
const world=buildWilderness(42);
const session=()=>new ActIWildernessSession(world,3,'instanceA');
describe('#207 same-instance population restoration',()=>{
  it('round trips all dead and inactive members without replacing live references',()=>{
    const original=session(), units=original.population.allUnits();
    units[0]!.actor.health-=7;units[0]!.cooldown=1.5;
    units[1]!.actor.health=0;units[1]!.actor.alive=false;
    const snapshot=original.snapshot();
    const resumed=session(),references=resumed.population.allUnits();
    expect(resumed.restore(snapshot)).toBe(true);
    expect(resumed.snapshot()).toEqual(snapshot);
    expect(resumed.population.allUnits().every((u,i)=>u===references[i])).toBe(true);
    snapshot.enemies[0]!.actor.health=0;
    expect(resumed.population.allUnits()[0]!.actor.health).toBeGreaterThan(0);
  });
  it('rejects a different session or seed without changing live state',()=>{
    const s=session(), before=s.snapshot();
    const other=new ActIWildernessSession(world,3,'instanceB');
    expect(s.restore(other.snapshot())).toBe(false);
    expect(s.restore({...before,seed:43})).toBe(false);
    expect(s.snapshot()).toEqual(before);
  });
  it('rejects partial, duplicate, forged and invalid combat records atomically',()=>{
    const s=session(),before=s.snapshot();
    const invalid=[
      {...before,enemies:before.enemies.slice(1)},
      {...before,enemies:[...before.enemies.slice(1),before.enemies[1]]},
      null, { ...before,enemies:null }
    ];
    for(const corrupt of [
      (u:typeof before.enemies[number])=>{u.actor.id='unknown'},
      (u:typeof before.enemies[number])=>{u.actor.type='crypt_lord'},
      (u:typeof before.enemies[number])=>{u.actor.x=-100},
      (u:typeof before.enemies[number])=>{u.actor.health=NaN},
      (u:typeof before.enemies[number])=>{u.actor.alive=false},
      (u:typeof before.enemies[number])=>{u.summoned=true},
      (u:typeof before.enemies[number])=>{u.cooldown=-1},
      (u:typeof before.enemies[number])=>{u.abilityCooldowns={forged:1}},
    ]){
      const bad=structuredClone(before);
      corrupt(bad.enemies[0]!);
      expect(s.restore(bad)).toBe(false);
      expect(s.snapshot()).toEqual(before);
    }
    for(const bad of invalid){
      expect(s.restore(bad)).toBe(false);
      expect(s.snapshot()).toEqual(before);
    }
  });
  it('matches by canonical ID rather than serialized array order',()=>{
    const s=session(), snapshot=s.snapshot();
    snapshot.enemies.reverse();
    expect(s.restore(snapshot)).toBe(true);
    expect(s.snapshot().enemies.map(u=>u.actor.id)).toEqual(snapshot.enemies.reverse().map(u=>u.actor.id));
  });
});
