import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CLASSES, CLASS_IDS, type ClassId } from '../../src/game/data/classes';
import { SKILLS, type SkillSlot } from '../../src/game/skills/skills';
import { classSkillTimeline, BASIC_ATTACK_TIMELINE } from '../../src/game/animation/classCombatTiming';
import { PIXEL_ACTOR_LOOKS, PIXEL_ANIMATIONS, PIXEL_ANIMATION_FRAMES,
  PIXEL_FRAME_WIDTH, PIXEL_FRAME_HEIGHT, pixelFrame, pixelAtlasKey } from '../../src/game/phaser/pixelSpriteAtlas';
import { STATUS_IDS, STATUS_DEFINITIONS } from '../../src/game/status/statusDefinitions';
import { statusVisuals, STATUS_VISUALS } from '../../src/game/status/statusVisuals';
import { applyStatus, advanceStatuses, getStatusModifiers } from '../../src/game/status/statusRuntime';
import { statusRule } from '../../src/game/status/statusIntegration';
import { ENEMY_DEFINITIONS } from '../../src/game/enemies/enemies';
import { createSaveRecord } from '../../src/persistence/SaveRepository';

const STEP = 1000/60 + 0.001;
function frames(sim: GameSimulation, count: number) {
  for (let i = 0; i < count; i++) sim.advance(STEP);
}
function combatFixture(classId: ClassId): GameSimulation {
  const sim = new GameSimulation();
  sim.command({ type:'reset', classId });
  const initial = sim.snapshot();
  const target = initial.enemies[1]!.actor;
  expect(sim.restore({
    ...initial, player: { ...initial.player, x: target.x-48, y: target.y },
    resource: CLASSES[classId].resourceMax,
    enemies: initial.enemies.map((u,i) => ({
      ...u, cooldown: 9, intent: null, effects: [],
      actor: i === 1
        ? { ...u.actor, health: 600, maxHealth: 600, alive: true }
        : { ...u.actor, health: 0, alive: false }
    }))
  })).toBe(true);
  return sim;
}

describe('Prompt 08 — all original classes share authoritative fixed-hit timelines', () => {
  const cases: Array<[ClassId, SkillSlot]> = [
    ['PALADIN', 'rmb'], ['MAGE', 'rmb'], ['ROGUE', 'slot1'],
    ['NECROMANCER','rmb'], ['WARLOCK','slot1']
  ];
  for (const [classId,slot] of cases) {
    it(classId+' '+slot+': spends at cast start but damages only on hit tick', () => {
      const sim=combatFixture(classId);
      const original=sim.snapshot();
      const enemy=original.enemies[1]!.actor;
      const skill=SKILLS[classId][slot];
      sim.command({
        type:'cast',slot,targetId: enemy.id,
        ...(skill.id==='fireball' ? {aim: {
          mode:'GROUND_POSITION' as const,position: {x:enemy.x,y:enemy.y}
        }} : {})
      });
      const started=sim.snapshot();
      expect(started.cooldowns[slot]).toBeGreaterThan(0);
      expect(started.classAction?.kind).toBe('skill');
      expect(started.enemies[1]!.actor.health).toBe(enemy.health);
      const hit=classSkillTimeline(skill).windupTicks!;
      frames(sim,hit-1);
      expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
      frames(sim,1);
      expect(sim.snapshot().enemies[1]!.actor.health).toBeLessThan(enemy.health);
    });
  }

  for (const classId of CLASS_IDS.filter(id => id !== 'WARRIOR')) {
    it(classId+': basic attack also waits for animation impact',()=>{
      const sim=combatFixture(classId);
      const enemy=sim.snapshot().enemies[1]!.actor;
      sim.command({type:'attack',targetId:enemy.id});
      frames(sim,1);
      expect(sim.snapshot().classAction?.kind).toBe('basic');
      expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
      frames(sim,BASIC_ATTACK_TIMELINE.windupTicks!-2);
      expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
      frames(sim,1);
      expect(sim.snapshot().enemies[1]!.actor.health).toBeLessThan(enemy.health);
    });
  }

  it('moving during windup cancels the pending hit without refunding a spent cost',()=>{
    const sim=combatFixture('MAGE');
    const enemy=sim.snapshot().enemies[1]!.actor;
    sim.command({type:'cast',slot:'rmb',targetId:enemy.id,
      aim:{mode:'GROUND_POSITION',position:{x:enemy.x,y:enemy.y}}});
    expect(sim.snapshot().classAction?.kind).toBe('skill');
    const charged=sim.snapshot().resource;
    sim.command({type:'move',destination:{x:850,y:530}});
    expect(sim.snapshot().classAction).toBeNull();
    frames(sim,60);
    expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
    expect(sim.snapshot().resource).toBeGreaterThanOrEqual(charged);
  });

  it('reload stores only character state, not ongoing combat actions',()=>{
    const sim=combatFixture('MAGE');
    const enemy=sim.snapshot().enemies[1]!.actor;
    sim.command({type:'cast',slot:'rmb',targetId:enemy.id,
      aim:{mode:'GROUND_POSITION',position:{x:enemy.x,y:enemy.y}}});
    const temp=sim.snapshot();
    expect(sim.restore(structuredClone(temp))).toBe(true);
    expect(sim.snapshot()).toEqual(temp);
    const save=createSaveRecord(sim.character());
    expect(save?.format).toBe(8);
    expect(JSON.stringify(save)).not.toContain('classAction');
    expect(JSON.stringify(save)).not.toContain('warriorAction');
  });
});

