// GPL-3.0-only — Prompt 33: stable socketable gem/rune catalog.
// Pure definitions shared by item validation, stat projection and blacksmith UI.
import { ITEM_BASES } from '../items/itemCatalog';
import type { Item } from '../data/items';

export type GemTier = 1 | 2 | 3;
export type GemFamily = 'ruby' | 'sapphire' | 'emerald';
export type RuneFamily = 'ash' | 'ward' | 'focus';
export type GemBaseId = `gem.${GemFamily}` | `rune.${RuneFamily}`;
export type GemId = `${GemBaseId}.${GemTier}`;
export type SocketCategory = 'weapon' | 'armor' | 'jewelry';

export interface SocketBonus {
  readonly damage: number;
  readonly armor: number;
  readonly fireResist: number;
  readonly frostResist: number;
  readonly poisonResist: number;
  readonly resourceRegen: number;
  readonly maxResource: number;
  readonly healthRegen: number;
  readonly critChance: number;
}
export type BonusKey = keyof SocketBonus;

export interface GemBaseDefinition {
  readonly id: GemBaseId;
  readonly kind: 'gem' | 'rune';
  /** Values for tier one; higher tiers scale linearly. */
  readonly effects: Readonly<Record<SocketCategory, Partial<SocketBonus>>>;
  readonly materials: Readonly<Partial<Record<
    'iron'|'steel'|'arcane_dust'|'soul_fragment'|'demon_essence'|'ancient_crystal', number>>>;
  readonly gold: number;
}
export const GEM_BASES: readonly GemBaseDefinition[] = Object.freeze([
  {id:'gem.ruby',kind:'gem',gold:8,materials:{iron:1},
    effects:{weapon:{damage:2},armor:{fireResist:3},jewelry:{resourceRegen:0.15}}},
  {id:'gem.sapphire',kind:'gem',gold:12,materials:{arcane_dust:1},
    effects:{weapon:{critChance:1.5},armor:{frostResist:3},jewelry:{maxResource:5}}},
  {id:'gem.emerald',kind:'gem',gold:11,materials:{steel:1},
    effects:{weapon:{damage:2},armor:{poisonResist:3},jewelry:{healthRegen:0.2}}},
  {id:'rune.ash',kind:'rune',gold:16,materials:{soul_fragment:1},
    effects:{weapon:{damage:3},armor:{fireResist:4},jewelry:{resourceRegen:0.2}}},
  {id:'rune.ward',kind:'rune',gold:18,materials:{steel:1,soul_fragment:1},
    effects:{weapon:{damage:1},armor:{armor:9},jewelry:{maxResource:7}}},
  {id:'rune.focus',kind:'rune',gold:25,materials:{demon_essence:1},
    effects:{weapon:{critChance:2},armor:{frostResist:4},jewelry:{maxResource:9}}}
]);
const baseMap: ReadonlyMap<GemBaseId,GemBaseDefinition> =
  new Map(GEM_BASES.map(def=>[def.id,def]));
export const GEM_IDS: readonly GemId[] = Object.freeze(
  GEM_BASES.flatMap(base=>[1,2,3].map(tier=>`${base.id}.${tier}` as GemId))
);
const ids = new Set<string>(GEM_IDS);
export function isGemBaseId(id:unknown): id is GemBaseId {
  return typeof id==='string' && baseMap.has(id as GemBaseId);
}
export function isGemId(id:unknown): id is GemId {
  return typeof id==='string' && ids.has(id);
}
export function tierOf(id:GemId):GemTier {
  return Number(id.slice(-1)) as GemTier;
}
export function baseOf(id:GemId):GemBaseDefinition {
  return baseMap.get(id.slice(0,-2) as GemBaseId)!;
}
export function nextTier(id:unknown):GemId|null {
  if(!isGemId(id))return null;
  const tier=tierOf(id);
  return tier===3?null:`${id.slice(0,-1)}${tier+1}` as GemId;
}
export function socketCategory(item:Pick<Item,'templateId'>):SocketCategory|null {
  const base=typeof item?.templateId==='string'
    && Object.hasOwn(ITEM_BASES,item.templateId)
    ? ITEM_BASES[item.templateId as keyof typeof ITEM_BASES]:null;
  if(!base)return null;
  if(base.category==='accessory')return 'jewelry';
  if(base.category==='armor'||base.weaponType==='SHIELD')return 'armor';
  return 'weapon';
}
const ZERO:SocketBonus=Object.freeze({
  damage:0,armor:0,fireResist:0,frostResist:0,poisonResist:0,
  resourceRegen:0,maxResource:0,healthRegen:0,critChance:0
});
export function socketBonus(gemId:unknown,category:SocketCategory):SocketBonus {
  if(!isGemId(gemId)||!['weapon','armor','jewelry'].includes(category))
    return {...ZERO};
  const def=baseOf(gemId),tier=tierOf(gemId),effect=def.effects[category];
  const entries=(Object.keys(ZERO) as BonusKey[]).map(key=>[
    key,Number(((effect[key]??0)*tier).toFixed(3))
  ]);
  return Object.fromEntries(entries) as unknown as SocketBonus;
}
/** Do not expose mutable shared source values to combat callers. */
export function itemSocketBonus(item:Pick<Item,'templateId'|'sockets'>):SocketBonus {
  const category=socketCategory(item);
  if(!category)return {...ZERO};
  const total={...ZERO};
  for(const id of item.sockets??[]) {
    const b=socketBonus(id,category);
    for(const key of Object.keys(total) as BonusKey[])total[key]+=b[key];
  }
  return total;
}
