// GPL-3.0-only
import {describe,expect,it} from 'vitest';
import {optionalDungeonBossAction,canResolveOptionalDungeonBossAction} from '../../src/game/enemies/optionalDungeonEncounters';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {planActIDungeonEntrances,buildActIDungeonInterior} from '../../src/game/world/actIDungeonEntrances';
import type {EnemyUnit} from '../../src/game/enemies/enemies';
import {movementSegmentClear} from '../../src/game/world/navigation';

describe('Issue #208 C3.5: optional dungeon boss attacks',()=>{
  it('scopes distinct attacks to the real stage-one boss identity',()=>{
    const slam=optionalDungeonBossAction('mine',1,'fanatic-4')!;
    const charge=optionalDungeonBossAction('cave',1,'corruptedBoar-4')!;
    expect(slam).toMatchObject({id:'foremanSlam',attack:'sweep'});
    expect(charge).toMatchObject({id:'deepBoarCharge',attack:'leap'});
    for(const action of [slam,charge]){
      expect(action.windup).toBeGreaterThanOrEqual(1);
      expect(action.cooldown).toBeGreaterThan(action.windup);
      expect(action.damage).toBeGreaterThan(0);
    }
    expect(optionalDungeonBossAction('mine',0,'fanatic-4')).toBeUndefined();
    expect(optionalDungeonBossAction('mine',1,'corruptedBoar-4')).toBeUndefined();
    expect(optionalDungeonBossAction(undefined,1,'fanatic-4')).toBeUndefined();
    expect(optionalDungeonBossAction('cave',1,'spider-5')).toBeUndefined();
  });
  it('rejects a charge through a wall even when both endpoints are clear',()=>{
    const action=optionalDungeonBossAction('cave',1,'corruptedBoar-4')!;
    const from={x:200,y:200},to={x:340,y:200};
    const wall={id:'wall',x:260,y:150,width:20,height:100};
    expect(canResolveOptionalDungeonBossAction(action,from,to,[])).toBe(true);
    expect(canResolveOptionalDungeonBossAction(action,from,to,[wall])).toBe(false);
    expect(canResolveOptionalDungeonBossAction(action,from,{x:800,y:200},[])).toBe(false);
  });
  it.each(['mine','cave'] as const)('starts %s boss telegraph via simulation and restores its intent',id=>{
    const seed=42,sim=new GameSimulation(seed);
    const entrance=planActIDungeonEntrances(buildWilderness(seed)).find(e=>e.id===id)!;
    const initial=sim.snapshot();
    expect(sim.restore({...initial,player:{...initial.player,...entrance.position}})).toBe(true);
    sim.command({type:'usePortal',dungeonId:id});
    const internal=sim as unknown as {units:EnemyUnit[];defeatEnemy:(u:EnemyUnit)=>void;updateEnemyAI:(u:EnemyUnit,dt:number)=>void};
    for(const unit of [...internal.units])internal.defeatEnemy(unit);
    for(let i=0;i<40&&sim.snapshot().dungeonStage===0;i++)sim.advance(100);
    expect(sim.snapshot().dungeonStage).toBe(1);
    const stage=sim.snapshot(),boss=stage.enemies[0]!;
    const interior=buildActIDungeonInterior(seed,id);
    const playerPoint=[40,-40,60,-60].flatMap(dx=>[0,40,-40].map(dy=>({x:boss.actor.x+dx,y:boss.actor.y+dy})))
      .find(p=>movementSegmentClear(boss.actor,p,interior.obstacles))!;
    expect(playerPoint).toBeDefined();
    expect(sim.restore({...stage,player:{...stage.player,...playerPoint}})).toBe(true);
    const live=internal.units[0]!;
    live.intent=null;live.cooldown=0;live.abilityCooldowns={};
    internal.updateEnemyAI(live,0.05);
    const action=optionalDungeonBossAction(id,1,live.actor.id)!;
    expect(live.intent).toMatchObject({abilityId:action.id,pattern:action.attack,total:action.windup});
    expect(live.abilityCooldowns?.[action.id]).toBe(action.cooldown);
    expect(sim.restore(sim.snapshot())).toBe(true);
    expect(sim.snapshot().hollowKing).toBeNull();
  },30000);
});
