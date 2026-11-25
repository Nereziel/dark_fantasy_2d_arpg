// GPL-3.0-only
import {describe,expect,it} from 'vitest';
import {createOptionalDungeonPack,optionalDungeonRoster,optionalDungeonRewardSlot,isOptionalDungeonBoss} from '../../src/game/enemies/optionalDungeonEncounters';
import {optionalDungeonRewardId,validOptionalDungeonRewardIds} from '../../src/game/world/optionalDungeonRewards';
import {buildActIDungeonInterior} from '../../src/game/world/actIDungeonEntrances';
import {ACTOR_RADIUS,canOccupy} from '../../src/game/world/navigation';

describe('Issue #208 C3.2: dungeon-specific encounters',()=>{
  it.each(['mine','cave'] as const)('creates %s encounters without changing saved reward identities',id=>{
    const interior=buildActIDungeonInterior(42,id);
    const positions=[interior.bossSpawn,...interior.bossGuardSpawns];
    const slots:string[]=[];
    for(const stage of [0,1] as const){
      const pack=createOptionalDungeonPack(id,stage,5,positions);
      expect(pack.map(u=>u.actor.type)).toEqual(optionalDungeonRoster(id,stage));
      expect(pack).toEqual(createOptionalDungeonPack(id,stage,5,positions));
      expect(pack.every((u,i)=>u.actor.x===positions[i]!.x&&u.actor.y===positions[i]!.y
        &&canOccupy(u.actor,ACTOR_RADIUS,interior.obstacles))).toBe(true);
      for(const [index,unit] of pack.entries()){
        const slot=optionalDungeonRewardSlot(id,stage,unit.actor.id);
        expect(slot).not.toBeNull();
        slots.push(optionalDungeonRewardId(id,slot)!);
        expect(isOptionalDungeonBoss(id,stage,unit.actor.id)).toBe(stage===1&&index===0);
        expect(unit.actor.type).not.toBe('crypt_lord');
      }
      expect(optionalDungeonRewardSlot(id,stage,'summon-1-3')).toBeNull();
      expect(optionalDungeonRewardSlot(id,stage,'forged-4')).toBeNull();
      if(stage===1)expect(pack[0]!.actor.maxHealth).toBeGreaterThan(400);
    }
    slots.push(optionalDungeonRewardId(id,'clear')!);
    expect(slots).toEqual(['skeleton-1','wolf-2','wraith-3','crypt_lord-4','skeleton-5','wraith-6','clear'].map(slot=>id+':'+slot));
    expect(validOptionalDungeonRewardIds(slots)).toBe(true);
  });
  it('populates the mine with human enemies and the cave with beasts',()=>{
    expect(optionalDungeonRoster('mine',0)).toEqual(['banditFighter','banditArcher','banditRogue']);
    expect(optionalDungeonRoster('mine',1)).toEqual(['fanatic','cultHealer','banditArcher']);
    expect(optionalDungeonRoster('cave',0)).toEqual(['spider','wolf','ghoul']);
    expect(optionalDungeonRoster('cave',1)).toEqual(['corruptedBoar','spider','wolf']);
    expect(isOptionalDungeonBoss(undefined,1,'crypt_lord-4')).toBe(false);
  });
});
