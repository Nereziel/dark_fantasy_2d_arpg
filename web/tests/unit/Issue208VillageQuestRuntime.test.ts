// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { villageTownEntries } from '../../src/game/world/villageDialogue';
import { VILLAGE_QUESTS } from '../../src/game/quests/villageQuests';
import { createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { createCampaignQuestLedger, CAMPAIGN_QUEST_CATALOG } from '../../src/game/quests/campaignQuestLedger';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { freshQuest } from '../../src/game/quests/firstQuest';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

describe('Issue #208 village quest simulation',()=>{
  it('expands a valid old ledger but rejects a partial new one',()=>{
    const old=createActIQuestLedger(freshQuest())!;
    const expanded=createCampaignQuestLedger(old)!;
    expect(expanded.quests.slice(0,9)).toEqual(old.quests);
    expect(expanded.quests).toHaveLength(11);
    expect(validateQuestLedger(CAMPAIGN_QUEST_CATALOG,expanded)).toBe(true);
    expect(createCampaignQuestLedger({quests:expanded.quests.slice(0,10)})).toBeNull();
  });
  it('copies a validated reactive ledger without structured-cloning Proxy objects',()=>{
    const ledger=createCampaignQuestLedger(freshQuest())!;
    // Svelte $state wraps snapshot objects and nested arrays in Proxy.
    // Reproduce that boundary without depending on a DOM or Svelte compiler.
    const wrapped=new Proxy({quests:new Proxy(ledger.quests.map(q=>new Proxy({
      ...q,counters:new Proxy(q.counters,{}),
      processedEventIds:new Proxy(q.processedEventIds,{})
    },{})),{})},{});
    expect(()=>createCampaignQuestLedger(wrapped)).not.toThrow();
    const copy=createCampaignQuestLedger(wrapped)!;
    expect(copy).toEqual(ledger);
    expect(copy).not.toBe(wrapped);
    expect(copy.quests[0]).not.toBe(wrapped.quests[0]);
    expect(copy.quests[0]!.counters).not.toBe(wrapped.quests[0]!.counters);
    expect(()=>structuredClone(copy)).not.toThrow();
  });
  it.each(VILLAGE_QUESTS)('completes $id only by real local interactions and never rewards twice',q=>{
    const seed=42, sim=new GameSimulation(seed);
    const state=()=>sim.snapshot().questLedger!.quests.find(s=>s.questId===q.id)!;
    const entries=villageTownEntries(buildWilderness(seed).villages);
    const move=(id:string)=>{
      const entry=entries.find(n=>n.id===id)!;
      const snap=sim.snapshot();
      snap.player={...snap.player,...entry.position};
      expect(sim.restore(snap)).toBe(true);
    };
    sim.command({type:'questAccept',questId:q.id});
    expect(state().status).toBe('available');
    move(q.targetId);
    sim.command({type:'interactTown',entryId:q.targetId});
    expect(state().status).toBe('available');
    move(q.giverId);
    sim.command({type:'questAccept',questId:q.id});
    expect(state().status).toBe('active');
    sim.command({type:'interactTown',entryId:q.targetId});
    expect(state().status).toBe('active');
    move(q.targetId);
    sim.command({type:'interactTown',entryId:q.targetId});
    expect(state().status).toBe('ready');
    const gold=sim.character().gold;
    sim.command({type:'questTurnIn',questId:q.id});
    expect(sim.character().gold).toBe(gold);
    move(q.giverId);
    sim.command({type:'questTurnIn',questId:q.id});
    expect(sim.character().gold).toBe(gold+q.gold);
    expect(state().status).toBe('completed');
    const saved=readSaveRecord(createSaveRecord(sim.character(),123))!;
    const other=new GameSimulation(99);
    expect(other.restoreCharacter(saved,99)).toBe(true);
    const otherGiver=villageTownEntries(buildWilderness(99).villages).find(n=>n.id===q.giverId)!;
    const snap=other.snapshot();
    snap.player={...snap.player,...otherGiver.position};
    expect(other.restore(snap)).toBe(true);
    other.command({type:'questTurnIn',questId:q.id});
    expect(other.character().gold).toBe(gold+q.gold);
    expect(other.character().questLedger!.quests.find(s=>s.questId===q.id)?.rewardClaimed).toBe(true);
  },30000);
});
