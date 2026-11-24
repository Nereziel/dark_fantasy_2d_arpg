// GPL-3.0-only — canonical reward slots, never client-provided reward amounts.
import type {OptionalDungeonId} from './optionalDungeonVisit';

const ACTORS=['skeleton-1','wolf-2','wraith-3','crypt_lord-4','skeleton-5','wraith-6'] as const;
type Slot=typeof ACTORS[number]|'clear';
export type OptionalDungeonRewardId=`${OptionalDungeonId}:${Slot}`;
const IDS:readonly OptionalDungeonRewardId[]=(['mine','cave'] as const)
  .flatMap(id=>[...ACTORS,'clear' as const].map(slot=>`${id}:${slot}` as OptionalDungeonRewardId));
const ID_SET:ReadonlySet<string>=new Set(IDS);

export function validOptionalDungeonRewardIds(value:unknown):value is OptionalDungeonRewardId[]{
  return Array.isArray(value)&&value.length<=IDS.length
    &&value.every(id=>typeof id==='string'&&ID_SET.has(id))
    &&new Set(value).size===value.length;
}
export function optionalDungeonRewardId(id:OptionalDungeonId,slot:unknown):OptionalDungeonRewardId|null{
  if((id!=='mine'&&id!=='cave')||typeof slot!=='string')return null;
  const key=id+':'+slot;
  return ID_SET.has(key)?key as OptionalDungeonRewardId:null;
}
