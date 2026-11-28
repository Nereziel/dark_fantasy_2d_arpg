// GPL-3.0-only — #207 B2b2. One session owns the immutable roster plan
// and all live ordinary + mandatory hunt actors, independent of activation.
import {planWildernessPopulation,type WildernessPopulation} from './wildernessPopulation';
import {planQuestPopulation,questKillCredits,type QuestPopulation} from './questPopulation';
import {WildernessPopulationSession,type PopulationRoster} from './populationLifecycle';
import type {WildernessRuntimeWorld} from './wildernessRuntime';
import type {QuestLedger} from '../quests/questDialogue';
import type {PopulationSnapshot} from './populationSnapshot';
import type {Obstacle} from './navigation';

export class ActIWildernessSession {
  readonly ordinary:WildernessPopulation;
  readonly hunt:QuestPopulation;
  readonly manifest:PopulationRoster;
  readonly population:WildernessPopulationSession;
  private readonly obstacles:readonly Obstacle[];
  /** Caller supplies a unique instance token, NOT the seed or hero ID.
   * Retain it for same-instance resume; new game gets a new token. */
  constructor(world:WildernessRuntimeWorld,level:number,readonly sessionId:string){
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(sessionId))
      throw new RangeError('Invalid population session identity');
    this.obstacles=world.layout.obstacles.map(o=>({...o}));
    this.ordinary=planWildernessPopulation(world);
    this.hunt=planQuestPopulation(world,this.ordinary);
    this.manifest={seed:this.ordinary.seed,groups:[...this.ordinary.groups,this.hunt]};
    this.population=new WildernessPopulationSession(this.manifest,level);
  }
  snapshot():PopulationSnapshot{
    return {seed:this.manifest.seed,sessionId:this.sessionId,enemies:this.population.snapshot()};
  }
  /** Only the caller's already-selected same instance may be restored.
   * Never infer instance identity from the seed or character progression. */
  restore(raw:unknown):boolean{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
    const value=raw as Partial<PopulationSnapshot>;
    return value.seed===this.manifest.seed&&value.sessionId===this.sessionId
      &&this.population.restore(value.enemies,this.obstacles);
  }
  /** Reconcile authoritative deaths even when the hunt group is inactive.
   * Only the existing quest engine may advance objectives or award rewards. */
  huntCredits(ledger:QuestLedger):string[]{
    return questKillCredits(this.hunt,this.population.allUnits().map(u=>u.actor),ledger,this.sessionId);
  }
}
