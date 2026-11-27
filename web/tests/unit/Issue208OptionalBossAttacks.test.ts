// GPL-3.0-only
import {describe,expect,it} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {planActIDungeonEntrances,buildActIDungeonInterior} from '../../src/game/world/actIDungeonEntrances';
import {optionalDungeonBossAction,canStartOptionalBossAttack,resolveOptionalBossImpact} from '../../src/game/enemies/optionalDungeonEncounters';
import {ACTOR_RADIUS,canOccupy,movementSegmentClear} from '../../src/game/world/navigation';
import type {EnemyUnit} from '../../src/game/enemies/enemies';
import type {Point} from '../../src/game/core/types';

describe('Issue #208 C3.5 — optional boss attacks',()=>{
  it('keeps boss actions exclusive to the canonical dungeon boss',()=>{
    expect(optionalDungeonBossAction('mine',1,'fanatic-4')).toMatchObject({id:'foremanSmash',attack:'sweep'});
    expect(optionalDungeonBossAction('cave',1,'corruptedBoar-4')).toMatchObject({id:'depthsCharge',attack:'leap'});
    for(const [id,stage,actor] of [
      ['mine',0,'fanatic-4'],['mine',1,'cultHealer-5'],['cave',1,'fanatic-4'],
      [undefined,1,'corruptedBoar-4']
    ] as const)expect(optionalDungeonBossAction(id,stage,actor)).toBeUndefined();
  });

  it('uses fixed warned areas and never charges or damages through a wall',()=>{
    const actor={x:500,y:500}, target={x:600,y:500};
    const wall=[{id:'test-wall',x:545,y:450,width:10,height:100}];
    const smash=optionalDungeonBossAction('mine',1,'fanatic-4')!;
    const charge=optionalDungeonBossAction('cave',1,'corruptedBoar-4')!;
    expect(canStartOptionalBossAttack(smash,actor,target,wall)).toBe(false);
    expect(canStartOptionalBossAttack(charge,actor,target,wall)).toBe(false);
    expect(canStartOptionalBossAttack(charge,actor,target,[])).toBe(true);
    const warned={...target,pattern:charge.attack,radius:charge.areaRadius!,remaining:.1,total:charge.windup,abilityId:charge.id};
    expect(resolveOptionalBossImpact(charge,actor,warned,target,wall)).toEqual({hit:false});
    expect(resolveOptionalBossImpact(charge,actor,warned,target,[])).toEqual({destination:target,hit:true});
    expect(resolveOptionalBossImpact(charge,actor,warned,{x:600,y:640},[])).toEqual({destination:target,hit:false});
    const area={...actor,pattern:smash.attack,radius:smash.areaRadius!,remaining:.1,total:smash.windup,abilityId:smash.id};
    expect(resolveOptionalBossImpact(smash,actor,area,target,[])).toEqual({hit:true});
    expect(resolveOptionalBossImpact(smash,actor,area,target,wall)).toEqual({hit:false});
    expect(resolveOptionalBossImpact(smash,actor,area,{x:700,y:500},[])).toEqual({hit:false});
  });

  it.each(['mine','cave'] as const)('commits a real %s boss windup, restores it and resolves damage once',id=>{
    const seed=42,sim=new GameSimulation(seed);
    const entrance=planActIDungeonEntrances(buildWilderness(seed)).find(e=>e.id===id)!;
    const initial=sim.snapshot();
    expect(sim.restore({...initial,player:{...initial.player,...entrance.position}})).toBe(true);
    sim.command({type:'usePortal',dungeonId:id});
    type Internals={units:EnemyUnit[];player:Point;defeatEnemy:(u:EnemyUnit)=>void;updateEnemyAI:(u:EnemyUnit,dt:number)=>void};
    const core=sim as unknown as Internals;
    for(const unit of [...core.units])core.defeatEnemy(unit);
    for(let i=0;i<40&&sim.snapshot().dungeonStage===0;i++)sim.advance(100);
    expect(sim.snapshot().dungeonStage).toBe(1);
    const boss=core.units[0]!;
    const action=optionalDungeonBossAction(id,1,boss.actor.id)!;
    const walls=buildActIDungeonInterior(seed,id).obstacles;
    const target=[{x:boss.actor.x+55,y:boss.actor.y},{x:boss.actor.x-55,y:boss.actor.y},
      {x:boss.actor.x,y:boss.actor.y+55},{x:boss.actor.x,y:boss.actor.y-55}]
      .find(p=>canOccupy(p,ACTOR_RADIUS,walls)&&movementSegmentClear(boss.actor,p,walls))!;
    expect(target).toBeDefined();
    Object.assign(core.player,target);
    boss.intent=null;boss.cooldown=0;boss.abilityCooldowns={};
    core.updateEnemyAI(boss,.05);
    expect(boss.intent).toMatchObject({abilityId:action.id,pattern:action.attack,total:action.windup,radius:action.areaRadius});
    expect(boss.abilityCooldowns[action.id]).toBe(action.cooldown);
    const warned=sim.snapshot();
    expect(sim.restore(warned)).toBe(true);
    const restored=core.units[0]!;
    const hp=sim.snapshot().player.health;
    core.updateEnemyAI(restored,action.windup/2);
    expect(sim.snapshot().player.health).toBe(hp);
    core.updateEnemyAI(restored,action.windup/2+.01);
    expect(restored.intent).toBeNull();
    expect(sim.snapshot().player.health).toBeLessThan(hp);
    if(id==='cave')expect(restored.actor).toMatchObject(target);
    const after=sim.snapshot().player.health;
    core.updateEnemyAI(restored,.05);
    expect(sim.snapshot().player.health).toBe(after);
    expect(sim.snapshot().questLedger).toEqual(initial.questLedger);
    expect(sim.snapshot().hollowKing).toBeNull();
  },30000);
});
