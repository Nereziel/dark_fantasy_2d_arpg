// GPL-3.0-only — Prompt 32, pure bounded blacksmith crafting transactions.
// No Phaser/UI access. No random global RNG or unvalidated item mutations.
import { isItem, type Item } from '../data/items';
import { canTemper, temperItem } from '../trade/commerce';
import { ITEM_BASES, ITEM_RARITIES } from '../items/itemCatalog';
import type { ItemFlags } from '../inventory/equipmentRules';

export const MATERIAL_IDS = [
  'iron','steel','arcane_dust','soul_fragment','demon_essence','ancient_crystal'
] as const;
export type MaterialId = typeof MATERIAL_IDS[number];
export type Materials = Partial<Record<MaterialId, number>>;
export type CraftKind = 'salvage'|'upgrade'|'reroll'|'enchant'|'socket';
export interface CraftRecipe {
  readonly kind: CraftKind;
  readonly gold: number;
  readonly materials: Readonly<Materials>;
  readonly levelGold: number;
}
export const CRAFT_RECIPES: Readonly<Record<CraftKind,CraftRecipe>> = Object.freeze({
  salvage:{kind:'salvage',gold:0,materials:{},levelGold:0},
  upgrade:{kind:'upgrade',gold:24,materials:{iron:3,steel:1},levelGold:4},
  reroll:{kind:'reroll',gold:35,materials:{arcane_dust:2,soul_fragment:1},levelGold:5},
  enchant:{kind:'enchant',gold:55,materials:{arcane_dust:3,soul_fragment:1},levelGold:5},
  socket:{kind:'socket',gold:80,materials:{steel:2,arcane_dust:2,demon_essence:1},levelGold:7}
});

const MAX_MATERIAL = 1_000_000;
const MAX_GOLD = Number.MAX_SAFE_INTEGER;
const MAX_INV = 200;
export function emptyMaterials(): Materials { return {}; }
export function validateMaterials(input: unknown): input is Materials {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) return false;
  const entries = Object.entries(input);
  return entries.length <= MATERIAL_IDS.length && entries.every(([key,qty]) =>
    (MATERIAL_IDS as readonly string[]).includes(key)
    && Number.isSafeInteger(qty) && qty >= 0 && qty <= MAX_MATERIAL);
}
export function isCraftKind(value: unknown): value is CraftKind {
  return typeof value === 'string' && Object.hasOwn(CRAFT_RECIPES,value);
}
export interface CraftRequest {
  readonly kind: CraftKind;
  readonly index: number;
  readonly affixIndex?: number;
}
export interface CraftState {
  readonly inventory: readonly (Item|null)[];
  readonly materials: Readonly<Materials>;
  readonly gold: number;
  readonly flags?: Readonly<Record<string,ItemFlags>>;
}
export type CraftFailure = 'invalid'|'missing'|'protected'|'funds'|'materials'
  |'capacity'|'maxed'|'unsafe';
export type CraftPlan = {readonly ok:true;readonly kind:CraftKind;
  readonly inventory:(Item|null)[];readonly materials:Materials;readonly gold:number;
  readonly goldSpent:number;readonly itemId:string;readonly yield:Materials}
  | {readonly ok:false;readonly reason:CraftFailure};
