// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { villageTownEntries, resolveRegionalTownEntry, canReachRegionalTownEntry } from '../../src/game/world/villageDialogue';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { GameSimulation } from '../../src/game/core/GameSimulation';
describe('Issue #208 B2: village dialogue',()=>{
  it('resolves only actual residents, with the same manifest in every consumer',()=>{
    let count=0;
    for(const seed of [0,1,123,0xffffffff]){
      const world=buildWilderness(seed),entries=villageTownEntries(world.villages);
      count+=entries.length;
      expect(entries.length).toBe((world.villages??[]).flatMap(v=>v.residents).length);
      for(const entry of entries){
        expect(resolveRegionalTownEntry(entry.id,entries)).toEqual(entry);
        expect(canReachRegionalTownEntry(entry.position,entry,world.layout.obstacles)).toBe(true);
        expect(canReachRegionalTownEntry(world.layout.camp,entry,world.layout.obstacles)).toBe(false);
      }
      expect(resolveRegionalTownEntry('north-village-healer',[])).toBeNull();
      expect(resolveRegionalTownEntry('__proto__',entries)).toBeNull();
      expect(resolveRegionalTownEntry('healer_iva',entries)?.role).toBe('healer');
    }
    expect(count).toBeGreaterThan(0);
  });
  it('does not grant a distant or forged village interaction or service',()=>{
    const sim=new GameSimulation(0);
    sim.drainEvents();
    const before=sim.snapshot();
    sim.command({type:'useTownService',entryId:'north-village-healer'});
    sim.command({type:'interactTown',entryId:'forged-healer'});
    expect(sim.snapshot().gold).toBe(before.gold);
    expect(sim.drainEvents().some(e=>e.type==='townInteraction'||e.type==='townServiceUsed')).toBe(false);
  });
});
