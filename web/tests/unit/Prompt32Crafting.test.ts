import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createShopItem, getOffer } from '../../src/game/trade/commerce';
import { rollItemForBase, SeededRng } from '../../src/game/data/items';
import { ITEM_BASES } from '../../src/game/items/itemCatalog';
import {
  CRAFT_RECIPES, MATERIAL_IDS, emptyMaterials, validateMaterials,
  quoteCraft, planCraft, type CraftKind
} from '../../src/game/crafting/craftingRules';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';
import { NPC_POSITIONS, BLACKSMITH_ID } from '../../src/game/world/npcs';

function weapon() {
  return createShopItem(getOffer('broadsword')!, 'smith-test-sword');
}
function baggedSim(): GameSimulation {
  const sim = new GameSimulation(2);
  const first = sim.snapshot();
  const inventory = [...first.inventory];
  inventory[0] = weapon();
  const moved = {...first, player:{...first.player,...NPC_POSITIONS[BLACKSMITH_ID]},
    inventory, gold:5000,
    materials:{iron:50,steel:50,arcane_dust:50,soul_fragment:50,
      demon_essence:50,ancient_crystal:50}};
  expect(sim.restore(moved)).toBe(true);
  return sim;
}

describe('Prompt 32 pure crafting', () => {
  it('has six stable types, data-defined services, strict wallets and no prototype injection',()=>{
    expect(MATERIAL_IDS).toEqual([
      'iron','steel','arcane_dust','soul_fragment','demon_essence','ancient_crystal'
    ]);
    expect(Object.keys(CRAFT_RECIPES)).toEqual([
      'salvage','upgrade','reroll','enchant','socket'
    ]);
    expect(validateMaterials({})).toBe(true);
    expect(validateMaterials({iron:0,steel:10})).toBe(true);
    for (const wallet of [
      {iron:-1},{iron:1.3},{iron:1e12},{evil:1},
      JSON.parse('{"__proto__":1}'), null, ['iron']
    ]) expect(validateMaterials(wallet)).toBe(false);
    expect(emptyMaterials()).toEqual({});
  });

  it('salvages exactly once, generates deterministic returns and never grants gold',()=>{
    const item=weapon();
    const before={inventory:[item,null],materials:emptyMaterials(),gold:70,flags:{}};
    const plan=planCraft(before,{kind:'salvage',index:0});
    expect(plan.ok).toBe(true);
    if(!plan.ok) return;
    expect(plan.inventory[0]).toBeNull();
    expect(plan.gold).toBe(70);
    expect(plan.materials.iron).toBeGreaterThan(0);
    expect(planCraft(before,{kind:'salvage',index:0})).toEqual(plan);
    expect(planCraft({
      inventory:plan.inventory,materials:plan.materials,gold:plan.gold,flags:{}
    },{kind:'salvage',index:0}).ok).toBe(false);
    expect(before.inventory[0]).toEqual(item);
    expect(before.materials).toEqual({});
  });

  it('blocks favorite/locked and gem-filled items, malformed indexes, empty slots and fake recipes',()=>{
    const base={inventory:[weapon(),null],materials:{},gold:50,flags:{}};
    for (const type of ['salvage','upgrade','reroll','enchant','socket'] as CraftKind[]) {
      expect(planCraft({...base,flags:{'smith-test-sword':{locked:true,favorite:false}}},
        {kind:type,index:0}).ok).toBe(false);
      expect(planCraft({...base,flags:{'smith-test-sword':{locked:false,favorite:true}}},
        {kind:type,index:0}).ok).toBe(false);
      expect(planCraft(base,{kind:type,index:99}).ok).toBe(false);
      expect(planCraft(base,{kind:type,index:1}).ok).toBe(false);
    }
    expect(planCraft(base,{kind:'__proto__' as CraftKind,index:0}).ok).toBe(false);
    expect(planCraft({...base,materials:{iron:NaN}},{kind:'salvage',index:0}).ok).toBe(false);
    const gemmed={...weapon(),sockets:['gem-rare']};
    expect(planCraft({...base,inventory:[gemmed]}, {kind:'salvage',index:0}).ok).toBe(false);
  });

  it('upgrades using atomic gold/material costs with a firm upgrade cap',()=>{
    const item=weapon();
    const quote=quoteCraft('upgrade',item);
    expect(quote?.materials.iron).toBeGreaterThan(0);
    expect(quote?.gold).toBeGreaterThan(0);
    const rich={inventory:[item],gold:10000,
      materials:{iron:100,steel:100},flags:{}};
    expect(planCraft({...rich,gold:0},{kind:'upgrade',index:0}).ok).toBe(false);
    expect(planCraft({...rich,materials:{iron:0,steel:100}},
      {kind:'upgrade',index:0}).ok).toBe(false);
    let state=rich;
    for(let i=0;i<3;i++){
      const applied=planCraft(state,{kind:'upgrade',index:0});
      expect(applied.ok).toBe(true);
      if(!applied.ok) return;
      expect(applied.inventory[0]?.upgrades).toBe(i+1);
      expect(applied.inventory[0]!.maxDmg).toBeGreaterThan(item.maxDmg);
      state={inventory:applied.inventory as typeof rich.inventory,
        gold:applied.gold,materials:applied.materials,flags:{}};
    }
    expect(planCraft(state,{kind:'upgrade',index:0}).ok).toBe(false);
  });

  it('rerolls one real affix, enchants within rarity cap, opens only empty socket capacity',()=>{
    const rare=rollItemForBase('greatsword','craft-rare',25,'RARE',new SeededRng(123))!;
    expect(rare.affixes.length).toBeGreaterThan(0);
    const base={inventory:[rare],gold:10000,materials:{
      iron:100,steel:100,arcane_dust:100,soul_fragment:100,
      demon_essence:100,ancient_crystal:100
    },flags:{}};
    const reroll=planCraft(base,{kind:'reroll',index:0,affixIndex:0});
    expect(reroll.ok).toBe(true);
    if(!reroll.ok) return;
    expect(reroll.inventory[0]!.affixes[0]).not.toEqual(rare.affixes[0]);
    expect(reroll.inventory[0]!.affixes.length).toBe(rare.affixes.length);
    expect(planCraft(base,{kind:'reroll',index:0,affixIndex:99}).ok).toBe(false);
    const ench=planCraft({...base,inventory:reroll.inventory},
      {kind:'enchant',index:0});
    expect(ench.ok).toBe(true);
    if(!ench.ok) return;
    expect(ench.inventory[0]?.affixes.length).toBe(rare.affixes.length+1);
    const socket=planCraft({...base,inventory:ench.inventory},
      {kind:'socket',index:0});
    expect(socket.ok).toBe(true);
    if(!socket.ok) return;
    expect(socket.inventory[0]?.sockets?.at(-1)).toBeNull();
    expect(socket.inventory[0]?.sockets?.length).toBeLessThanOrEqual(
      ITEM_BASES.greatsword.maxSockets
    );
  });
});

