/**
 * Prompt 37 — deterministic, region-scoped, one-shot wilderness events.
 * Pure planning over the already-validated optional wilderness event anchors.
 * Does not alter terrain, mandatory quest features or procedural map fingerprints.
 * GPL-3.0-only.
 */
import type { Point } from '../core/types';
import type { EnemyType } from '../enemies/enemies';
import type { Materials } from '../crafting/craftingRules';
import type { CatalogTemplateId } from '../items/itemCatalog';
import { CAMP, CAMP_RADIUS, type WorldLayout } from './generator';
import { ACTOR_RADIUS, canOccupy, findPath, WORLD_HEIGHT, WORLD_WIDTH } from './navigation';
import { MANDATORY_FEATURE_IDS, type WildernessFeature } from './wildernessFeatures';

export const WORLD_EVENT_KINDS = [
  'banditAmbush', 'demonIncursion', 'caravanDefense', 'cursedShrine',
  'eliteHunt', 'rescueEvent', 'ritualInterruption', 'treasureAmbush'
] as const;
export type WorldEventKind = typeof WORLD_EVENT_KINDS[number];
export type WorldEventRegion = 'ashenRoad' | 'corruptedWilds' | 'graveApproach';
export type WorldEventId = 'wild.event.1' | 'wild.event.2';
export type WorldEventStatus = 'available' | 'active' | 'completed';
export interface WorldEventSpawn {
  readonly id: string;
  readonly type: EnemyType;
  readonly position: Readonly<Point>;
}
export interface WorldEventPlan {
  readonly id: WorldEventId;
  readonly kind: WorldEventKind;
  readonly region: WorldEventRegion;
  readonly position: Readonly<Point>;
  readonly triggerRadius: number;
  readonly enemySpawns: readonly WorldEventSpawn[];
}
export interface WorldEventView {
  readonly id: WorldEventId;
  readonly kind: WorldEventKind;
  readonly region: WorldEventRegion;
  readonly position: Readonly<Point>;
  readonly status: WorldEventStatus;
  readonly remaining: number;
  readonly total: number;
}
export interface WorldEventReward {
  readonly xp: number;
  readonly gold: number;
  readonly materials: Readonly<Materials>;
  readonly itemBaseId: CatalogTemplateId;
}
export const WORLD_EVENT_TRIGGER_RADIUS = 92;
const MAX_LEVEL = 100;
const EVENT_IDS: readonly WorldEventId[] = ['wild.event.1','wild.event.2'];
const REGION_TABLE: Readonly<Record<WorldEventRegion,readonly WorldEventKind[]>> = Object.freeze({
  ashenRoad: [
    'banditAmbush','caravanDefense','rescueEvent','treasureAmbush',
    'banditAmbush','eliteHunt','rescueEvent','treasureAmbush'
  ],
  corruptedWilds: [
    'demonIncursion','cursedShrine','ritualInterruption','eliteHunt',
    'demonIncursion','ritualInterruption','cursedShrine','caravanDefense'
  ],
  graveApproach: [
    'eliteHunt','ritualInterruption','cursedShrine','treasureAmbush',
    'demonIncursion','rescueEvent','eliteHunt','banditAmbush'
  ]
});
const ENEMIES: Readonly<Record<WorldEventKind,readonly EnemyType[]>> = Object.freeze({
  banditAmbush: ['banditFighter','banditArcher'],
  demonIncursion: ['fanatic','cultMage'],
  caravanDefense: ['banditFighter','banditRogue'],
  cursedShrine: ['wraith','skeleton'],
  eliteHunt: ['ghoul','skeletonMage'],
  rescueEvent: ['banditRogue','banditFighter'],
  ritualInterruption: ['cultMage','fanatic'],
  treasureAmbush: ['banditArcher','banditRogue']
});
const REWARDS: Readonly<Record<WorldEventKind, {
  gold:number; xp:number; materials:Materials; itemBaseId:CatalogTemplateId
}>> = Object.freeze({
  banditAmbush:{gold:35,xp:85,materials:{iron:2},itemBaseId:'broadsword'},
  demonIncursion:{gold:43,xp:105,materials:{demon_essence:1},itemBaseId:'wand'},
  caravanDefense:{gold:48,xp:85,materials:{steel:1},itemBaseId:'shield'},
  cursedShrine:{gold:30,xp:110,materials:{soul_fragment:1},itemBaseId:'helm'},
  eliteHunt:{gold:52,xp:120,materials:{steel:2},itemBaseId:'mace'},
  rescueEvent:{gold:45,xp:100,materials:{iron:2},itemBaseId:'dagger'},
  ritualInterruption:{gold:36,xp:115,materials:{arcane_dust:2},itemBaseId:'wand'},
  treasureAmbush:{gold:60,xp:90,materials:{steel:1},itemBaseId:'belt'}
});
const OFFSETS: readonly Readonly<Point>[] = [
  {x:-32,y:0},{x:32,y:0},{x:0,y:-34},{x:0,y:34},
  {x:-36,y:-28},{x:36,y:28},{x:36,y:-28},{x:-36,y:28},
  {x:-56,y:0},{x:56,y:0},{x:0,y:56},{x:0,y:-56},
  {x:-50,y:42},{x:50,y:-42}
];

