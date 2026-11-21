/**
 * Prompt 41 — Necromancer-specific extra spell catalog and pure Essence planner.
 * Bone Spear and Raise Skeleton keep their original two SKILLS slots.
 * Caller supplies authoritative target/corpse visibility. No mutable game state here.
 * GPL-3.0-only.
 */
import type { SkillAim } from '../input/skillAiming';
export const NECRO_EXTRA_IDS=Object.freeze([
  'corpseExplosion','bloodDrain','curse','summonGolem','deathNova'
] as const);
export type NecroExtraSpellId=typeof NECRO_EXTRA_IDS[number];
export type NecroCooldowns=Partial<Record<NecroExtraSpellId,number>>;
export interface NecroSpell {
  readonly id:NecroExtraSpellId;
  readonly kind:'corpse'|'drain'|'curse'|'summon'|'nova';
  readonly icon:string; readonly color:number;
  readonly cost:number;readonly cooldown:number;readonly range:number;
  readonly power:number;readonly radius:number;readonly duration:number;
  readonly aimMode:'GROUND_POSITION'|'TARGET_ENTITY'|'SELF';
}
export const NECRO_EXTRA_SPELLS:Readonly<Record<NecroExtraSpellId,Readonly<NecroSpell>>>=
  Object.freeze({
    corpseExplosion:Object.freeze({id:'corpseExplosion',kind:'corpse',
      icon:'☄',color:0x9fc5a7,cost:22,cooldown:5,range:300,power:1.75,
      radius:112,duration:0,aimMode:'GROUND_POSITION'}),
    bloodDrain:Object.freeze({id:'bloodDrain',kind:'drain',
      icon:'♥',color:0xcd7593,cost:19,cooldown:6,range:255,power:1.45,
      radius:0,duration:0,aimMode:'TARGET_ENTITY'}),
    curse:Object.freeze({id:'curse',kind:'curse',
      icon:'☩',color:0x9c91cb,cost:20,cooldown:9,range:285,power:0.45,
      radius:0,duration:6,aimMode:'TARGET_ENTITY'}),
    summonGolem:Object.freeze({id:'summonGolem',kind:'summon',
      icon:'♜',color:0xa8b3aa,cost:37,cooldown:18,range:0,power:1.3,
      radius:0,duration:34,aimMode:'SELF'}),
    deathNova:Object.freeze({id:'deathNova',kind:'nova',
      icon:'☠',color:0x6fb78a,cost:32,cooldown:12,range:0,power:1.1,
      radius:165,duration:4,aimMode:'SELF'})
  });
export function getNecroSpell(id:unknown):NecroSpell|null{
  return typeof id==='string'&&Object.hasOwn(NECRO_EXTRA_SPELLS,id)
    ?NECRO_EXTRA_SPELLS[id as NecroExtraSpellId]:null;
}
export function validNecroCooldowns(value:unknown):value is NecroCooldowns{
  return !!value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.entries(value).length<=NECRO_EXTRA_IDS.length
    &&Object.entries(value).every(([id,n])=>getNecroSpell(id)!==null
      &&typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=360);
}
export function advanceNecroCooldowns(value:unknown,dt:unknown):NecroCooldowns|null{
  if(!validNecroCooldowns(value)||typeof dt!=='number'||!Number.isFinite(dt)
    ||dt<0||dt>1)return null;
  return Object.fromEntries(Object.entries(value).map(([id,n])=>[
    id,Number(Math.max(0,n-dt).toFixed(4))
  ])) as NecroCooldowns;
}
interface NecroPoint {readonly x:number;readonly y:number}
export interface NecroCastContext {
  readonly essence:number;
  readonly cooldowns:NecroCooldowns;
  readonly origin:NecroPoint;
  readonly targetId:string|null;
  readonly targetPosition:NecroPoint|null;
  readonly targetAlive:boolean;
  /** Set by authoritative raycast in GameSimulation, never a client field. */
  readonly targetVisible?:boolean;
  readonly corpseAvailable:boolean;
  readonly cursor:NecroPoint|null;
}
export type NecroCastPlan={
  readonly ok:true;readonly essenceAfter:number;
  readonly cooldowns:NecroCooldowns;readonly aim:SkillAim;
}|{readonly ok:false;readonly reason:
  'invalid'|'unknown'|'essence'|'cooldown'|'aim'|'target'|'range'|'corpse'|'lineOfSight'};
const point=(p:unknown):p is NecroPoint=>!!p&&typeof p==='object'
  &&typeof (p as NecroPoint).x==='number'&&Number.isFinite((p as NecroPoint).x)
  &&typeof (p as NecroPoint).y==='number'&&Number.isFinite((p as NecroPoint).y)
  &&(p as NecroPoint).x>=0&&(p as NecroPoint).y>=0
  &&(p as NecroPoint).x<=2200&&(p as NecroPoint).y<=1400;
export function planNecroCast(id:unknown,ctx:unknown):NecroCastPlan{
  const spell=getNecroSpell(id);
  if(!spell)return {ok:false,reason:'unknown'};
  if(!ctx||typeof ctx!=='object')return {ok:false,reason:'invalid'};
  const c=ctx as Partial<NecroCastContext>;
  if(typeof c.essence!=='number'||!Number.isFinite(c.essence)
    ||c.essence<0||c.essence>100000||!validNecroCooldowns(c.cooldowns)
    ||!point(c.origin)||typeof c.targetAlive!=='boolean'
    ||typeof c.corpseAvailable!=='boolean'
    ||(c.targetVisible!==undefined&&typeof c.targetVisible!=='boolean')
    ||(c.targetId!==null && c.targetId!==undefined
      &&(typeof c.targetId!=='string'||c.targetId.length===0||c.targetId.length>128))
    ||(c.targetPosition!==null&&c.targetPosition!==undefined&&!point(c.targetPosition))
    ||(c.cursor!==null&&c.cursor!==undefined&&!point(c.cursor)))
    return {ok:false,reason:'invalid'};
  if((c.cooldowns[spell.id]??0)>0.0001)return {ok:false,reason:'cooldown'};
  if(c.essence<spell.cost)return {ok:false,reason:'essence'};
  let aim:SkillAim;
  if(spell.aimMode==='TARGET_ENTITY'){
    if(!c.targetAlive||!c.targetId||!c.targetPosition)
      return {ok:false,reason:'target'};
    if(Math.hypot(c.origin.x-c.targetPosition.x,c.origin.y-c.targetPosition.y)>spell.range)
      return {ok:false,reason:'range'};
    if(c.targetVisible===false)return {ok:false,reason:'lineOfSight'};
    aim={mode:'TARGET_ENTITY',targetId:c.targetId};
  }else if(spell.aimMode==='GROUND_POSITION'){
    if(!c.cursor)return {ok:false,reason:'aim'};
    if(Math.hypot(c.origin.x-c.cursor.x,c.origin.y-c.cursor.y)>spell.range)
      return {ok:false,reason:'range'};
    if(!c.corpseAvailable)return {ok:false,reason:'corpse'};
    aim={mode:'GROUND_POSITION',position:{...c.cursor}};
  }else aim={mode:'SELF'};
  return {
    ok:true,essenceAfter:c.essence-spell.cost,
    cooldowns:{...c.cooldowns,[spell.id]:spell.cooldown},aim
  };
}
