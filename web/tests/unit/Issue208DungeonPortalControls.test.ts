// GPL-3.0-only
import {describe,expect,it} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {planActIDungeonEntrances,buildActIDungeonInterior} from '../../src/game/world/actIDungeonEntrances';
import {dungeonPortalTargets, dungeonPortalCommand, dungeonRenderSeed} from '../../src/game/world/dungeonPortalPresentation';
import {CRYPT_GATE} from '../../src/game/world/generator';
import {ACTOR_RADIUS,findPath,canOccupy} from '../../src/game/world/navigation';

describe('Issue #208 C2.3 shared dungeon portal controls',()=>{
  it('exposes identical entrance identities, exact positions and interior geometry seed to both renderers',()=>{
    const seed=42,world=buildWilderness(seed),sim=new GameSimulation(seed);
    const targets=dungeonPortalTargets(sim.snapshot(),planActIDungeonEntrances(world));
    expect(targets.map(t=>t.id)).toEqual(['crypt-portal','dungeon-portal:mine','dungeon-portal:cave']);
    expect(targets[0]!.position).toEqual(CRYPT_GATE);
    for(const t of targets.slice(1)){
      const id:'mine'|'cave'=t.id==='dungeon-portal:mine'?'mine':'cave';
      expect(dungeonPortalCommand(t.id)).toEqual({type:'usePortal',dungeonId:id});
      expect(t.position).toEqual(planActIDungeonEntrances(world).find(e=>e.id===id)!.position);
      const snapshot={...sim.snapshot(),zone:'crypt' as const,dungeonId:id} as const;
      expect(dungeonRenderSeed(snapshot)).toBe(buildActIDungeonInterior(seed,id).seed);
      expect(dungeonPortalTargets(snapshot,[])).toHaveLength(1);
      expect(dungeonPortalTargets(snapshot,[])[0]!.position).toEqual(buildActIDungeonInterior(seed,id).exitPosition);
    }
    expect(dungeonPortalCommand('forged')).toBeNull();
  });
  it.each(['mine','cave'] as const)('approaches %s from outside interaction range, and move cancels approach',id=>{
    const seed=42,world=buildWilderness(seed),sim=new GameSimulation(seed);
    const entry=planActIDungeonEntrances(world).find(e=>e.id===id)!;
    const start=[{x:entry.position.x+130,y:entry.position.y},{x:entry.position.x-130,y:entry.position.y},
      {x:entry.position.x,y:entry.position.y+130},{x:entry.position.x,y:entry.position.y-130}]
      .find(p=>canOccupy(p,ACTOR_RADIUS,world.layout.obstacles)&&findPath(p,entry.position,ACTOR_RADIUS,world.layout.obstacles).length>0)!;
    expect(start).toBeDefined();
    const initial=sim.snapshot();
    // Keep actual simulation movement and geometry, avoid unrelated combat during path test.
    expect(sim.restore({...initial,player:{...initial.player,...start}})).toBe(true);
    sim.command({type:'usePortal',dungeonId:id});
    expect(sim.snapshot().zone).toBe('wilderness');
    sim.command({type:'move',destination:start});
    for(let i=0;i<10;i++)sim.advance(100);
    expect(sim.snapshot().zone).toBe('wilderness');
    expect(sim.restore({...initial,player:{...initial.player,...start}})).toBe(true);
    sim.command({type:'usePortal',dungeonId:id});
    for(let i=0;i<120&&sim.snapshot().zone==='wilderness';i++)sim.advance(100);
    expect(sim.snapshot().dungeonId).toBe(id);
    expect(sim.snapshot().zone).toBe('crypt');
  },30000);
});
