/**
 * Prompt 41 — shared simulation-owned summon and corpse geometry.
 * Generic owner IDs and stable sequence IDs permit Warlock/multiplayer reuse.
 * Stateless, deterministic: no RNG, UI, Phaser or character-save mutation.
 * GPL-3.0-only.
 */
import { ACTOR_RADIUS, canOccupy, hasLineOfSight, moveActor,
  type Obstacle } from '../world/navigation';
export type SummonKind = 'skeleton' | 'golem' | 'demon';
export type SummonZone = 'wilderness' | 'crypt';
export interface SummonPoint { readonly x:number; readonly y:number }
export interface OwnedSummon extends SummonPoint {
  readonly id:string;
  readonly ownerId:string;
  readonly zone:SummonZone;
  readonly kind:SummonKind;
  readonly maxHealth:number;
  readonly health:number;
  readonly damage:number;
  readonly range:number;
  readonly speed:number;
  readonly remaining:number;
  readonly attackTimer:number;
  readonly targetId:string|null;
}
export interface CorpseToken extends SummonPoint {
  readonly id:string;
  readonly enemyId:string;
  readonly zone:SummonZone;
  readonly remaining:number;
}
export interface SummonSpawn {
  readonly ownerId:string; readonly kind:SummonKind; readonly zone:SummonZone;
  readonly sequence:number; readonly origin:SummonPoint; readonly level:number;
  readonly spellPower:number; readonly obstacles:readonly Obstacle[];
}
export interface SummonEnemy extends SummonPoint {readonly id:string; readonly alive:boolean}
export interface SummonStep {
  readonly summons:readonly OwnedSummon[];
  readonly hits:readonly {sourceId:string;targetId:string;power:number;type:'physical'|'shadow'}[];
}
export interface SummonTick {
  readonly dt:number; readonly ownerId:string; readonly ownerPosition:SummonPoint;
  readonly ownerAlive:boolean;readonly zone:SummonZone;
  readonly enemies:readonly SummonEnemy[];readonly obstacles:readonly Obstacle[];
}
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/;
const ident=(x:unknown):x is string=>typeof x==='string'
  && ID.test(x)&&!['__proto__','prototype','constructor'].includes(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const point=(p:unknown):p is SummonPoint=>!!p&&typeof p==='object'
  &&finite((p as SummonPoint).x)&&finite((p as SummonPoint).y)
  &&(p as SummonPoint).x>=0&&(p as SummonPoint).x<=2200
  &&(p as SummonPoint).y>=0&&(p as SummonPoint).y<=1400;
const zone=(v:unknown):v is SummonZone=>v==='wilderness'||v==='crypt';
const kind=(v:unknown):v is SummonKind=>v==='skeleton'||v==='golem'||v==='demon';
const dist=(a:SummonPoint,b:SummonPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
function obstaclesValid(value:unknown):value is readonly Obstacle[]{
  if(!Array.isArray(value)||value.length>600)return false;
  const seen=new Set<string>();
  for(const o of value as Obstacle[]){
    if(!o||!ident(o.id)||seen.has(o.id)||!point(o)
      ||!finite(o.width)||!finite(o.height)||o.width<=0||o.height<=0
      ||o.x+o.width>2200||o.y+o.height>1400)return false;
    seen.add(o.id);
  }
  return true;
}
export function validOwnedSummons(value:unknown):value is readonly OwnedSummon[]{
  if(!Array.isArray(value)||value.length>8)return false;
  const ids=new Set<string>();
  for(const s of value as OwnedSummon[]){
    if(!s||!ident(s.ownerId)||!ident(s.id)||ids.has(s.id)
      ||s.id.indexOf('summon.'+s.ownerId+'.')!==0
      ||!/^[1-9][0-9]{0,8}$/.test(s.id.slice(('summon.'+s.ownerId+'.').length))
      ||!zone(s.zone)||!kind(s.kind)
      ||!point(s)||!finite(s.health)||s.health<=0
      ||!finite(s.maxHealth)||s.maxHealth<s.health||s.maxHealth>100000
      ||!finite(s.damage)||s.damage<0||s.damage>2000
      ||!finite(s.speed)||s.speed<=0||s.speed>400
      ||!finite(s.range)||s.range<=0||s.range>400
      ||!finite(s.remaining)||s.remaining<=0||s.remaining>120
      ||!finite(s.attackTimer)||s.attackTimer<0||s.attackTimer>4
      ||(s.targetId!==null&&!ident(s.targetId)))return false;
    ids.add(s.id);
  }
  return true;
}
export function validCorpseTokens(value:unknown):value is readonly CorpseToken[]{
  if(!Array.isArray(value)||value.length>24)return false;
  const ids=new Set<string>();
  for(const c of value as CorpseToken[]){
    if(!c||!ident(c.enemyId)||c.id!=='corpse.'+c.enemyId
      ||!zone(c.zone)||!point(c)||!finite(c.remaining)
      ||c.remaining<=0||c.remaining>25||ids.has(c.id))return false;
    ids.add(c.id);
  }
  return true;
}
const OFFSETS:readonly SummonPoint[]=[
  {x:0,y:58},{x:-58,y:0},{x:0,y:-58},{x:58,y:0},
  {x:44,y:44},{x:-44,y:44},{x:-44,y:-44},{x:44,y:-44}
];
export function createOwnedSummon(req:SummonSpawn):OwnedSummon|null{
  if(!req||!ident(req.ownerId)||!kind(req.kind)||!zone(req.zone)
    ||!Number.isSafeInteger(req.sequence)||req.sequence<1||req.sequence>100000000
    ||!point(req.origin)||!Number.isSafeInteger(req.level)||req.level<1||req.level>100
    ||!finite(req.spellPower)||req.spellPower<0.1||req.spellPower>8
    ||!obstaclesValid(req.obstacles)||!canOccupy(req.origin,ACTOR_RADIUS,req.obstacles))
    return null;
  const start=req.sequence%OFFSETS.length;
  const location=OFFSETS.map((_,i)=>OFFSETS[(start+i)%OFFSETS.length]!)
    .map(d=>({x:req.origin.x+d.x,y:req.origin.y+d.y}))
    .find(p=>canOccupy(p,ACTOR_RADIUS,req.obstacles));
  if(!location)return null;
  const heavy=req.kind==='golem',demon=req.kind==='demon';
  const maxHealth=Math.round((heavy?145:demon?95:62)+(req.level-1)*(heavy?16:9)
    +req.spellPower*(heavy?20:12));
  const damage=Math.round((heavy?18:demon?17:12)*(1+(req.level-1)*0.055)
    *req.spellPower);
  return {
    id:'summon.'+req.ownerId+'.'+req.sequence,ownerId:req.ownerId,
    zone:req.zone,kind:req.kind,...location,maxHealth,health:maxHealth,damage,
    range:heavy?62:demon?180:66,speed:heavy?90:demon?120:138,
    remaining:heavy?34:22,attackTimer:0.4,targetId:null
  };
}
/** Only the caller's validated live enemy list can be attacked. */
export function stepOwnedSummons(input:unknown,ctx:SummonTick):SummonStep|null{
  if(!validOwnedSummons(input)||!ctx||!finite(ctx.dt)||ctx.dt<=0||ctx.dt>0.1
    ||!ident(ctx.ownerId)||!point(ctx.ownerPosition)
    ||typeof ctx.ownerAlive!=='boolean'||!zone(ctx.zone)
    ||!obstaclesValid(ctx.obstacles)||!Array.isArray(ctx.enemies)
    ||ctx.enemies.length>256)return null;
  const enemyIds=new Set<string>();
  for(const e of ctx.enemies){
    if(!e||!ident(e.id)||!point({x:e.x,y:e.y})||typeof e.alive!=='boolean'
      ||enemyIds.has(e.id))return null;
    enemyIds.add(e.id);
  }
  const summons:OwnedSummon[]=[];
  const hits:SummonStep['hits'][number][]=[];
  for(const original of input){
    if(original.ownerId!==ctx.ownerId||original.zone!==ctx.zone
      ||!ctx.ownerAlive||original.remaining<=ctx.dt||original.health<=0)continue;
    const candidate={...original,remaining:original.remaining-ctx.dt,
      attackTimer:Math.max(0,original.attackTimer-ctx.dt)};
    // Keep the ally near its owner, never aggro remote undiscovered enemies.
    const possible=ctx.enemies.filter(e=>e.alive&&dist(e,ctx.ownerPosition)<400
      &&dist(e,candidate)<420
      &&hasLineOfSight(candidate,e,ctx.obstacles))
      .sort((a,b)=>dist(candidate,a)-dist(candidate,b)||a.id.localeCompare(b.id));
    const target=possible[0];
    candidate.targetId=target?.id??null;
    if(target){
      if(dist(candidate,target)>candidate.range){
        moveActor(candidate,target,candidate.speed*ctx.dt,ACTOR_RADIUS,ctx.obstacles);
      }else if(candidate.attackTimer<=0){
        hits.push({sourceId:candidate.id,targetId:target.id,power:candidate.damage,
          type:candidate.kind==='demon'?'shadow':'physical'});
        candidate.attackTimer=candidate.kind==='golem'?1.45:0.95;
      }
    }else if(dist(candidate,ctx.ownerPosition)>90){
      moveActor(candidate,ctx.ownerPosition,candidate.speed*ctx.dt,ACTOR_RADIUS,ctx.obstacles);
    }
    summons.push(candidate);
  }
  return {summons,hits};
}
export function addCorpseToken(tokens:readonly CorpseToken[],
  enemyId:unknown,bodyZone:unknown,position:unknown):readonly CorpseToken[]{
  if(!validCorpseTokens(tokens)||!ident(enemyId)||!zone(bodyZone)||!point(position)
    ||tokens.some(c=>c.enemyId===enemyId))return tokens;
  const next:CorpseToken={id:'corpse.'+enemyId,enemyId,
    zone:bodyZone,x:position.x,y:position.y,remaining:20};
  return [...tokens.slice(-23),next];
}
export function stepCorpseTokens(tokens:unknown,dt:unknown):readonly CorpseToken[]|null{
  if(!validCorpseTokens(tokens)||!finite(dt)||dt<0||dt>30)return null;
  return tokens.map(c=>({...c,remaining:c.remaining-dt}))
    .filter(c=>c.remaining>0);
}
export function chooseCorpseToken(tokens:unknown,bodyZone:unknown,
  center:unknown,range:unknown):CorpseToken|null{
  if(!validCorpseTokens(tokens)||!zone(bodyZone)||!point(center)||!finite(range)
    ||range<=0||range>650)return null;
  const candidates=tokens.filter(c=>c.zone===bodyZone&&dist(c,center)<=range)
    .sort((a,b)=>dist(a,center)-dist(b,center)||a.id.localeCompare(b.id));
  return candidates[0]?{...candidates[0]}:null;
}
export function consumeCorpseToken(tokens:unknown,enemyId:unknown):readonly CorpseToken[]|null{
  if(!validCorpseTokens(tokens)||!ident(enemyId)
    ||!tokens.some(c=>c.enemyId===enemyId))return null;
  return tokens.filter(c=>c.enemyId!==enemyId);
}
