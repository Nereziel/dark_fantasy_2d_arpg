import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createEquipment, isItem, rollItemForBase, SeededRng } from '../../src/game/data/items';
import { deriveStats } from '../../src/game/stats/deriveStats';
import {
  GEM_BASES, GEM_IDS, isGemId, socketBonus, socketCategory
} from '../../src/game/gems/gemCatalog';
import {
  emptyGems, isValidGemWallet, quoteGemRecipe, planGemAction, type GemState
} from '../../src/game/gems/gemRules';
import { NPC_POSITIONS, BLACKSMITH_ID } from '../../src/game/world/npcs';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

function sword() {
  return rollItemForBase('greatsword', 'gem-greatsword', 25, 'RARE', new SeededRng(18))!;
}
function helmet() {
  return rollItemForBase('helm', 'gem-helm', 25, 'RARE', new SeededRng(22))!;
}
function jewel() {
  return rollItemForBase('signet', 'gem-ring', 25, 'RARE', new SeededRng(29))!;
}
function state(): GemState {
  return {
    inventory: [sword(), helmet(), jewel(), null],
    equipment: createEquipment(),
    gold: 5000,
    materials: {
      iron: 80, steel: 80, arcane_dust: 80, soul_fragment: 80,
      demon_essence: 80, ancient_crystal: 80
    },
    gems: { 'gem.ruby.1': 4, 'gem.sapphire.1': 1, 'rune.ward.1': 1 },
    flags: {}
  };
}

describe('Prompt 33 — canonical gem/rune types, tiers and effects', () => {
  it('defines six bases and three tiers without accepting prototype or forged IDs', () => {
    expect(GEM_BASES.map(def => def.id)).toEqual([
      'gem.ruby','gem.sapphire','gem.emerald','rune.ash','rune.ward','rune.focus'
    ]);
    expect(GEM_IDS).toHaveLength(18);
    for (const id of GEM_IDS) expect(isGemId(id)).toBe(true);
    for (const id of ['', '__proto__', 'gem.ruby.0', 'gem.ruby.4',
      'gem.ruby.01', 'gem.fake.1', 'rune.ward.1.extra', 'gem.ruby.1 '])
      expect(isGemId(id)).toBe(false);
    expect(emptyGems()).toEqual({});
    expect(isValidGemWallet({})).toBe(true);
    expect(isValidGemWallet({'gem.ruby.1': 3})).toBe(true);
    for (const forged of [null, [], {'gem.ruby.1': -1},
      {'gem.ruby.1': 1.25}, {'gem.ruby.1': 1000000},
      {'gem.fake.1': 5}, JSON.parse('{"__proto__":2}')])
      expect(isValidGemWallet(forged)).toBe(false);
  });

  it('projects actual category-specific effects, including newly socketable jewelry', () => {
    const weapon = sword(), armor = helmet(), ring = jewel();
    expect(weapon.sockets).toEqual([null]);
    expect(armor.sockets).toEqual([null]);
    expect(ring.sockets).toEqual([null]);
    expect(socketCategory(weapon)).toBe('weapon');
    expect(socketCategory(armor)).toBe('armor');
    expect(socketCategory(ring)).toBe('jewelry');
    expect(socketBonus('gem.ruby.2', 'weapon').damage).toBeGreaterThan(0);
    expect(socketBonus('gem.ruby.2', 'armor').fireResist).toBeGreaterThan(0);
    expect(socketBonus('gem.ruby.2', 'jewelry').resourceRegen).toBeGreaterThan(0);
    expect(socketBonus('rune.ward.3', 'armor').armor).toBeGreaterThan(0);
    expect(socketBonus('rune.focus.3', 'jewelry').maxResource).toBeGreaterThan(0);
    expect(socketBonus('__proto__', 'weapon').damage).toBe(0);
    expect(socketBonus('gem.ruby.1', 'weapon').damage)
      .toBeLessThan(socketBonus('gem.ruby.3', 'weapon').damage);
  });

  it('tightens item socket data validation and remains compatible with unfilled old sockets', () => {
    const weapon = sword();
    expect(isItem(weapon)).toBe(true);
    expect(isItem({...weapon,sockets:['gem.ruby.1']})).toBe(true);
    expect(isItem({...weapon,sockets:['rune.ward.3']})).toBe(true);
    expect(isItem({...weapon,sockets:['__proto__']})).toBe(false);
    expect(isItem({...weapon,sockets:['gem.ruby.99']})).toBe(false);
    expect(isItem({...weapon,sockets:['gem.ruby.1','gem.ruby.1']})).toBe(false);
    expect(isItem({...weapon,sockets:[]})).toBe(true);
  });
});

