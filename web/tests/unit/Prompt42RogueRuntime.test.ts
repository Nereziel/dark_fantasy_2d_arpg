// Prompt 42 — authoritative Rogue runtime and transient-state acceptance.
import {describe,it,expect} from 'vitest';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {rollItemForBase,SeededRng} from '../../src/game/data/items';
import {ROGUE_EXTRA_SKILLS} from '../../src/game/skills/rogueKit';
function rogue(seed=42){
 const sim=new GameSimulation(seed);
 sim.command({type:'reset',classId:'ROGUE',seed});
 return sim;
}
function tick(sim:GameSimulation,frames=38){for(let i=0;i<frames;i++)sim.advance(16.667)}
describe('Prompt 42 Rogue combat integration',()=>{
 it('consumes Energy exactly once, resolves Fan of Knives at hit frame, and advances cooldown',()=>{
   const sim=rogue(),before=sim.snapshot();
   sim.command({type:'rogueAbility',id:'fanOfKnives'});
   const issued=sim.snapshot();
   expect(issued.resource).toBe(before.resource-ROGUE_EXTRA_SKILLS.fanOfKnives.cost);
   expect(issued.rogueCooldowns?.fanOfKnives).toBe(ROGUE_EXTRA_SKILLS.fanOfKnives.cooldown);
   sim.command({type:'rogueAbility',id:'fanOfKnives'});
   expect(sim.snapshot().resource).toBe(issued.resource);
   expect(issued.classAction?.rogueAbilityId).toBe('fanOfKnives');
   tick(sim);
   expect(sim.snapshot().classAction).toBeNull();
   expect(sim.snapshot().rogueCooldowns?.fanOfKnives).toBeLessThan(ROGUE_EXTRA_SKILLS.fanOfKnives.cooldown);
 });
 it('places a real one-shot poison trap and cleans it on reset, without permanent save data',()=>{
   const sim=rogue();
   const p=sim.snapshot().player;
   sim.command({type:'rogueAbility',id:'trap',position:{x:p.x+48,y:p.y}});
   tick(sim);
   const state=sim.snapshot();
   expect(state.rogueTraps?.length).toBe(1);
   expect(state.rogueTraps?.[0]).toMatchObject({id:'rogue-trap.hero.1',ownerId:'hero'});
   expect('rogueTraps' in sim.character()).toBe(false);
   expect('rogueCooldowns' in sim.character()).toBe(false);
   expect(sim.restore(structuredClone(state))).toBe(true);
   expect(sim.restore({...state,rogueTraps:[{...state.rogueTraps![0]!,ownerId:'not-hero'}]})).toBe(false);
   sim.command({type:'reset',classId:'ROGUE',seed:42});
   expect(sim.snapshot().rogueTraps).toEqual([]);
   expect(sim.snapshot().rogueNextTrapSequence).toBe(1);
 });
 it('rejects forged extra actions from other classes and invalid cooldowns',()=>{
   const sim=rogue(),state=sim.snapshot();
   expect(sim.restore({...state,rogueCooldowns:{trap:Infinity}})).toBe(false);
   expect(sim.restore({...state,rogueStealthSeconds:100})).toBe(false);
   sim.command({type:'reset',classId:'PALADIN',seed:42});
   const before=sim.snapshot().resource;
   sim.command({type:'rogueAbility',id:'fanOfKnives'});
   expect(sim.snapshot().resource).toBe(before);
   expect(sim.snapshot().rogueTraps).toEqual([]);
 });
 it('supports real bow/crossbow catalog equipment and melee daggers',()=>{
   const sim=rogue(),s=sim.snapshot();
   const bow=rollItemForBase('bow','test-rogue-bow',5,'COMMON',new SeededRng(111),'ROGUE');
   const crossbow=rollItemForBase('crossbow','test-rogue-crossbow',5,'COMMON',new SeededRng(112),'ROGUE');
   const dagger=rollItemForBase('dagger','test-rogue-dagger',5,'COMMON',new SeededRng(113),'ROGUE');
   expect([bow?.weaponType,crossbow?.weaponType,dagger?.weaponType]).toEqual(['BOW','CROSSBOW','DAGGER']);
   for(const item of [bow,crossbow,dagger]){
     expect(item).not.toBeNull();
     expect(sim.restore({...s,level:5,equipment:{...s.equipment,
       MAIN_HAND:item!},xp:0,skillPoints:4,talentPoints:1})).toBe(true);
   }
 });
});
