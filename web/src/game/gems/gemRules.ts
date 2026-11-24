// GPL-3.0-only — Prompt 33. Atomic, deterministic, inventory-owned gem transactions.
// The caller must enforce NPC proximity; this layer validates the full ledger.
import {
  createEquipment, isEquipmentSlot, isItem, SeededRng,
  type Equipment, type EquipmentSlot, type Item
} from '../data/items';
import type { ItemFlags } from '../inventory/equipmentRules';
import { validateMaterials, type Materials } from '../crafting/craftingRules';
import {
  GEM_BASES, baseOf, isGemBaseId, isGemId, nextTier, tierOf,
  type GemBaseId, type GemId
} from './gemCatalog';

export type GemWallet = Partial<Record<GemId,number>>;
export interface GemState {
  readonly inventory: readonly (Item|null)[];
  readonly equipment: Readonly<Equipment>;
  readonly gems: Readonly<GemWallet>;
  readonly materials: Readonly<Materials>;
  readonly gold: number;
  readonly flags?: Readonly<Record<string,ItemFlags>>;
}
export type GemAction =
  | {readonly type:'forgeGem';readonly baseId:GemBaseId}
  | {readonly type:'upgradeGem';readonly gemId:GemId}
  | {readonly type:'socketGem';readonly location:'inventory'|'equipment';
      readonly index?:number;readonly slot?:EquipmentSlot;
      readonly socketIndex:number;readonly gemId:GemId}
  | {readonly type:'unsocketGem';readonly location:'inventory'|'equipment';
      readonly index?:number;readonly slot?:EquipmentSlot;
      readonly socketIndex:number};

export interface GemRecipe {
  readonly id:GemBaseId;
  readonly gold:number;
  readonly materials:Readonly<Materials>;
}
export type GemFailure = 'invalid'|'missing'|'protected'|'noSocket'|'occupied'
  |'insufficientGems'|'insufficientGold'|'insufficientMaterials'|'maxTier'|'capacity';
export type GemPlan = {readonly ok:true;readonly state:GemState;
  readonly itemId?:string;readonly gemId:GemId;readonly goldSpent:number}
  | {readonly ok:false;readonly reason:GemFailure};

const MAX_GEM_STACK=9999;
const MAX_GOLD=Number.MAX_SAFE_INTEGER;
const MAX_ITEMS=200;

export function emptyGems():GemWallet {return {};}
export function isValidGemWallet(value:unknown):value is GemWallet {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype && proto!==null)return false;
  const entries=Object.entries(value);
  return entries.length<=18 && entries.every(([id,count])=>
    isGemId(id) && Number.isSafeInteger(count)
    && count>=0 && count<=MAX_GEM_STACK);
}
/** The gem stream is independent of gear rolls and needs no new save field. */
export function rollCombatGem(seed: number, kills: number, rank: 'normal' | 'elite' | 'boss'): GemId | null {
  const rng = new SeededRng((seed ^ Math.imul(kills, 0x9e3779b9)) >>> 0);
  const chance = rank === 'boss' ? 1 : rank === 'elite' ? 0.25 : 0.125;
  if (rng.next() >= chance) return null;
  const pool = GEM_BASES.filter(base => base.kind === (rank === 'boss' ? 'rune' : 'gem'));
  return `${pool[rng.index(pool.length)]!.id}.1`;
}

export function grantCombatGem(gems: Readonly<GemWallet>, id: GemId): GemWallet | null {
  const count = gems[id] ?? 0;
  return count < MAX_GEM_STACK ? { ...gems, [id]: count + 1 } : null;
}

export function quoteGemRecipe(baseId:unknown):GemRecipe|null {
  if(!isGemBaseId(baseId))return null;
  const def=baseOf(`${baseId}.1` as GemId);
  return {id:def.id,gold:def.gold,materials:{...def.materials}};
}

