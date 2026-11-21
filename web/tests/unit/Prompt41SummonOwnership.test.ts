// GPL-3.0-only. Prompt 41 RED-first reusable summon/corpse contract.
import { describe, expect, it } from 'vitest';
import {
  createOwnedSummon, stepOwnedSummons, addCorpseToken, stepCorpseTokens,
  chooseCorpseToken, consumeCorpseToken, validOwnedSummons, validCorpseTokens
} from '../../src/game/summons/summonOwnership';
const origin = {x:320,y:420};
const context = { dt:1/60, ownerId:'hero', ownerPosition:origin,
  ownerAlive:true, zone:'wilderness' as const,
  enemies:[{id:'enemy-b',x:405,y:430,alive:true},{id:'enemy-a',x:405,y:430,alive:true}],
  obstacles:[] };
describe('Prompt 41 owned summons and reusable corpses',()=>{
  it('allocates deterministic session IDs and level-scaled summons for any valid owner',()=>{
    const a=createOwnedSummon({ownerId:'hero',kind:'skeleton',zone:'wilderness',
      sequence:1,origin,level:1,spellPower:1,obstacles:[]});
    const b=createOwnedSummon({ownerId:'future-player-2',kind:'golem',zone:'wilderness',
      sequence:2,origin,level:18,spellPower:1.4,obstacles:[]});
    expect(a).toMatchObject({id:'summon.hero.1',ownerId:'hero',kind:'skeleton',remaining:22});
    expect(b).toMatchObject({id:'summon.future-player-2.2',kind:'golem'});
    expect((b?.maxHealth??0)).toBeGreaterThan((a?.maxHealth??0));
    expect((b?.damage??0)).toBeGreaterThan((a?.damage??0));
    expect(validOwnedSummons([a!,b!])).toBe(true);
    expect(createOwnedSummon({ownerId:'__proto__',kind:'skeleton',zone:'wilderness',
      sequence:1,origin,level:1,spellPower:1,obstacles:[]})).toBeNull();
  });
  it('safely rejects invalid spawn, bounds, sequence and owner',()=>{
    expect(createOwnedSummon({ownerId:'hero',kind:'skeleton',zone:'wilderness',
      sequence:0,origin,level:1,spellPower:1,obstacles:[]})).toBeNull();
    expect(createOwnedSummon({ownerId:'hero',kind:'skeleton',zone:'wilderness',
      sequence:1,origin:{x:NaN,y:100},level:1,spellPower:1,obstacles:[]})).toBeNull();
    expect(createOwnedSummon({ownerId:'hero',kind:'skeleton',zone:'wilderness',
      sequence:1,origin,level:1,spellPower:1,
      obstacles:[{id:'block',x:265,y:360,width:130,height:120}]})).toBeNull();
  });
  it('acquires nearest target with stable ID tie-break, moves without teleporting, hits at rate',()=>{
    const s=createOwnedSummon({ownerId:'hero',kind:'skeleton',zone:'wilderness',
      sequence:1,origin,level:1,spellPower:1,obstacles:[]})!;
    const first=stepOwnedSummons([s],context);
    expect(first).not.toBeNull();
    expect(first?.summons).toHaveLength(1);
    expect(first?.summons[0]?.targetId).toBe('enemy-a');
    expect(first?.summons[0]?.x).not.toBe(s.x);
    expect(first?.hits).toEqual([]);
    let state=[s];
    const hits: string[]=[];
    for(let i=0;i<190;i++){
      const step=stepOwnedSummons(state,context);
      expect(step).not.toBeNull();
      state=[...(step?.summons??[])];
      hits.push(...(step?.hits.map(hit=>hit.targetId)??[]));
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThan(6);
    expect(hits.every(id=>id==='enemy-a')).toBe(true);
    expect(s.x).toBeDefined(); // no mutation
  });
  it('expires on death, ownership loss or zone transition and validates hostile snapshot sets',()=>{
    const s=createOwnedSummon({ownerId:'hero',kind:'golem',zone:'wilderness',
      sequence:1,origin,level:1,spellPower:1,obstacles:[]})!;
    expect(stepOwnedSummons([s],{...context,ownerAlive:false})?.summons).toEqual([]);
    expect(stepOwnedSummons([s],{...context,zone:'crypt'})?.summons).toEqual([]);
    expect(validOwnedSummons([s,{...s}])).toBe(false);
    expect(validOwnedSummons([{...s,remaining:Infinity}])).toBe(false);
    expect(stepOwnedSummons([s],{...context,dt:100})).toBeNull();
  });
  it('corpses are bounded, deterministic, consumable once, and expiry cleans them',()=>{
    const a=addCorpseToken([], 'enemy-a','wilderness',origin);
    const b=addCorpseToken(a,'enemy-b','wilderness',{x:330,y:420});
    expect(a).toHaveLength(1);
    expect(addCorpseToken(b,'enemy-a','wilderness',origin)).toEqual(b);
    expect(chooseCorpseToken(b,'wilderness',{x:340,y:420},90)?.enemyId).toBe('enemy-b');
    expect(chooseCorpseToken(b,'crypt',origin,100)).toBeNull();
    const used=consumeCorpseToken(b,'enemy-b');
    expect(used?.map(c=>c.enemyId)).toEqual(['enemy-a']);
    expect(consumeCorpseToken(used!,'enemy-b')).toBeNull();
    expect(stepCorpseTokens(a,20.01)).toEqual([]);
    expect(validCorpseTokens([{...a[0]!,remaining:NaN}])).toBe(false);
    expect(addCorpseToken(a,'bad/id','wilderness',origin)).toEqual(a);
  });
});
