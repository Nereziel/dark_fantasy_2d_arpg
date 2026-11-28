// GPL-3.0-only — #207 B1, one authoritative ordinary roster per world instance.
// The simulation owns the live units. Activation is only an execution filter;
// it must never construct, replace, heal or reward a unit.
import type {Point} from '../core/types';
import {ENEMY_DEFINITIONS,validEnemyType,type EnemyUnit} from '../enemies/enemies';
import type {PopulationGroup} from './wildernessPopulation';

/** Common roster contract: quest groups need not have a terrain/chunk assignment. */
export type PopulationRosterGroup=Pick<PopulationGroup,'id'|'members'>;
export interface PopulationRoster {
  readonly seed:number;
  readonly groups:readonly PopulationRosterGroup[];
}

export const POPULATION_ACTIVATE_MARGIN=180;
export const POPULATION_DEACTIVATE_MARGIN=320;
const SIMULATION_MARGIN=520;
const SIMULATION_HYSTERESIS=160;
export interface PopulationViewport {
  readonly minX:number; readonly minY:number;
  readonly maxX:number; readonly maxY:number;
}
export interface PopulationActivation {
  readonly player:Readonly<Point>;
  /** World-space conservative bounds of the visible gameplay viewport.
   * The caller must refresh before a teleport destination is first rendered. */
  readonly visible:PopulationViewport;
  /** In-flight projectiles, ongoing combat or other simulation references. */
  readonly pinnedMemberIds?:readonly string[];
}
export interface PopulationDelta {
  readonly activated:readonly string[];
  readonly deactivated:readonly string[];
}
interface RuntimeGroup {
  readonly id:string;
  readonly units:EnemyUnit[];
}
function finitePoint(p:Readonly<Point>):boolean{
  return !!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
}
function distanceToBounds(p:Readonly<Point>,b:PopulationViewport):number{
  return Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),
    Math.max(b.minY-p.y,0,p.y-b.maxY));
}
function createGroup(group:PopulationRosterGroup,level:number):RuntimeGroup{
  return {id:group.id,units:group.members.map((member,index)=>{
    const hp=ENEMY_DEFINITIONS[member.type].health+Math.max(0,level-1)*12;
    return {actor:{id:member.id,type:member.type,level,x:member.spawn.x,y:member.spawn.y,
      health:hp,maxHealth:hp,alive:true},intent:null,cooldown:0.35+index*0.3,
      effects:[],abilityCooldowns:{}};
  })};
}

/** Construct exactly once when starting a new world instance. Do not construct
 * on death, zone changes, streaming or waypoint travel. Same-seed resume
 * serialization and simulation ownership integration are separate follow-ups. */
export class WildernessPopulationSession {
  readonly seed:number;
  private readonly groups:RuntimeGroup[];
  private active=new Set<string>();
  constructor(manifest:PopulationRoster,level:number){
    if(!Number.isSafeInteger(manifest.seed)||manifest.seed<0||manifest.seed>0xffffffff
      ||!Number.isSafeInteger(level)||level<1||level>100)
      throw new RangeError('Invalid population identity or level');
    const ids=new Set<string>();
    for(const group of manifest.groups){
      if(!group.id||ids.has(group.id)||group.members.length<2||group.members.length>4)
        throw new RangeError('Invalid population group');
      ids.add(group.id);
      for(const member of group.members){
        if(!member.id||ids.has(member.id)||!validEnemyType(member.type)||!finitePoint(member.spawn))
          throw new RangeError('Invalid population member');
        ids.add(member.id);
      }
    }
    this.seed=manifest.seed;
    this.groups=manifest.groups.map(group=>createGroup(group,level));
  }
  /** New array containing the original authoritative units, including inactive and dead.
   * Structural mutations of this array do not alter roster membership. */
  allUnits():EnemyUnit[]{return this.groups.flatMap(group=>group.units);}
  /** Detached inspection snapshot; never a second mutable roster. */
  snapshot():EnemyUnit[]{
    return structuredClone(this.allUnits());
  }
  /** Live references for the authoritative simulation, including dead actors
   * in active groups so render/corpse rules may use the original identity. */
  activeUnits():EnemyUnit[]{
    return this.groups.filter(group=>this.active.has(group.id)).flatMap(group=>group.units);
  }
  refresh(input:PopulationActivation):PopulationDelta{
    const b=input.visible;
    if(!finitePoint(input.player)||!b||![b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)
      ||b.minX>b.maxX||b.minY>b.maxY
      ||(input.pinnedMemberIds!==undefined&&(!Array.isArray(input.pinnedMemberIds)
        ||input.pinnedMemberIds.some(id=>typeof id!=='string'))))
      throw new RangeError('Invalid population activation context');
    const pins=new Set(input.pinnedMemberIds??[]);
    const next=new Set<string>();
    const activated:string[]=[],deactivated:string[]=[];
    for(const group of this.groups){
      const wasActive=this.active.has(group.id);
      const viewportMargin=wasActive?POPULATION_DEACTIVATE_MARGIN:POPULATION_ACTIVATE_MARGIN;
      const simulationMargin=SIMULATION_MARGIN+(wasActive?SIMULATION_HYSTERESIS:0);
      // Use current positions, not spawn anchors: a chasing enemy must not
      // disappear because its home chunk is distant. Never drop a live windup.
      const needed=group.units.some(u=>
        distanceToBounds(u.actor,b)<=viewportMargin
        ||Math.hypot(u.actor.x-input.player.x,u.actor.y-input.player.y)<=simulationMargin
        ||(u.actor.alive&&(u.intent!==null||pins.has(u.actor.id))));
      if(needed){next.add(group.id);if(!wasActive)activated.push(group.id);}
      else if(wasActive)deactivated.push(group.id);
    }
    this.active=next;
    return {activated,deactivated};
  }
}
