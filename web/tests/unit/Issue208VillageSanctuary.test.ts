// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { ENEMY_DEFINITIONS } from '../../src/game/enemies/enemies';
import { ACTOR_RADIUS, canOccupy } from '../../src/game/world/navigation';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { villageSanctuaries, inVillageSanctuary } from '../../src/game/world/villageSanctuary';

describe('Issue #208 B2: village sanctuaries',()=>{
  it('derives protection only from populated settlements in the wilderness',()=>{
    let count=0;
    for(const seed of [0,1,123,0xffffffff]){
      const world=buildWilderness(seed);
      const zones=villageSanctuaries(world);
      expect(zones.map(z=>z.id)).toEqual((world.villages??[]).map(v=>v.id));
      count+=zones.length;
      for(const z of zones){
        expect(inVillageSanctuary('wilderness',z.center,zones)).toBe(true);
        expect(inVillageSanctuary('crypt',z.center,zones)).toBe(false);
        expect(inVillageSanctuary('wilderness',z.center,[])).toBe(false);
      }
      expect(inVillageSanctuary('wilderness',world.layout.camp,zones)).toBe(false);
    }
    expect(count).toBeGreaterThan(0);
  });
  it('cancels hostile intent and an already flying projectile when the hero retreats to a village',()=>{
    const world=[0,1,123,0xffffffff].map(buildWilderness).find(w=>villageSanctuaries(w).length)!;
    expect(world).toBeDefined();
    const zone=villageSanctuaries(world)[0]!;
    const sim=new GameSimulation(world.layout.seed),s=sim.snapshot();
    const village=world.villages!.find(v=>v.id===zone.id)!;
    const position=village.residents.map(n=>n.position).find(p=>
      inVillageSanctuary('wilderness',p,[zone])&&canOccupy(p,ACTOR_RADIUS,world.layout.obstacles));
    expect(position).toBeDefined();
    if(!position)throw Error('No walkable point in populated sanctuary');
    s.player={...s.player,...position};
    const source=s.enemies[0]!.actor.id;
    s.enemies[0]!.intent={pattern:ENEMY_DEFINITIONS[s.enemies[0]!.actor.type].attack,...position,radius:65,remaining:.1,total:.2};
    s.projectiles=[{id:'projectile-1',sourceId:source,...position,target:{...position},
      type:'shadow',speed:560,radius:65,remaining:1,base:500}];
    expect(sim.restore(s)).toBe(true);
    sim.drainEvents();
    for(let i=0;i<30;i++)sim.advance(16.667);
    expect(sim.snapshot().player.health).toBe(s.player.health);
    expect(sim.snapshot().player.alive).toBe(true);
    expect(sim.snapshot().enemies[0]!.intent).toBeNull();
    expect(sim.snapshot().projectiles).toHaveLength(0);
    expect(sim.drainEvents().some(e=>e.type==='hit'&&e.targetId===s.player.id)).toBe(false);
  });
});