function cloneItem(item:Item|null):Item|null {
  return item?{...item,affixes:item.affixes.map(a=>({...a})),
    ...(item.sockets?{sockets:[...item.sockets]}:{}),
    ...(item.legendaryPower?{legendaryPower:{...item.legendaryPower}}:{})}:null;
}
function cloneState(state:GemState):GemState {
  const eq=createEquipment();
  for(const slot of Object.keys(eq) as EquipmentSlot[])
    eq[slot]=cloneItem(state.equipment[slot]);
  return {
    inventory:state.inventory.map(cloneItem),equipment:eq,
    gems:{...state.gems},materials:{...state.materials},gold:state.gold,
    ...(state.flags?{flags:Object.fromEntries(Object.entries(state.flags)
      .map(([id,flags])=>[id,{...flags}]))}:{})
  };
}
function fail(reason:GemFailure):GemPlan {return {ok:false,reason};}
function isPlainRecord(value:unknown):value is Record<string,unknown> {
  return !!value && typeof value==='object' && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value));
}
function validLedger(state:GemState):boolean {
  if(!state || !Array.isArray(state.inventory)
    || state.inventory.length===0 || state.inventory.length>MAX_ITEMS
    || !state.inventory.every(item=>item===null||isItem(item))
    || !isPlainRecord(state.equipment)
    || Object.keys(state.equipment).length!==Object.keys(createEquipment()).length
    || !Object.keys(createEquipment()).every(slot=>Object.hasOwn(state.equipment,slot)
      && (state.equipment[slot as EquipmentSlot]===null
        || isItem(state.equipment[slot as EquipmentSlot])))
    || !isValidGemWallet(state.gems) || !validateMaterials(state.materials)
    || !Number.isSafeInteger(state.gold) || state.gold<0 || state.gold>MAX_GOLD
    || (state.flags!==undefined && (!isPlainRecord(state.flags)
      || Object.keys(state.flags).length>MAX_ITEMS
      || !Object.entries(state.flags).every(([id,flag])=>
        typeof id==='string' && id.length>0 && id.length<=128
        && !!flag && typeof flag==='object'
        && typeof flag.locked==='boolean' && typeof flag.favorite==='boolean'))))return false;
  const ids=[...state.inventory,...Object.values(state.equipment)]
    .filter((item):item is Item=>item!==null).map(item=>item.id);
  return ids.length===new Set(ids).size;
}
type SocketAction=Extract<GemAction,{type:'socketGem'|'unsocketGem'}>;
function targetItem(state:GemState,action:SocketAction):Item|null {
  if(action.location==='inventory') {
    if(!Number.isSafeInteger(action.index) || action.index===undefined
      || action.index<0 || action.index>=state.inventory.length
      || action.slot!==undefined)return null;
    return state.inventory[action.index];
  }
  if(action.location==='equipment') {
    if(!isEquipmentSlot(action.slot)||action.index!==undefined)return null;
    return state.equipment[action.slot];
  }
  return null;
}
function changeTarget(state:GemState,action:SocketAction,item:Item):GemState {
  const next=cloneState(state);
  if(action.location==='inventory') {
    (next.inventory as (Item|null)[])[action.index!]=item;
  } else {
    (next.equipment as Equipment)[action.slot!]=item;
  }
  return next;
}
function canAdd(wallet:GemWallet,id:GemId):boolean {
  return (wallet[id]??0)<MAX_GEM_STACK;
}
function add(wallet:GemWallet,id:GemId,amount:number):GemWallet {
  const result={...wallet};
  const count=(result[id]??0)+amount;
  if(count>0)result[id]=count;
  else delete result[id];
  return result;
}
function afford(cost:GemRecipe,state:GemState):GemFailure|null {
  if(state.gold<cost.gold)return 'insufficientGold';
  return Object.entries(cost.materials).some(([id,value])=>
    (state.materials[id as keyof Materials]??0)<value!)?'insufficientMaterials':null;
}
/** Every successful plan is all-or-nothing; no random source or global state. */
export function planGemAction(state:GemState,action:GemAction):GemPlan {
  if(!validLedger(state)||!action || typeof action!=='object')
    return fail('invalid');
  if(action.type==='forgeGem') {
    const quote=quoteGemRecipe(action.baseId);
    if(!quote)return fail('invalid');
    const gemId=`${quote.id}.1` as GemId;
    if(!canAdd(state.gems as GemWallet,gemId))return fail('capacity');
    const deficit=afford(quote,state);
    if(deficit)return fail(deficit);
    const next=cloneState(state);
    const wallet=add(next.gems as GemWallet,gemId,1);
    const materials={...next.materials};
    for(const [key,count] of Object.entries(quote.materials)) {
      const id=key as keyof Materials;
      const left=(materials[id]??0)-count!;
      if(left>0)materials[id]=left;
      else delete materials[id];
    }
    return {ok:true,gemId,goldSpent:quote.gold,state:{
      ...next,materials,gems:wallet,gold:next.gold-quote.gold
    }};
  }
  if(action.type==='upgradeGem') {
    const id=action.gemId;
    if(!isGemId(id))return fail('invalid');
    const higher=nextTier(id);
    if(!higher)return fail('maxTier');
    if((state.gems[id]??0)<3)return fail('insufficientGems');
    if(!canAdd(state.gems as GemWallet,higher))return fail('capacity');
    const price=tierOf(id)*15;
    if(state.gold<price)return fail('insufficientGold');
    const next=cloneState(state);
    const wallet=add(add(next.gems as GemWallet,id,-3),higher,1);
    return {ok:true,gemId:higher,goldSpent:price,state:{
      ...next,gems:wallet,gold:next.gold-price
    }};
  }
  if(action.type!=='socketGem'&&action.type!=='unsocketGem')return fail('invalid');
  const item=targetItem(state,action);
  if(!item)return fail('missing');
  if(state.flags?.[item.id]?.locked || state.flags?.[item.id]?.favorite)
    return fail('protected');
  if(!Number.isSafeInteger(action.socketIndex)
    || action.socketIndex<0 || action.socketIndex>5
    || !item.sockets || action.socketIndex>=item.sockets.length)
    return fail('noSocket');
  const occupied=item.sockets[action.socketIndex];
  if(action.type==='socketGem') {
    if(!isGemId(action.gemId))return fail('invalid');
    if(occupied!==null)return fail('occupied');
    if((state.gems[action.gemId]??0)<1)return fail('insufficientGems');
    const altered=cloneItem(item)!;
    altered.sockets![action.socketIndex]=action.gemId;
    if(!isItem(altered))return fail('invalid');
    const next=changeTarget(state,action,altered);
    const gems=add(next.gems as GemWallet,action.gemId,-1);
    return {ok:true,itemId:item.id,gemId:action.gemId,goldSpent:0,state:{
      ...next,gems
    }};
  }
  if(!isGemId(occupied))return fail('noSocket');
  if(!canAdd(state.gems as GemWallet,occupied))return fail('capacity');
  const price=6*tierOf(occupied);
  if(state.gold<price)return fail('insufficientGold');
  const altered=cloneItem(item)!;
  altered.sockets![action.socketIndex]=null;
  const next=changeTarget(state,action,altered);
  const gems=add(next.gems as GemWallet,occupied,1);
  return {ok:true,itemId:item.id,gemId:occupied,goldSpent:price,state:{
    ...next,gems,gold:next.gold-price
  }};
}