export interface CraftQuote {
  readonly kind:CraftKind;
  readonly gold:number;
  readonly materials:Readonly<Materials>;
  readonly yield:Readonly<Materials>;
}
const rarityIndex: Record<Item['rarity'],number> = {
  COMMON:0, UNCOMMON:1, RARE:2, EPIC:3, LEGENDARY:4, MYTHIC:5
};
const cap = (n:number):number => Math.min(MAX_MATERIAL,Math.max(0,Math.floor(n)));
function salvageYield(item:Item):Materials {
  const t = rarityIndex[item.rarity];
  const yieldMaterials:Materials = {iron:1+Math.min(6,Math.floor(item.level/12))+t};
  if(t>=1) yieldMaterials.steel = 1+Math.floor(t/2);
  if(t>=2) yieldMaterials.arcane_dust = 1+Math.floor((t-1)/2);
  if(t>=3) yieldMaterials.soul_fragment = t-2;
  if(t>=4) yieldMaterials.demon_essence = t-3;
  if(t>=5) yieldMaterials.ancient_crystal = 1;
  return yieldMaterials;
}
export function quoteCraft(kind:unknown,item:Item|null):CraftQuote|null {
  if(!isCraftKind(kind) || !item || !isItem(item)) return null;
  if(kind==='salvage'){
    // Socketed gems must be extracted by the later dedicated gem system, not destroyed.
    if(item.sockets?.some(value=>value!==null)) return null;
    return {kind,gold:0,materials:{},yield:salvageYield(item)};
  }
  if(kind==='upgrade' && !canTemper(item)) return null;
  if(kind==='reroll' && item.affixes.length===0) return null;
  if(kind==='enchant' && item.affixes.length>=ITEM_RARITIES[item.rarity].maxAffixes)
    return null;
  if(kind==='socket' && (item.sockets?.length ?? 0)
    >= ITEM_BASES[item.templateId as keyof typeof ITEM_BASES].maxSockets) return null;
  const base=CRAFT_RECIPES[kind];
  const rarity=rarityIndex[item.rarity];
  const levelCost=base.gold+item.level*base.levelGold+rarity*18;
  const multiplier=kind==='upgrade'?item.upgrades+1:1;
  return {
    kind, gold:levelCost*multiplier,
    materials:Object.fromEntries(Object.entries(base.materials)
      .map(([id,amount])=>[id,Math.max(1,amount*multiplier+Math.floor(rarity/3))])) as Materials,
    yield:{}
  };
}
const AFFINITIES = [
  {id:'stalwart',stat:'armor',kind:'prefix'},
  {id:'savage',stat:'minDmg',kind:'prefix'},
  {id:'fiery',stat:'strength',kind:'prefix'},
  {id:'brisk',stat:'moveSpeed',kind:'prefix'},
  {id:'vampiric',stat:'vitality',kind:'prefix'},
  {id:'falcon',stat:'critChance',kind:'suffix'},
  {id:'titan',stat:'vitality',kind:'suffix'},
  {id:'warding',stat:'blockChance',kind:'suffix'},
  {id:'haste',stat:'moveSpeed',kind:'suffix'},
  {id:'bear',stat:'strength',kind:'suffix'}
] as const;
function hash(input:string):number {
  let value=2166136261>>>0;
  for(let i=0;i<input.length;i++) value=Math.imul(value^input.charCodeAt(i),16777619)>>>0;
  return value;
}
function eligibleAffix(item:Item,excludeIndex?:number) {
  const used=new Set(item.affixes.filter((_,i)=>i!==excludeIndex).map(affix=>affix.id));
  return AFFINITIES.filter(a=>!used.has(a.id));
}
function mutateItem(kind:CraftKind,item:Item,affixIndex?:number):Item|null {
  const clone:Item = {...item,affixes:item.affixes.map(a=>({...a})),
    ...(item.sockets ? {sockets:[...item.sockets]}:{})};
  if(kind==='upgrade') return temperItem(clone);
  if(kind==='socket') return {...clone,sockets:[...(clone.sockets??[]),null]};
  if(kind==='reroll' || kind==='enchant'){
    const replace=kind==='reroll';
    const index=replace?affixIndex!:clone.affixes.length;
    if(replace && (!Number.isSafeInteger(index)||index<0||index>=clone.affixes.length))
      return null;
    const old=replace?clone.affixes[index]:null;
    const options=eligibleAffix(clone,replace?index:undefined)
      .filter(affix=>!old||affix.id!==old.id);
    if(!options.length) return null;
    const seed=hash(clone.id+'|'+kind+'|'+(old?.id??'')+'|'+(old?.value??0));
    const selected=options[seed%options.length]!;
    const value=selected.stat==='critChance'||selected.stat==='blockChance'
      ? Math.min(20,1+seed%8)
      : Math.min(100,2+item.level%15+seed%8);
    const affix={id:selected.id,stat:selected.stat,value,
      ...(old?.tier?{tier:old.tier}:{}),
      kind:selected.kind} as Item['affixes'][number];
    if(replace) clone.affixes[index]=affix;
    else clone.affixes.push(affix);
    return clone;
  }
  return null;
}
function validFlags(flags:CraftState['flags']):boolean {
  if(flags===undefined)return true;
  if(!flags||typeof flags!=='object'||Array.isArray(flags))return false;
  const p=Object.getPrototypeOf(flags);
  return (p===null||p===Object.prototype)
    && Object.entries(flags).length<=MAX_INV
    && Object.entries(flags).every(([id,f])=>id.length>0&&id.length<=128
      && f&&typeof f.locked==='boolean'&&typeof f.favorite==='boolean');
}
function fail(reason:CraftFailure):CraftPlan {return {ok:false,reason};}
/** Pure all-or-nothing ledger; no partially updated gold, item, or materials. */
export function planCraft(state:CraftState,request:CraftRequest):CraftPlan {
  if(!state||!request||!isCraftKind(request.kind)
    || !Array.isArray(state.inventory) || state.inventory.length<1
    || state.inventory.length>MAX_INV
    || !state.inventory.every(v=>v===null||isItem(v))
    || !validateMaterials(state.materials)
    || !Number.isSafeInteger(state.gold)||state.gold<0||state.gold>MAX_GOLD
    || !validFlags(state.flags)
    || new Set(state.inventory.filter((x):x is Item=>!!x).map(x=>x.id)).size
      !== state.inventory.filter(Boolean).length
    || !Number.isSafeInteger(request.index)
    || request.index<0||request.index>=state.inventory.length) return fail('invalid');
  const item=state.inventory[request.index];
  if(!item)return fail('missing');
  if(state.flags?.[item.id]?.locked||state.flags?.[item.id]?.favorite)return fail('protected');
  const quote=quoteCraft(request.kind,item);
  if(!quote)return fail('maxed');
  if(state.gold<quote.gold)return fail('funds');
  for(const id of MATERIAL_IDS) {
    if((state.materials[id]??0)<(quote.materials[id]??0))return fail('materials');
  }
  const nextMaterial:Materials={...state.materials};
  for(const id of MATERIAL_IDS) {
    const value=(nextMaterial[id]??0)-(quote.materials[id]??0)+(quote.yield[id]??0);
    if(!Number.isSafeInteger(value)||value<0||value>MAX_MATERIAL)return fail('capacity');
    if(value>0)nextMaterial[id]=value;
    else delete nextMaterial[id];
  }
  const newInventory=state.inventory.map(entry=>entry?{
    ...entry,affixes:entry.affixes.map((a: Item['affixes'][number])=>({...a})),
    ...(entry.sockets?{sockets:[...entry.sockets]}:{})
  }:null);
  if(request.kind==='salvage')newInventory[request.index]=null;
  else {
    const changed=mutateItem(request.kind,item,request.affixIndex);
    if(!changed||!isItem(changed))return fail('unsafe');
    newInventory[request.index]=changed;
  }
  return {ok:true,kind:request.kind,inventory:newInventory,
    gold:state.gold-quote.gold,materials:nextMaterial,
    goldSpent:quote.gold,itemId:item.id,yield:{...quote.yield}};
}
