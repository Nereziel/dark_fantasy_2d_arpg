// GPL-3.0-only — #207 B2b2b: roster-independent encounter slot accounting.
import {describe,it,expect} from 'vitest';
import {createPack,type EnemyUnit} from '../../src/game/enemies/enemies';
import {encounterSlots} from '../../src/game/enemies/encounterSlots';
import {ActIWildernessSession} from '../../src/game/world/actIWildernessSession';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
const add=(id:string,summoned=false):EnemyUnit=>{
  const base=createPack(0,1)[0]!;
  return {...base,actor:{...base.actor,id},summoned};
};
describe('#207 B2b2b encounter accounting by identity',()=>{
  it('keeps legacy canonical slots independent of ordering and death',()=>{
    const pack=createPack(3,1);
    pack[0]!.actor.alive=false;pack[0]!.actor.health=0;
    const boss=add('bandit_captain');
    const units=[boss,...pack.reverse(),add('summon-3-4',true)];
    expect(encounterSlots(units,3)).toEqual({canonical:3,extra:2,summonedAlive:1,optionalBosses:1});
    expect(encounterSlots(units,3).extra).toBe(2);
  });
  it('ordinary and hunt roster never consumes optional encounter capacity',()=>{
    const session=new ActIWildernessSession(buildWilderness(42),1,'test');
    const all=session.population.allUnits();
    expect(all.length).toBeGreaterThan(3);
    expect(encounterSlots(all,0,session.manifest)).toEqual({canonical:all.length,extra:0,summonedAlive:0,optionalBosses:0});
    const summon=add('summon-0-50',true);
    summon.actor.alive=false;summon.actor.health=0;
    const units=[add('morrow_gravebound'),...all,add('world-event.test-1'),summon];
    expect(encounterSlots(units,0,session.manifest)).toEqual({canonical:all.length,extra:3,summonedAlive:0,optionalBosses:0});
  });
  it('unknown and forged canonical identities never bypass the extra budget',()=>{
    const pack=createPack(0,1);
    const spoof=add(pack[0]!.actor.id,true);
    const wrong=add('wolf-1');
    wrong.actor.type='skeleton';
    expect(encounterSlots([spoof,wrong,add('unrecognized')],0).extra).toBe(3);
  });
});
