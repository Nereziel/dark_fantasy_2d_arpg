// GPL-3.0-only
import { describe,expect,it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { planActIDungeonEntrances,buildActIDungeonInterior } from '../../src/game/world/actIDungeonEntrances';
import type { EnemyUnit } from '../../src/game/enemies/enemies';

describe('Issue #208 C2.2: optional dungeon runtime',()=>{
  it.each(['mine','cave'] as const)('enters and exits %s at the real world anchor without advancing story',id=>{
    const seed=42,sim=new GameSimulation(seed);
    const entrance=planActIDungeonEntrances(buildWilderness(seed)).find(e=>e.id===id)!;
    expect(entrance).toBeDefined();
    const initial=sim.snapshot();
    sim.command({type:'usePortal',dungeonId:id});
    expect(sim.snapshot().zone).toBe('wilderness');
    const story=initial.questLedger;
    expect(sim.restore({...initial,player:{...initial.player,...entrance.position}})).toBe(true);
    sim.command({type:'usePortal',dungeonId:id});
    const entered=sim.snapshot(),interior=buildActIDungeonInterior(seed,id);
    expect(entered.zone).toBe('crypt');
    expect(entered.dungeonId).toBe(id);
    expect(entered.worldSeed).toBe(seed);
    expect(entered.player).toMatchObject(interior.playerSpawn);
    expect(entered.questLedger).toEqual(story);
    expect(entered.cryptInteractables).toEqual([]);
    expect(sim.restore(entered)).toBe(true);
    expect(sim.restore({...entered,dungeonId:'forged'} as typeof entered)).toBe(false);
    const internals=sim as unknown as {units:EnemyUnit[];defeatEnemy:(u:EnemyUnit)=>void};
    for(const u of [...internals.units])internals.defeatEnemy(u);
    for(let i=0;i<40&&sim.snapshot().dungeonStage===0;i++)sim.advance(100);
    expect(sim.snapshot().dungeonStage).toBe(1);
    for(const u of [...internals.units])internals.defeatEnemy(u);
    sim.advance(100);
    expect(sim.snapshot().dungeonCleared).toBe(true);
    expect(sim.snapshot().questLedger).toEqual(story);
    const cleared=sim.snapshot();
    expect(sim.restore({...cleared,player:{...cleared.player,...interior.exitPosition}})).toBe(true);
    sim.command({type:'usePortal'});
    expect(sim.snapshot().zone).toBe('wilderness');
    expect(sim.snapshot().dungeonId).toBeUndefined();
    expect(sim.snapshot().player).toMatchObject(entrance.returnPosition);
    expect(sim.snapshot().worldSeed).toBe(seed);
    expect(sim.snapshot().questLedger).toEqual(story);
    expect(sim.character()).not.toHaveProperty('dungeonId');
    expect(sim.worldProgress()?.seed).toBe(seed);
  },30000);
});
