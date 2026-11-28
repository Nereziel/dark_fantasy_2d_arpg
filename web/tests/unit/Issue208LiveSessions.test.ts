// GPL-3.0-only — #208 D/E: fresh application, same live hero resume.
import {describe,it,expect} from 'vitest';
import {GameBridge} from '../../src/game/bridge/GameBridge';
const a='char-'+'a'.repeat(32),b='char-'+'b'.repeat(32);
function bridge(seeds:number[]){
  let i=0;
  return new GameBridge({finitePopulation:true,nextSeed:()=>seeds[i++]!,
    nextSessionId:()=> 'instance-'+i});
}
describe('live character sessions',()=>{
  it('switches between actual live finite worlds without reseeding',()=>{
    const g=bridge([42,1]);
    expect(g.createLiveCharacter('WARRIOR',a)).toBe(true);
    const first=g.snapshot(),progress=g.character();
    expect(first.wildernessPopulation?.sessionId).toBe('instance-1');
    expect(g.createLiveCharacter('MAGE',b)).toBe(true);
    expect(g.snapshot().worldSeed).toBe(1);
    expect(g.openLiveCharacter(progress)).toBe(true);
    expect(g.snapshot().worldSeed).toBe(42);
    expect(g.snapshot().wildernessPopulation).toEqual(first.wildernessPopulation);
    expect(g.character().characterId).toBe(a);
  });
  it('a new bridge starts a fresh world for the same saved hero, retaining progression',()=>{
    const old=bridge([42]);
    expect(old.createLiveCharacter('WARRIOR',a)).toBe(true);
    const progress={...old.character(),gold:1234};
    const next=bridge([1]);
    expect(next.openLiveCharacter(progress)).toBe(true);
    expect(next.snapshot().worldSeed).toBe(1);
    expect(next.character().gold).toBe(1234);
    expect(next.snapshot().enemies.every(u=>u.actor.alive)).toBe(true);
    expect(next.snapshot().enemies.length).toBeGreaterThan(3);
  });
  it('rejects invalid fresh launch without displacing the selected live hero',()=>{
    const g=bridge([42,1,0]);
    expect(g.createLiveCharacter('WARRIOR',a)).toBe(true);
    const before=g.snapshot();
    expect(g.openLiveCharacter({...g.character(),characterId:b,gold:-1})).toBe(false);
    expect(g.snapshot()).toEqual(before);
    g.forgetLiveCharacter(a);
    expect(g.openLiveCharacter({...g.character(),gold:99})).toBe(true);
    expect(g.character().gold).toBe(99);
  });
});
