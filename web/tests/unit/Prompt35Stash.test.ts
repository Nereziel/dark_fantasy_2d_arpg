import { describe, expect, it } from 'vitest';
import { createEquipment, rollItemForBase, SeededRng, type Item } from '../../src/game/data/items';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';
import {
  STASH_SIZE, STASH_TAB_COUNT, emptyStashTabs, validateStashContents,
  planStashDeposit, planStashWithdraw, planStashMove, planStashSort, projectStashItems
} from '../../src/game/inventory/stashRules';

function item(id: string, type = 'belt', level = 25, rarity: 'RARE' | 'COMMON' = 'RARE'): Item {
  return rollItemForBase(type, id, level, rarity, new SeededRng(39))!;
}
function initial() {
  const inventory: Array<Item | null> = Array(24).fill(null);
  inventory[0] = item('unique-belt');
  inventory[1] = item('unique-sword','broadsword');
  const stash: Array<Item | null> = Array(STASH_SIZE).fill(null);
  return { inventory, equipment: createEquipment(), stash, stashTabs: emptyStashTabs(), flags: {} };
}
describe('Prompt 35 — multi-tab stash pure rules', () => {
  it('retains the legacy first 24 slots and adds two independent 24-slot tabs', () => {
    expect(STASH_SIZE).toBe(24);
    expect(STASH_TAB_COUNT).toBe(3);
    const tabs = emptyStashTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs.every(tab => tab.length === 24 && tab.every(x => x === null))).toBe(true);
    expect(validateStashContents(initial())).toBe(true);
    expect(validateStashContents({ ...initial(), stashTabs: undefined })).toBe(true);
    expect(validateStashContents({ ...initial(), stashTabs: [] })).toBe(false);
    expect(validateStashContents({ ...initial(), stashTabs: [Array(24).fill(null)] })).toBe(false);
    expect(validateStashContents({ ...initial(), stashTabs: [Array(25).fill(null), Array(24).fill(null)] })).toBe(false);
    expect(validateStashContents({ ...initial(), stashTabs: [Array(24).fill(null), Array(24).fill(null), Array(24).fill(null)] })).toBe(false);
  });
  it('uses original indices, preserves item IDs and makes atomic transfers to any tab', () => {
    const state = initial();
    const deposited = planStashDeposit(state, 0, 2);
    expect(deposited.ok).toBe(true);
    if (!deposited.ok) return;
    expect(deposited.state.stashTabs?.[1]?.[0]?.id).toBe('unique-belt');
    expect(deposited.state.inventory[0]).toBeNull();
    expect(state.inventory[0]?.id).toBe('unique-belt');
    expect(state.stashTabs[1][0]).toBeNull();
    expect(validateStashContents(deposited.state)).toBe(true);
    const moved = planStashMove(deposited.state, 2, 0, 1);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.state.stashTabs?.[0]?.[0]?.id).toBe('unique-belt');
    const withdrawn = planStashWithdraw(moved.state, 0, 1);
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) return;
    expect(withdrawn.state.inventory[0]?.id).toBe('unique-belt');
    expect(withdrawn.state.stashTabs?.[0]?.[0]).toBeNull();
    expect(planStashWithdraw(withdrawn.state,0,1).ok).toBe(false);
    expect(state.stashTabs[0][0]).toBeNull();
  });
  it('rejects bad indices, full tabs, duplicate IDs and protected items without mutation', () => {
    const state = initial();
    for (const tab of [-1, 3, Infinity, NaN, 1.2, '__proto__']) {
      expect(planStashDeposit(state,0,tab as number).ok).toBe(false);
      expect(planStashWithdraw(state,0,tab as number).ok).toBe(false);
      expect(planStashSort(state,tab as number).ok).toBe(false);
    }
    expect(planStashDeposit(state,0,-1).ok).toBe(false);
    expect(planStashDeposit(state,24,1).ok).toBe(false);
    expect(planStashWithdraw(state,24,1).ok).toBe(false);
    expect(planStashMove(state,0,0,0).ok).toBe(false);
    expect(planStashMove(state,0,0,3).ok).toBe(false);
    const locked = { ...state, flags: { 'unique-belt': { locked: true, favorite: false } } };
    expect(planStashDeposit(locked,0,1)).toMatchObject({ok:false,reason:'PROTECTED_ITEM'});
    const duplicate = initial();
    duplicate.stashTabs[1][0] = item('unique-belt');
    expect(validateStashContents(duplicate)).toBe(false);
    expect(planStashDeposit(duplicate,0,1).ok).toBe(false);
    const full = initial();
    full.stashTabs[0] = Array.from({ length: 24 },(_,i)=>item('stash-'+i));
    expect(planStashDeposit(full,0,1)).toMatchObject({ok:false,reason:'STASH_FULL'});
    expect(full.inventory[0]?.id).toBe('unique-belt');
  });
  it('sorts canonical item order without losing IDs or nested gem sockets', () => {
    const state = initial();
    const high = item('high-rare','broadsword',25,'RARE');
    high.sockets = ['gem.ruby.1'];
    state.stashTabs[0][4] = item('common-belt','belt',1,'COMMON');
    state.stashTabs[0][8] = high;
    const result=planStashSort(state,1);
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    expect(result.state.stashTabs?.[0]?.[0]?.id).toBe('high-rare');
    expect(result.state.stashTabs?.[0]?.[0]?.sockets).toEqual(['gem.ruby.1']);
    expect(result.state.stashTabs?.[0]?.[1]?.id).toBe('common-belt');
    expect(result.state.stashTabs?.[0]?.slice(2).every(x=>x===null)).toBe(true);
    expect(state.stashTabs[0][8]?.id).toBe('high-rare');
  });
  it('filters and orders a read-only projection while retaining real slot indices', () => {
    const state = initial();
    state.stash[5]=item('rare-helm','helm',25,'RARE');
    state.stash[17]=item('normal-belt','belt',1,'COMMON');
    const results=projectStashItems(state.stash,{ rarity: 'RARE', query: 'helm', sort:'level' });
    expect(results.map(x=>x.index)).toEqual([5]);
    expect(results[0]?.item.id).toBe('rare-helm');
    expect(projectStashItems(state.stash,{ category:'weapon' })).toHaveLength(0);
    expect(projectStashItems(state.stash,{category:'armor'}).map(x=>x.index)).toEqual([5,17]);
    expect(projectStashItems(state.stash,{rarity:'__proto__' as 'RARE'})).toEqual([]);
    expect(state.stash[5]?.id).toBe('rare-helm');
  });
});
describe('Prompt 35 — authoritative transfer and backwards compatible character save', () => {
  it('persists all tabs within v11 without changing original first-tab stash format', () => {
    const sim=new GameSimulation(12);
    const internal=sim as unknown as { player: {x:number;y:number}; inventory: Array<Item|null> };
    internal.player.x=325; internal.player.y=502;
    internal.inventory[0]=item('save-belt');
    sim.command({type:'stashDeposit',index:0,tab:2});
    expect(sim.snapshot().stashTabs?.[1]?.[0]?.id).toBe('save-belt');
    expect(sim.character().stash).toHaveLength(24);
    expect(sim.character().stashTabs?.[1]?.[0]?.id).toBe('save-belt');
    const record=createSaveRecord(sim.character());
    expect(record?.format).toBe(11);
    const loaded=readSaveRecord(record);
    expect(loaded?.stashTabs?.[1]?.[0]?.id).toBe('save-belt');
    const restored=new GameSimulation();
    expect(restored.restoreCharacter(loaded!,12)).toBe(true);
    expect(restored.snapshot().stashTabs?.[1]?.[0]?.id).toBe('save-belt');
    expect(restored.character().stash).toHaveLength(24);
  });
  it('never trusts forged tab layouts and does not mutate on rejected restores', () => {
    const sim=new GameSimulation();
    const saved=sim.character();
    expect(sim.restoreCharacter({...saved, stashTabs:[Array(24).fill(null)]})).toBe(false);
    expect(sim.restore({...sim.snapshot(), stashTabs:[Array(24).fill(null)]})).toBe(false);
    expect(sim.character().stashTabs).toBeUndefined();
    expect(readSaveRecord(createSaveRecord(saved))?.stashTabs).toBeUndefined();
  });
});