describe('Prompt 33 — atomic gem and rune transactions', () => {
  it('forges from materials and merges exactly 3 lower tiers into one higher tier', () => {
    const source=state();
    const quote=quoteGemRecipe('gem.ruby');
    expect(quote?.materials.iron).toBeGreaterThan(0);
    expect(quote?.gold).toBeGreaterThan(0);
    const created=planGemAction(source,{type:'forgeGem',baseId:'gem.ruby'});
    expect(created.ok).toBe(true);
    if(!created.ok)return;
    expect(created.state.gems['gem.ruby.1']).toBe(5);
    expect(created.state.gold).toBeLessThan(source.gold);
    expect(created.state.materials.iron).toBeLessThan(source.materials.iron);
    expect(source.gems['gem.ruby.1']).toBe(4);
    const merged=planGemAction(created.state,{type:'upgradeGem',gemId:'gem.ruby.1'});
    expect(merged.ok).toBe(true);
    if(!merged.ok)return;
    expect(merged.state.gems['gem.ruby.1']).toBe(2);
    expect(merged.state.gems['gem.ruby.2']).toBe(1);
    expect(planGemAction(merged.state,{type:'upgradeGem',gemId:'gem.ruby.1'}).ok).toBe(false);
    expect(planGemAction(source,{type:'upgradeGem',gemId:'gem.ruby.3'}).ok).toBe(false);
    expect(planGemAction(source,{type:'forgeGem',baseId:'__proto__' as 'gem.ruby'}).ok).toBe(false);
  });

  it('fails all-or-nothing on missing ingredients, funds, wallet overflow and forged state', () => {
    const original=state();
    for (const edited of [
      {...original,gold:0},
      {...original,materials:{}},
      {...original,gems:JSON.parse('{"__proto__":1}')},
      {...original,gems:{'gem.ruby.1':10000}}
    ]) expect(planGemAction(edited,{type:'forgeGem',baseId:'gem.ruby'}).ok).toBe(false);
    const forged=planGemAction(original,{type:'forgeGem',baseId:'gem.ruby'});
    expect(original.inventory[0]?.sockets).toEqual([null]);
    expect(original.gold).toBe(5000);
    expect(forged.ok).toBe(true);
  });

  it('sockets and unsockets only owned empty slots and preserves item identity', () => {
    const before=state();
    const socketed=planGemAction(before,{
      type:'socketGem',location:'inventory',index:0,socketIndex:0,gemId:'gem.ruby.1'
    });
    expect(socketed.ok).toBe(true);
    if(!socketed.ok)return;
    expect(socketed.state.inventory[0]!.id).toBe(before.inventory[0]!.id);
    expect(socketed.state.inventory[0]?.sockets).toEqual(['gem.ruby.1']);
    expect(socketed.state.gems['gem.ruby.1']).toBe(3);
    expect(planGemAction(socketed.state,{
      type:'socketGem',location:'inventory',index:0,socketIndex:0,gemId:'gem.ruby.1'
    }).ok).toBe(false);
    const removed=planGemAction(socketed.state,{
      type:'unsocketGem',location:'inventory',index:0,socketIndex:0
    });
    expect(removed.ok).toBe(true);
    if(!removed.ok)return;
    expect(removed.state.inventory[0]!.sockets).toEqual([null]);
    expect(removed.state.gems['gem.ruby.1']).toBe(4);
    expect(before.inventory[0]!.sockets).toEqual([null]);
    expect(removed.state.gold).toBeLessThan(socketed.state.gold);
  });

  it('blocks protected items, wrong indices, duplicate IDs, invalid wallet and fake slot',()=>{
    const source=state();
    const action={type:'socketGem' as const,location:'inventory' as const,
      index:0,socketIndex:0,gemId:'gem.ruby.1' as const};
    for(const bad of [
      {...source,flags:{'gem-greatsword':{locked:true,favorite:false}}},
      {...source,flags:{'gem-greatsword':{locked:false,favorite:true}}},
      {...source,gems:{'gem.ruby.1':-1}},
      {...source,inventory:[sword(),sword()]}
    ]) expect(planGemAction(bad,action).ok).toBe(false);
    for(const invalid of [
      {...action,index:99}, {...action,socketIndex:3},
      {...action,gemId:'gem.fake.1' as 'gem.ruby.1'},
      {...action,location:'stash' as 'inventory'},
      {...action,index:-1}
    ])expect(planGemAction(source,invalid).ok).toBe(false);
    expect(planGemAction(source,{type:'unsocketGem',location:'inventory',
      index:0,socketIndex:0}).ok).toBe(false);
  });

  it('also supports equipped gear and affects live derived stats by equipment category',()=>{
    const source=state();
    const equipped={...source,inventory:[null,...source.inventory.slice(1)],
      equipment:{...source.equipment,MAIN_HAND:source.inventory[0]}};
    const before=deriveStats('WARRIOR',equipped.equipment,25);
    const upgraded=planGemAction(equipped,{type:'socketGem',location:'equipment',
      slot:'MAIN_HAND',socketIndex:0,gemId:'gem.ruby.1'});
    expect(upgraded.ok).toBe(true);
    if(!upgraded.ok)return;
    expect(upgraded.state.equipment.MAIN_HAND?.sockets).toEqual(['gem.ruby.1']);
    const after=deriveStats('WARRIOR',upgraded.state.equipment,25);
    expect(after.damageMin).toBeGreaterThan(before.damageMin);
    expect(after.damageMax).toBeGreaterThan(before.damageMax);
    expect(upgraded.state.equipment.MAIN_HAND?.minDmg).toBe(before.damageMin - before.damageMin + sword().minDmg);
    expect(planGemAction(source,{type:'socketGem',location:'equipment',
      slot:'FAKE' as 'MAIN_HAND',socketIndex:0,gemId:'gem.ruby.1'}).ok).toBe(false);
    const helmBefore=deriveStats('WARRIOR',{...source.equipment,HELMET:helmet()},25);
    const helmAfter=deriveStats('WARRIOR',{...source.equipment,HELMET:{
      ...helmet(),sockets:['gem.ruby.2']
    }},25);
    expect(helmAfter.fireResist).toBeGreaterThan(helmBefore.fireResist);
    const ringBefore=deriveStats('WARRIOR',{...source.equipment,RING_1:jewel()},25);
    const ringAfter=deriveStats('WARRIOR',{...source.equipment,RING_1:{
      ...jewel(),sockets:['gem.ruby.2']
    }},25);
    expect(ringAfter.resourceRegen).toBeGreaterThan(ringBefore.resourceRegen);
  });
});

