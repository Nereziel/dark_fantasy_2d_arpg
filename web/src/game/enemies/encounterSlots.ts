// GPL-3.0-only — #207 B2b2b. Capacity counts actor ownership, not array size.
// Preserve the legacy extra-slot budget until the snapshot schema migrates.
import {PACK_SIZE,packTypesForWave,type EnemyUnit,type EnemyType} from './enemies';
import {MINI_BOSS_IDS,type MiniBossId} from './miniBossRules';
import type {PopulationRoster} from '../world/populationLifecycle';

export interface EncounterSlots {
  canonical:number;
  extra:number;
  summonedAlive:number;
  optionalBosses:number;
}
export function encounterSlots(units:readonly EnemyUnit[],wave:number,roster?:PopulationRoster):EncounterSlots{
  const canonical=new Map<string,EnemyType>();
  if(roster){
    for(const group of roster.groups)for(const member of group.members)canonical.set(member.id,member.type);
  }else if(Number.isSafeInteger(wave)&&wave>=0){
    const types=packTypesForWave(wave);
    for(let i=0;i<PACK_SIZE;i++){
      const type=types[i]!;
      canonical.set(type+'-'+(wave*PACK_SIZE+i+1),type);
      if(wave>=3&&(wave-3)%4===0)
        canonical.set('corruptedBoar-'+(wave*PACK_SIZE+i+1),'corruptedBoar');
    }
  }
  const slots:EncounterSlots={canonical:0,extra:0,summonedAlive:0,optionalBosses:0};
  const seen=new Set<string>();
  for(const unit of units){
    const {id,type,alive}=unit.actor;
    // The legacy boar variant shares numeric slots with the standard roster.
    const key=roster?id:id.slice(id.lastIndexOf('-')+1);
    if(!unit.summoned&&canonical.get(id)===type&&!seen.has(key)){
      seen.add(key);slots.canonical++;continue;
    }
    slots.extra++;
    if(unit.summoned&&alive)slots.summonedAlive++;
    if(!unit.summoned&&id!=='morrow_gravebound'&&MINI_BOSS_IDS.includes(id as MiniBossId))
      slots.optionalBosses++;
  }
  return slots;
}
