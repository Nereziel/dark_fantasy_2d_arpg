// GPL-3.0-only — class-aware drops preserve rarity and reward counts.
import {describe,it,expect} from 'vitest';
import {CLASS_IDS} from '../../src/game/data/classes';
import {createStarterEquipment} from '../../src/game/creation/characterCreation';
import {ITEM_BASES,type CatalogTemplateId} from '../../src/game/items/itemCatalog';
import {classCanUseBase,classLootBase} from '../../src/game/items/classWeapons';
import {SeededRng,rollItem} from '../../src/game/data/items';
import {eligibleLootEntries,bossGuaranteedLoot,rollLootTable,type LootContext} from '../../src/game/loot/lootTables';

describe('class-relevant weapon drops',()=>{
  it('keeps every starter loadout compatible and universal gear unchanged',()=>{
    for(const id of CLASS_IDS){
      for(const item of Object.values(createStarterEquipment(id)))if(item)expect(classCanUseBase(id,item.templateId)).toBe(true);
      for(const [key,base] of Object.entries(ITEM_BASES))if(!base.weaponType)expect(classLootBase(id,key as CatalogTemplateId,1)).toBe(key);
    }
    expect(classCanUseBase('WARRIOR','wand')).toBe(false);
    expect(classCanUseBase('WARRIOR','bow')).toBe(false);
    expect(classCanUseBase('WARRIOR','greataxe')).toBe(true);
    expect(classCanUseBase('ROGUE','crossbow')).toBe(true);
    expect(classCanUseBase('MAGE','spellbook')).toBe(true);
    expect(classCanUseBase('MAGE','broadsword')).toBe(false);
  });
  it('maps every incompatible base to legal gear without lowering its rarity or requiring extra draws',()=>{
    for(const id of CLASS_IDS)for(const level of [1,2,3,4,5,8,25,60,100]){
      for(const [key,base] of Object.entries(ITEM_BASES)){
        if(base.requiredLevel>level)continue;
        const chosen=classLootBase(id,key as CatalogTemplateId,level);
        expect(classCanUseBase(id,chosen)).toBe(true);
        expect(ITEM_BASES[chosen].requiredLevel).toBeLessThanOrEqual(level);
      }
      const ctx:LootContext={playerLevel:level,monsterLevel:level,zone:'wilderness',difficulty:'hell',isBoss:true};
      const legacy=eligibleLootEntries(ctx),smart=eligibleLootEntries({...ctx,classId:id});
      expect(smart.map(e=>[e.rarity,e.weight,e.sourceTableId])).toEqual(legacy.map(e=>[e.rarity,e.weight,e.sourceTableId]));
      expect(smart.every(e=>classCanUseBase(id,e.itemBaseId))).toBe(true);
      const guaranteed=bossGuaranteedLoot({...ctx,classId:id});
      expect(guaranteed.map(e=>[e.rarity,e.itemLevel,e.guaranteed])).toEqual(bossGuaranteedLoot(ctx).map(e=>[e.rarity,e.itemLevel,e.guaranteed]));
      expect(guaranteed.every(e=>classCanUseBase(id,e.itemBaseId))).toBe(true);
      let draws=0;
      const rolled=rollLootTable({...ctx,classId:id},{next(){draws++;return .73}});
      expect(draws).toBe(1);
      expect(classCanUseBase(id,rolled!.itemBaseId)).toBe(true);
      const rng=new SeededRng(42);
      for(let n=0;n<30;n++)expect(classCanUseBase(id,rollItem(n,level,rng,id).templateId)).toBe(true);
    }
  });
});
