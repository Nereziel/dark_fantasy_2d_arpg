import {describe,it,expect} from 'vitest';
import {ROGUE_EXTRA_IDS,ROGUE_EXTRA_SKILLS,planRogueCast,
  validRogueCooldowns,advanceRogueCooldowns} from '../../src/game/skills/rogueKit';
import {planRogueMultishot,planRogueBackstab,planRogueStep,
  createRogueTrap,tickRogueTraps,validRogueTraps} from '../../src/game/skills/rogueCombatPlans';
const origin={x:300,y:400};
const target={x:360,y:400};
const context={energy:100,cooldowns:{},origin,targetId:'enemy-1',
  targetPosition:target,targetAlive:true,targetVisible:true,cursor:{x:410,y:400}};
describe('Prompt 42 Rogue pure ability kit',()=>{
 it('has five additional moves and guarded lookups',()=>{
   expect(ROGUE_EXTRA_IDS).toEqual(['backstab','multishot','shadowStep','trap','fanOfKnives']);
   expect(ROGUE_EXTRA_IDS.every(id=>ROGUE_EXTRA_SKILLS[id].id===id)).toBe(true);
   expect(planRogueCast('constructor',context)).toEqual({ok:false,reason:'unknown'});
 });
 it('commits Energy and cooldown only after validating aim and target',()=>{
   const cast=planRogueCast('backstab',context);
   expect(cast).toMatchObject({ok:true,aim:{mode:'TARGET_ENTITY',targetId:'enemy-1'}});
   if(!cast.ok)return;
   expect(cast.energyAfter).toBe(100-ROGUE_EXTRA_SKILLS.backstab.cost);
   expect(planRogueCast('backstab',{...context,cooldowns:cast.cooldowns})).toEqual({ok:false,reason:'cooldown'});
   expect(planRogueCast('backstab',{...context,energy:0})).toEqual({ok:false,reason:'energy'});
   expect(planRogueCast('backstab',{...context,targetVisible:false})).toEqual({ok:false,reason:'lineOfSight'});
   expect(planRogueCast('backstab',{...context,targetPosition:{x:800,y:400}})).toEqual({ok:false,reason:'range'});
   expect(validRogueCooldowns(cast.cooldowns)).toBe(true);
   expect(advanceRogueCooldowns({backstab:2},0.5)).toEqual({backstab:1.5});
   expect(validRogueCooldowns(JSON.parse('{"__proto__":1}'))).toBe(false);
 });
 it('gates teleport and traps on reachable mouse position before spending',()=>{
   expect(planRogueCast('shadowStep',{...context,targetAlive:false})).toEqual({ok:false,reason:'target'});
   expect(planRogueCast('trap',{...context,cursor:null})).toEqual({ok:false,reason:'aim'});
   expect(planRogueCast('trap',{...context,cursor:{x:2000,y:900}})).toEqual({ok:false,reason:'range'});
   expect(planRogueCast('fanOfKnives',{...context,targetAlive:false})).toMatchObject({ok:true,aim:{mode:'SELF'}});
   expect(planRogueCast('multishot',{...context,targetId:null,targetPosition:null,cursor:{x:400,y:400}}))
     .toMatchObject({ok:true,aim:{mode:'GROUND_POSITION',position:{x:400,y:400}}});
 });
 it('plans multishot cone deterministically and excludes obstacles/targets behind',()=>{
   const enemies=[{id:'b',x:410,y:370,alive:true},{id:'a',x:410,y:430,alive:true},
     {id:'behind',x:180,y:400,alive:true},{id:'far',x:900,y:400,alive:true}];
   const hits=planRogueMultishot(origin,{x:550,y:400},enemies,380,Math.PI/2,[],5);
   expect(hits).toEqual(['a','b']);
   expect(planRogueMultishot(origin,{x:550,y:400},enemies,380,Math.PI/2,
     [{id:'wall',x:340,y:340,width:20,height:150}],5)).toEqual([]);
 });
 it('plans backstab positional bonus and navigation-safe step',()=>{
   expect(planRogueBackstab(origin,target,{x:1,y:0},false)).toBeGreaterThan(1);
   expect(planRogueBackstab(origin,target,{x:-1,y:0},false)).toBe(1);
   expect(planRogueBackstab(origin,target,{x:-1,y:0},true)).toBeGreaterThan(1);
   expect(planRogueStep(origin,target,190,[])).not.toBeNull();
   expect(planRogueStep(origin,target,190,[{id:'wall',x:315,y:355,width:26,height:100}])).toBeNull();
 });
 it('deploys finite non-duplicating traps, activates once and rejects forgeries',()=>{
   const a=createRogueTrap('hero',1,'wilderness',{x:350,y:400},[]);
   expect(a).toMatchObject({id:'rogue-trap.hero.1',remaining:18});
   expect(validRogueTraps([a!])).toBe(true);
   const triggered=tickRogueTraps([a!],1/60,'wilderness',
     [{id:'mob',x:350,y:400,alive:true}],[]);
   expect(triggered?.hits.map(h=>h.id)).toEqual(['mob']);
   expect(triggered?.traps).toEqual([]);
   expect(validRogueTraps([a!,a!])).toBe(false);
   expect(tickRogueTraps([a!],1/60,'crypt',[],[])?.traps).toEqual([]);
   expect(createRogueTrap('hero',1,'wilderness',{x:350,y:400},
     [{id:'wall',x:330,y:385,width:40,height:40}])).toBeNull();
 });
});