function nearSmith(): GameSimulation {
  const sim=new GameSimulation(42);
  const state=sim.snapshot();
  const inventory=[...state.inventory];
  inventory[0]=sword();
  const candidate={...state,level:25,xp:0,skillPoints:24,talentPoints:5,
    inventory,gold:5000,materials:{iron:10,steel:10,arcane_dust:10},
    gems:{'gem.ruby.1':2},player:{...state.player,
      ...NPC_POSITIONS[BLACKSMITH_ID]}};
  expect(sim.restore(candidate)).toBe(true);
  return sim;
}

describe('Prompt 33 — GameSimulation, save v11 and smith UI commands',()=>{
  it('creates, upgrades, sockets and persists the wallet/item into existing v11 save',()=>{
    const sim=nearSmith();
    const initial=sim.snapshot();
    sim.command({type:'forgeGem',baseId:'gem.ruby'});
    expect(sim.snapshot().gems?.['gem.ruby.1']).toBe(3);
    sim.command({type:'upgradeGem',gemId:'gem.ruby.1'});
    expect(sim.snapshot().gems?.['gem.ruby.2']).toBe(1);
    sim.command({type:'socketGem',location:'inventory',index:0,
      socketIndex:0,gemId:'gem.ruby.2'});
    const after=sim.snapshot();
    expect(after.inventory[0]?.sockets).toEqual(['gem.ruby.2']);
    expect(after.gems?.['gem.ruby.2']).toBeUndefined();
    expect(after.gold).toBeLessThan(initial.gold);
    const saved=createSaveRecord(sim.character())!;
    expect(saved.format).toBe(11);
    const restored=readSaveRecord(saved)!;
    expect(restored.gems).toEqual(sim.character().gems);
    expect(restored.inventory[0]?.sockets).toEqual(['gem.ruby.2']);
    const loaded=new GameSimulation(42);
    expect(loaded.restoreCharacter(restored,42)).toBe(true);
    expect(loaded.snapshot().inventory[0]?.sockets).toEqual(['gem.ruby.2']);
    expect(loaded.snapshot().gems).toEqual(after.gems);
    expect(readSaveRecord({...saved,character:{...saved.character,
      gems:JSON.parse('{"__proto__":1}')}})).toBeNull();
    const legacy={...saved.character};delete legacy.gems;
    expect(readSaveRecord({...saved,character:legacy})?.gems).toBeUndefined();
  });

  it('forbids socket actions far from blacksmith, dead, and through malformed saves',()=>{
    const sim=nearSmith(),state=sim.snapshot();
    expect(sim.restore({...state,player:{...state.player,x:260,y:500}})).toBe(true);
    const before=sim.snapshot();
    sim.command({type:'socketGem',location:'inventory',index:0,
      socketIndex:0,gemId:'gem.ruby.1'});
    expect(sim.snapshot()).toEqual(before);
    expect(sim.restore(state)).toBe(true);
    (sim as unknown as {hitPlayer(n:number):void}).hitPlayer(100000);
    const dead=sim.snapshot();
    sim.command({type:'forgeGem',baseId:'gem.ruby'});
    expect(sim.snapshot()).toEqual(dead);
    expect(sim.restore({...state,gems:{'gem.unknown.1':12} as never})).toBe(false);
    expect(sim.snapshot()).toEqual(dead);
  });
});