describe('Prompt 08/09/11 — original sprite atlas and complete status presentation',()=>{
  it('contains distinct original atlas looks for every hero and every spawnable monster',()=>{
    for(const cls of CLASS_IDS) {
      expect(PIXEL_ACTOR_LOOKS[cls]).toBeDefined();
      expect(pixelAtlasKey(cls)).toMatch(/^ar-pixel-/);
    }
    for(const type of Object.keys(ENEMY_DEFINITIONS) as Array<keyof typeof ENEMY_DEFINITIONS>) {
      const look=PIXEL_ACTOR_LOOKS[type];
      expect(look?.body).toMatch(/^#[0-9a-f]{6}$/i);
      expect(look?.shape).toBeTruthy();
    }
    expect(new Set(PIXEL_ANIMATIONS).size).toBe(10);
    expect(PIXEL_ANIMATION_FRAMES).toBe(4);
    expect(PIXEL_FRAME_WIDTH).toBeGreaterThan(31);
    expect(PIXEL_FRAME_HEIGHT).toBeGreaterThan(31);
    for(const anim of PIXEL_ANIMATIONS) {
      expect(pixelFrame(anim,0)).toBe(anim+'-0');
      expect(pixelFrame(anim,999)).toBe(anim+'-3');
    }
  });

  it('all 15 gameplay statuses have one stable visual hook, deterministic timers and modifiers',()=>{
    expect(STATUS_IDS).toHaveLength(15);
    expect(Object.keys(STATUS_VISUALS).sort()).toEqual([...STATUS_IDS].sort());
    for(const id of STATUS_IDS) {
      const def=STATUS_DEFINITIONS[id];
      const status=applyStatus([],statusRule(id),'fixture');
      expect(status).toHaveLength(1);
      expect(status[0]!.sourceId).toBe('fixture');
      expect(statusVisuals(status)).toEqual([STATUS_VISUALS[id]]);
      expect(statusVisuals([...status,...status])).toHaveLength(1);
      const half=advanceStatuses(status,def.duration/2).statuses;
      expect(half).toHaveLength(1);
      const expired=advanceStatuses(half,def.duration/2).statuses;
      expect(expired).toHaveLength(0);
      const coefficients=getStatusModifiers(status);
      for (const value of Object.values(coefficients)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
