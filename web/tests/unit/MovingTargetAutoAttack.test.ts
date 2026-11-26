import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import type { EnemyUnit } from '../../src/game/enemies/enemies';
import type { Point } from '../../src/game/core/types';
import type { Obstacle } from '../../src/game/world/navigation';

function setup(classId:'WARRIOR'|'PALADIN'|'ROGUE',distance=100,retreatSpeed=150){
  const sim=new GameSimulation(42);
  sim.command({type:'reset',classId,seed:42});
  // Controlled moving target: exercise the real fixed-step attack loop
  // independently of AI leash/patrol changes and procedural scenery.
  const runtime=sim as unknown as {player:Point;units:EnemyUnit[];
    world:{obstacles:readonly Obstacle[]};updateEnemyAI:(unit:EnemyUnit,dt:number)=>void};
  runtime.world={...runtime.world,obstacles:[]};
  runtime.player.x=650;runtime.player.y=700;
  const target=runtime.units.find(u=>u.actor.alive)!;
  target.actor.x=650+distance;target.actor.y=700;
  runtime.updateEnemyAI=(unit,dt)=>{if(unit===target)unit.actor.x+=retreatSpeed*dt;};
  sim.drainEvents();
  return {sim,runtime,target};
}
describe('melee auto-attack versus a moving target',()=>{
  it.each(['WARRIOR','PALADIN','ROGUE'] as const)('catches and damages a continuously retreating enemy with %s',classId=>{
    const {sim,target}=setup(classId);
    sim.command({type:'attack',targetId:target.actor.id});
    let hit=false;
    for(let tick=0;tick<240;tick++){
      sim.advance(16.667);
      if(sim.drainEvents().some(e=>e.type==='damageResolved'&&e.sourceId==='hero'&&e.targetId===target.actor.id&&e.damage>0)){hit=true;break;}
    }
    expect(hit).toBe(true);
  });
  it('does not step forward when the player holds position',()=>{
    const {sim,runtime,target}=setup('PALADIN',75);
    const start={...runtime.player};
    sim.command({type:'holdPosition',value:true});
    sim.command({type:'attack',targetId:target.actor.id});
    for(let i=0;i<30;i++)sim.advance(16.667);
    expect(runtime.player.x).toBe(start.x);
    expect(runtime.player.y).toBe(start.y);
  });
  it('does not land an auto swing through a wall introduced during windup',()=>{
    const {sim,runtime,target}=setup('WARRIOR',58,0);
    sim.command({type:'attack',targetId:target.actor.id});
    sim.advance(16.667);
    expect(sim.snapshot().warriorAction?.id).toBe('basicAttack');
    runtime.world={...runtime.world,obstacles:[{id:'wall',x:676,y:650,width:8,height:100}]};
    const hp=target.actor.health;
    for(let i=0;i<12;i++)sim.advance(16.667);
    expect(target.actor.health).toBe(hp);
  });
});
