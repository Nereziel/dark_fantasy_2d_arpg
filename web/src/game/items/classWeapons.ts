// GPL-3.0-only — shared class weapon identity and deterministic loot adaptation.
import {isClassId,type ClassId} from '../data/classes';
import {ITEM_BASES,WEAPON_TYPES,type CatalogTemplateId,type WeaponType} from './itemCatalog';

const caster=Object.freeze(['STAFF','WAND','SPELLBOOK'] as const);
export const CLASS_WEAPONS:Readonly<Record<ClassId,readonly WeaponType[]>>=Object.freeze({
  WARRIOR:Object.freeze(['SWORD','AXE','MACE','SPEAR','GREATSWORD','GREATAXE','HAMMER','SHIELD'] as const),
  PALADIN:Object.freeze(['SWORD','MACE','SPEAR','GREATSWORD','HAMMER','SHIELD'] as const),
  ROGUE:Object.freeze(['SWORD','DAGGER','BOW','CROSSBOW'] as const),
  MAGE:caster,NECROMANCER:caster,WARLOCK:caster
});
export function classCanUseBase(classId:ClassId,templateId:string):boolean{
  if(!isClassId(classId)||!Object.hasOwn(ITEM_BASES,templateId))return false;
  const type=ITEM_BASES[templateId as CatalogTemplateId].weaponType;
  return type===null||CLASS_WEAPONS[classId].includes(type);
}
/** Remap only freshly generated random/guaranteed rewards. Explicit shop
 * offers, legacy possessions and crafting inputs are not silently replaced.
 * Preserve the selected roll, rarity, item level and number of RNG draws. */
export function classLootBase(classId:ClassId,source:CatalogTemplateId,level:number):CatalogTemplateId{
  if(!isClassId(classId)||!Object.hasOwn(ITEM_BASES,source))return source;
  if(classCanUseBase(classId,source))return source;
  const base=ITEM_BASES[source],type=base.weaponType!;
  const twoHanded=WEAPON_TYPES[type].twoHanded;
  let choices:readonly CatalogTemplateId[];
  if(base.category==='offhand'){
    choices=classId==='WARRIOR'||classId==='PALADIN'?['shield','belt']
      :classId==='ROGUE'?['belt']:['spellbook','belt'];
  }else if(classId==='WARRIOR'){
    choices=twoHanded?['greataxe','greatsword','spear','axe']:['broadsword','axe'];
  }else if(classId==='PALADIN'){
    choices=twoHanded?['hammer','greatsword','spear','mace']:['mace','broadsword'];
  }else if(classId==='ROGUE'){
    choices=twoHanded?['crossbow','bow','dagger']:['dagger','broadsword'];
  }else{
    choices=twoHanded?['staff','wand']:['wand'];
  }
  return choices.find(id=>classCanUseBase(classId,id)&&ITEM_BASES[id].requiredLevel<=level)??'belt';
}