function uint32(seed: unknown): seed is number {
  return typeof seed === 'number' && Number.isSafeInteger(seed)
    && seed >= 0 && seed <= 0xffffffff;
}
function point(value: unknown): value is Point {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p=value as Partial<Point>;
  return typeof p.x==='number' && Number.isFinite(p.x)
    && typeof p.y==='number' && Number.isFinite(p.y)
    && p.x >= 0 && p.x <= WORLD_WIDTH && p.y >= 0 && p.y <= WORLD_HEIGHT;
}
function distance(a: Readonly<Point>,b: Readonly<Point>):number {
  return Math.hypot(a.x-b.x,a.y-b.y);
}
function hash(seed: number, id: string): number {
  let h=(seed ^ 0x9e3779b9)>>>0;
  for(const c of id) h=(Math.imul(h ^ c.charCodeAt(0),16777619))>>>0;
  h^=h>>>16;
  h=Math.imul(h,0x7feb352d)>>>0;
  h^=h>>>15;
  return h>>>0;
}
function regionFor(pos: Readonly<Point>):WorldEventRegion {
  return pos.x < 850 ? 'ashenRoad' : pos.x < 1500 ? 'corruptedWilds' : 'graveApproach';
}
function validWorld(seed:number,layout:unknown,features:unknown):layout is WorldLayout {
  if (!layout || typeof layout!=='object' || Array.isArray(layout)
    || !Array.isArray(features) || features.length>100 || features.length<7) return false;
  const w=layout as Partial<WorldLayout>;
  if (!uint32(w.seed)||w.seed!==seed||!point(w.camp)
    || w.camp.x!==CAMP.x||w.camp.y!==CAMP.y
    || !Array.isArray(w.obstacles)||w.obstacles.length<1||w.obstacles.length>512
    || !w.obstacles.every(o=>o && typeof o.id==='string'
      && [o.x,o.y,o.width,o.height].every(Number.isFinite)
      && o.width>0 && o.height>0
      && o.x>=0 && o.y>=0 && o.x+o.width<=WORLD_WIDTH
      && o.y+o.height<=WORLD_HEIGHT)
    || !Array.isArray(w.encounterPositions)
    || w.encounterPositions.length<1||w.encounterPositions.length>128
    || !w.encounterPositions.every(point)) return false;
  const ids=new Set<string>();
  for(const item of features) {
    const f=item as Partial<WildernessFeature> | null;
    if (!f || typeof f.id!=='string'||ids.has(f.id)
      || !point(f.position)||typeof f.radius!=='number'
      || !Number.isFinite(f.radius)||f.radius<=0||f.radius>150
      || !['event','treasure','encounterZone','poi','corruption','forest','graveyard',
        'evidence','miniBoss','cryptEntrance'].includes(String(f.kind))
      || typeof f.mandatory!=='boolean'
      || !canOccupy(f.position,ACTOR_RADIUS,w.obstacles)) return false;
    ids.add(f.id);
  }
  return MANDATORY_FEATURE_IDS.every(id=>ids.has(id));
}
function spawnSafe(position:Point,feature:WildernessFeature,layout:WorldLayout,
  all: readonly WildernessFeature[],already:readonly WorldEventSpawn[]):boolean {
  if (!canOccupy(position,ACTOR_RADIUS,layout.obstacles)
    || distance(position,CAMP)<=CAMP_RADIUS+100
    || distance(position,feature.position)>75
    || layout.encounterPositions.some(p=>distance(position,p)<75)
    || already.some(e=>distance(position,e.position)<ACTOR_RADIUS*2)) return false;
  if (all.some(f=>f.mandatory
    && distance(position,f.position)<=f.radius+20)) return false;
  return findPath(feature.position,position,ACTOR_RADIUS,layout.obstacles).length>0;
}
/** Stable per-seed event choices. Invalid layouts return no events, never a risky fallback. */
export function planWorldEvents(seed:number,layout:Readonly<WorldLayout>,
  features:readonly WildernessFeature[]):WorldEventPlan[] {
  if (!uint32(seed)||!validWorld(seed,layout,features)) return [];
  const anchors=features.filter(f=>f.kind==='event' && f.mandatory===false
    && EVENT_IDS.some(id=>id===f.id))
    .sort((a,b)=>a.id.localeCompare(b.id));
  const result:WorldEventPlan[]=[];
  for(const anchor of anchors) {
    const region=regionFor(anchor.position);
    const table=REGION_TABLE[region];
    const kind=table[hash(seed,anchor.id)%table.length]!;
    const spawns:WorldEventSpawn[]=[];
    const rotated=hash(seed ^ 0xa31eab2f,anchor.id)%OFFSETS.length;
    for(let i=0;i<OFFSETS.length && spawns.length<2;i++) {
      const offset=OFFSETS[(rotated+i)%OFFSETS.length]!;
      const position={x:anchor.position.x+offset.x,y:anchor.position.y+offset.y};
      if (!spawnSafe(position,anchor,layout,features,spawns)) continue;
      spawns.push({
        id:'world-event.'+anchor.id+'.'+(spawns.length+1),
        type:ENEMIES[kind][spawns.length%ENEMIES[kind].length]!,
        position
      });
    }
    if(spawns.length<2)continue;
    result.push({id:anchor.id as WorldEventId,kind,region,
      position:{...anchor.position},triggerRadius:WORLD_EVENT_TRIGGER_RADIUS,
      enemySpawns:spawns});
  }
  return result;
}
export function worldEventReward(kind:unknown,level:unknown):WorldEventReward|null {
  if (typeof kind!=='string'||!Object.hasOwn(REWARDS,kind)
    || !Number.isSafeInteger(level)||typeof level!=='number'
    || level<1||level>MAX_LEVEL) return null;
  const reward=REWARDS[kind as WorldEventKind];
  return {
    xp:Math.round(reward.xp*(1+(level-1)*0.06)),
    gold:reward.gold+Math.min(350,(level-1)*4),
    materials:{...reward.materials},
    itemBaseId:reward.itemBaseId
  };
}
/** Only the world ledger, never a client-provided status, grants completed state. */
export function projectWorldEventViews(
  plans:readonly WorldEventPlan[],
  discoveredIds:readonly string[],completedIds:readonly string[],
  activeId:WorldEventId|null,
  enemies:readonly {readonly id:string;readonly alive:boolean}[]
):WorldEventView[] {
  if (!Array.isArray(plans)||!Array.isArray(discoveredIds)
    || !Array.isArray(completedIds)||!Array.isArray(enemies))return [];
  const discovered=new Set(discoveredIds),completed=new Set(completedIds);
  return plans.filter(plan=>discovered.has(plan.id)).map(plan=>{
    const done=completed.has(plan.id);
    const active=!done && activeId===plan.id;
    const remaining=active?plan.enemySpawns.filter((spawn:WorldEventSpawn)=>
      enemies.some(enemy=>enemy.id===spawn.id && enemy.alive)).length
      :done?0:plan.enemySpawns.length;
    return {
      id:plan.id,kind:plan.kind,region:plan.region,position:{...plan.position},
      status:done?'completed':active?'active':'available',
      remaining,total:plan.enemySpawns.length
    };
  });
}