describe('Prompt 32 authoritative progression / persistence',()=>{
  it('processes blacksmith commands and persists material wallet as optional v11 field',()=>{
    const sim=baggedSim();
    const initial=sim.snapshot();
    sim.command({type:'craft',kind:'upgrade',index:0});
    const upgraded=sim.snapshot();
    expect(upgraded.inventory[0]!.upgrades).toBe(1);
    expect(upgraded.gold).toBeLessThan(initial.gold);
    expect(upgraded.materials?.iron).toBeLessThan(initial.materials!.iron!);
    sim.command({type:'craft',kind:'salvage',index:0});
    expect(sim.snapshot().inventory[0]).toBeNull();
    expect(sim.snapshot().materials?.iron).toBeGreaterThan(0);
    const character=sim.character();
    const save=createSaveRecord(character)!;
    expect(save.format).toBe(11);
    expect(readSaveRecord(save)?.materials).toEqual(character.materials);
    const loaded=new GameSimulation(2);
    expect(loaded.restoreCharacter(character,2)).toBe(true);
    expect(loaded.snapshot().materials).toEqual(character.materials);
    expect(readSaveRecord({...save, character:{...character,
      materials:JSON.parse('{"__proto__":1000}')}})).toBeNull();
    const legacy={...character};delete legacy.materials;
    expect(readSaveRecord({...save,character:legacy})?.materials).toBeUndefined();
  });

  it('rejects crafting away from smith or while dead and never lets inventory/gold go negative',()=>{
    const sim=baggedSim();
    const state=sim.snapshot();
    expect(sim.restore({...state,player:{...state.player,x:260,y:500}})).toBe(true);
    const before=sim.snapshot();
    sim.command({type:'craft',kind:'salvage',index:0});
    expect(sim.snapshot()).toEqual(before);
    expect(sim.restore(state)).toBe(true);
    (sim as unknown as {hitPlayer(n:number):void}).hitPlayer(100000);
    const dead=sim.snapshot();
    sim.command({type:'craft',kind:'salvage',index:0});
    expect(sim.snapshot()).toEqual(dead);
    expect(sim.restore({...state,gold:-1})).toBe(false);
  });
});
