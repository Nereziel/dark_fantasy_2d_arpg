// GPL-3.0-only — #207 B2b2. One session owns the immutable roster plan
// and all live ordinary + mandatory hunt actors, independent of activation.
import {planWildernessPopulation,type WildernessPopulation} from './wildernessPopulation';
import {planQuestPopulation,questKillCredits,type QuestPopulation} from './questPopulation';
import {WildernessPopulationSession,type PopulationRoster} from './populationLifecycle';
import type {WildernessRuntimeWorld} from './wildernessRuntime';
import type {QuestLedger} from '../quests/questDialogue';

export class ActIWildernessSession {
  readonly ordinary:WildernessPopulation;
  readonly hunt:QuestPopulation;
  readonly manifest:PopulationRoster;
  readonly population:WildernessPopulationSession;
  /** Caller supplies a unique instance token, NOT the seed or hero ID.
   * Retain it for same-instance resume; new game gets a new token. */
  constructor(world:WildernessRuntimeWorld,level:number,readonly sessionId:string){
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(sessionId))
      throw new RangeError('Invalid population session identity');
    this.ordinary=planWildernessPopulation(world);
    this.hunt=planQuestPopulation(world,this.ordinary);
    this.manifest={seed:this.ordinary.seed,groups:[...this.ordinary.groups,this.hunt]};
    this.population=new WildernessPopulationSession(this.manifest,level);
  }
  /** Reconcile authoritative deaths even when the hunt group is inactive.
   * Only the existing quest engine may advance objectives or award rewards. */
  huntCredits(ledger:QuestLedger):string[]{
    return questKillCredits(this.hunt,this.population.allUnits().map(u=>u.actor),ledger,this.sessionId);
  }
}
