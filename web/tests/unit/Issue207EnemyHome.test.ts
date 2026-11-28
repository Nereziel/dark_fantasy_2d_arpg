// GPL-3.0-only — #207 B2a: enemy origin is independent of active roster order.
import {describe,expect,it} from 'vitest';
import {resolveEnemyHome} from '../../src/game/enemies/enemyHome';
import {createPack,createBlightedPack} from '../../src/game/enemies/enemies';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {planWildernessPopulation,populationReservations} from '../../src/game/world/wildernessPopulation';
import {planWorldEvents} from '../../src/game/world/worldEvents';

describe('#207 B2a: stable enemy home identity',()=>{
  it('resolves legacy wave and quest pack members by identity, not array index',()=>{
    const positions=[{x:400,y:400},{x:600,y:600},{x:800,y:800}];
    for(const pack of [createPack(3,1,positions),createBlightedPack(3,1,positions)]){
      const reordered=[pack[2]!,pack[0]!,pack[1]!];
      for(const unit of reordered){
        const index=pack.indexOf(unit);
        const home=resolveEnemyHome(unit,{wave:3,positions});
        expect(home).toEqual({origin:{x:positions[index]!.x,y:positions[index]!.y+25},patrolSlot:index});
      }
      expect(resolveEnemyHome(pack[0]!,{wave:2,positions})).toBeUndefined();
    }
  });
  it('resolves actual event spawn and future population spawn even after movement',()=>{
    const world=buildWilderness(42);
    const events=planWorldEvents(42,world.layout,world.features);
    const population=planWildernessPopulation(world);
    const member=population.groups[0]!.members[0]!;
    const event=events[0]!.enemySpawns[0]!;
    for(const [m,p] of [[member,member.spawn],[event,event.position]] as const){
      const unit={actor:{id:m.id,type:m.type,x:p.x+70,y:p.y+20},summoned:false};
      expect(resolveEnemyHome(unit,{wave:3,positions:world.layout.encounterPositions,events,population}))
        .toEqual({origin:p,patrolSlot:0});
    }
    expect(resolveEnemyHome({actor:{id:member.id,type:'crypt_lord',x:0,y:0}},
      {wave:3,positions:world.layout.encounterPositions,population})).toBeUndefined();
  });
  it('retains the existing summon fallback and rejects unknown ordinary IDs',()=>{
    const actor={id:'summon-2-3',type:'skeleton' as const,x:100,y:200};
    expect(resolveEnemyHome({actor,summoned:true},{wave:2,positions:[]}))
      .toEqual({origin:{x:100,y:200},patrolSlot:3});
    expect(resolveEnemyHome({actor},{wave:2,positions:[]})).toBeUndefined();
  });
  it.each([0,42,245489])('reserves existing optional miniboss sites for seed %i',seed=>{
    const world=buildWilderness(seed),reserved=populationReservations(world);
    for(const f of world.features.filter(f=>['wild.encounter.1','wild.encounter.2','wild.poi.1'].includes(f.id)))
      expect(reserved.some(r=>r.position.x===f.position.x&&r.position.y===f.position.y&&r.radius>=f.radius+55)).toBe(true);
  });
});
