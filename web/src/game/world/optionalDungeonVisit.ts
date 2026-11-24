// GPL-3.0-only — pure authoritative transition planning. No reward or save side effects.
import type {Point} from '../core/types';
import type {WorldLayout} from './generator';
import {ACTOR_RADIUS,canOccupy,hasLineOfSight} from './navigation';
import {buildActIDungeonInterior,planActIDungeonEntrances,type ActIDungeonId} from './actIDungeonEntrances';
import type {ProceduralDungeonResult} from './proceduralDungeon';
import type {WildernessRuntimeWorld} from './wildernessRuntime';

export type OptionalDungeonId=Exclude<ActIDungeonId,'crypt'>;
export interface OptionalDungeonIdentity {
  readonly worldSeed:number;
  readonly dungeonId:OptionalDungeonId;
}
export interface OptionalDungeonVisit {
  readonly identity:OptionalDungeonIdentity;
  readonly interior:ProceduralDungeonResult;
  /** World identity remains the exterior seed; geometry uses the interior seed. */
  readonly layout:WorldLayout;
  readonly returnPosition:Readonly<Point>;
}
interface TransitionActor extends Point {readonly alive:boolean}
const REACH=72;
function optionalId(id:unknown):id is OptionalDungeonId{
  return id==='mine'||id==='cave';
}
function withinReach(actor:TransitionActor,target:Readonly<Point>,layout:WorldLayout):boolean{
  return actor?.alive===true&&Number.isFinite(actor.x)&&Number.isFinite(actor.y)
    &&Math.hypot(actor.x-target.x,actor.y-target.y)<=REACH
    &&canOccupy(actor,ACTOR_RADIUS,layout.obstacles)
    &&hasLineOfSight(actor,target,layout.obstacles);
}

/** Prepare a complete visit before any mutation. The authoritative simulation
 * must supply its current wilderness and actor; a client supplies only an ID.
 * Crypt continues through the existing story-specific transition.
 */
export function planOptionalDungeonEntry(world:WildernessRuntimeWorld,id:unknown,
  actor:TransitionActor):OptionalDungeonVisit|null{
  if(!optionalId(id))return null;
  const entry=planActIDungeonEntrances(world).find(e=>e.id===id);
  if(!entry||!withinReach(actor,entry.position,world.layout))return null;
  const interior=buildActIDungeonInterior(world.layout.seed,id);
  const combat=interior.encounterSpawns.find(s=>s.kind==='combat');
  const elite=interior.encounterSpawns.find(s=>s.kind==='elite');
  const event=interior.rooms.find(room=>room.type==='event');
  if(!combat||!elite||!event)return null;
  return {
    identity:{worldSeed:world.layout.seed,dungeonId:id},interior,
    layout:{seed:world.layout.seed,camp:{...interior.playerSpawn},
      obstacles:interior.obstacles.map(o=>({...o})),
      encounterPositions:[combat.position,elite.position,event.center].map(p=>({...p}))},
    returnPosition:{...entry.returnPosition}
  };
}

/** Exit only from an active server-owned visit identity and real interior
 * exit. Resolve exterior position again from the final generated world;
 * never accept return coordinates or a seed from an interaction command.
 */
export function planOptionalDungeonExit(world:WildernessRuntimeWorld,active:OptionalDungeonIdentity,
  actor:TransitionActor):Point|null{
  if(!active||active.worldSeed!==world.layout.seed||!optionalId(active.dungeonId))return null;
  const entry=planActIDungeonEntrances(world).find(e=>e.id===active.dungeonId);
  if(!entry)return null;
  const interior=buildActIDungeonInterior(active.worldSeed,active.dungeonId);
  const layout:WorldLayout={seed:active.worldSeed,camp:{...interior.playerSpawn},
    obstacles:interior.obstacles.map(o=>({...o})),encounterPositions:[]};
  if(!withinReach(actor,interior.exitPosition,layout))return null;
  return {...entry.returnPosition};
}
