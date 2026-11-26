import { describe, expect, it } from 'vitest';
import { createPack, createCryptPack } from '../../src/game/enemies/enemies';
import { createOptionalDungeonPack } from '../../src/game/enemies/optionalDungeonEncounters';
import { enemyHoverIdentity } from '../../src/game/ui/enemyHoverIdentity';
const positions=[{x:500,y:500},{x:600,y:600},{x:700,y:700}];
describe('enemy hover identity',()=>{
  it('retains actual encounter level independent of later hero levels',()=>{
    const unit=createPack(0,4,positions)[0]!;
    expect(enemyHoverIdentity(unit,'wilderness',undefined,9)).toMatchObject({nameKey:'enemies.wraith.name',level:4,rank:'normal'});
    expect(enemyHoverIdentity(unit,'wilderness',undefined,10).level).toBe(4);
  });
  it('names bosses by identity and preserves the generated level',()=>{
    const king=createCryptPack(1,6,positions)[0]!;
    expect(enemyHoverIdentity(king,'crypt',undefined,8)).toMatchObject({nameKey:'boss.hollowKing.name',level:6,rank:'boss'});
    const mine=createOptionalDungeonPack('mine',1,7,positions)[0]!;
    expect(enemyHoverIdentity(mine,'crypt','mine',9)).toMatchObject({nameKey:'dungeon.mineBoss',level:7,rank:'boss'});
    const morrow={...king,actor:{...king.actor,id:'morrow_gravebound',type:'wraith' as const}};
    expect(enemyHoverIdentity(morrow,'wilderness',undefined,8)).toMatchObject({nameKey:'miniBossNames.morrow_gravebound',rank:'boss'});
  });
  it('handles older snapshots without encounter level',()=>{
    const unit=createPack(0,3,positions)[0]!;
    delete unit.actor.level;
    expect(enemyHoverIdentity(unit,'wilderness',undefined,5).level).toBe(5);
  });
});
