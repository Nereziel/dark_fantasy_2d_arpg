// GPL-3.0-only — read-only identity projection for the hovered enemy.
import type { EnemyUnit } from '../enemies/enemies';
import { getMiniBossDefinition } from '../enemies/miniBossRules';
import { isOptionalDungeonBoss } from '../enemies/optionalDungeonEncounters';
import type { ZoneId, GameSnapshot } from '../core/types';
export function enemyHoverIdentity(unit:EnemyUnit,zone:ZoneId,dungeonId:GameSnapshot['dungeonId'],legacyLevel:number):{
  nameKey:string;level:number;rank:'normal'|'elite'|'boss'
}{
  const actor=unit.actor;
  const named=getMiniBossDefinition(actor.id);
  const optional=zone==='crypt'&&isOptionalDungeonBoss(dungeonId,1,actor.id);
  const king=zone==='crypt'&&!dungeonId&&actor.type==='crypt_lord';
  const rank=named||optional||king?'boss':unit.elite?'elite':'normal';
  const nameKey=named?'miniBossNames.'+actor.id:king?'boss.hollowKing.name':
    optional?(dungeonId==='mine'?'dungeon.mineBoss':'dungeon.caveBoss'):'enemies.'+actor.type+'.name';
  return {nameKey,level:actor.level??legacyLevel,rank};
}
