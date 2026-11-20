import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CLASSES } from '../../src/game/data/classes';
import { createPack } from '../../src/game/enemies/enemies';
import { monsterActions } from '../../src/game/enemies/monsterRuntime';
import { WARRIOR_ABILITIES, type WarriorAbilityId } from '../../src/game/skills/warriorKit';
import { statusRule, monsterStatusImmunities } from '../../src/game/status/statusIntegration';
import { applyStatus, advanceStatuses } from '../../src/game/status/statusRuntime';
import { generateWorld } from '../../src/game/world/generator';

const frame = 1000 / 60 + 0.001;
function advance(sim: GameSimulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.advance(frame);
}
function isolatedWarrior(): GameSimulation {
  const sim = new GameSimulation();
  const s = sim.snapshot();
  expect(sim.restore({
    ...s,
    resource: Math.min(70, CLASSES.WARRIOR.resourceMax),
    player: { ...s.player, x: 865, y: 635 },
    enemies: s.enemies.map((unit, i) => ({
      ...unit, cooldown: 8, intent: null, effects: [],
      actor: i === 1
        ? { ...unit.actor, maxHealth: 500, health: 500, alive: true }
        : { ...unit.actor, health: 0, alive: false }
    }))
  })).toBe(true);
  return sim;
}

describe('Prompt 07/08 — one authoritative Warrior hit timing path', () => {
  const attacking: readonly WarriorAbilityId[] =
    ['basicAttack', 'cleave', 'charge', 'groundSlam', 'whirlwind', 'execute'];
  for (const id of attacking) {
    it(id + ': spends once and deals no damage before its configured impact tick', () => {
      const sim = isolatedWarrior();
      const initial = sim.snapshot();
      const enemy = initial.enemies[1]!.actor;
      sim.command({ type: 'warriorAbility', id, targetId: enemy.id });
      const requested = sim.snapshot();
      expect(requested.warriorAction?.id).toBe(id);
      expect(requested.enemies[1]!.actor.health).toBe(enemy.health);
      expect(requested.resource).toBe(initial.resource - WARRIOR_ABILITIES[id].rageCost);
      const windup = Math.round(WARRIOR_ABILITIES[id].hit * 60);
      advance(sim, windup - 1);
      expect(sim.snapshot().enemies[1]!.actor.health).toBe(enemy.health);
      advance(sim, 1);
      expect(sim.snapshot().enemies[1]!.actor.health).toBeLessThan(enemy.health);
      expect(sim.snapshot().warriorCooldowns?.[id]).toBeGreaterThan(0);
    });
  }

  it('Q/RMB Cleave is delayed and matches the same Warrior ability cooldown', () => {
    const sim = isolatedWarrior();
    const before = sim.snapshot();
    sim.command({ type: 'cast', slot: 'rmb', targetId: before.enemies[1]!.actor.id });
    expect(sim.snapshot().warriorAction?.id).toBe('cleave');
    expect(sim.snapshot().cooldowns.rmb).toBe(WARRIOR_ABILITIES.cleave.cooldown);
    expect(sim.snapshot().enemies[1]!.actor.health).toBe(before.enemies[1]!.actor.health);
    advance(sim, Math.round(WARRIOR_ABILITIES.cleave.hit * 60));
    expect(sim.snapshot().enemies[1]!.actor.health).toBeLessThan(before.enemies[1]!.actor.health);
  });

  it('automatic left-click attack uses hit-frame timing and generates Rage', () => {
    const sim = isolatedWarrior();
    const state = sim.snapshot();
    const target = state.enemies[1]!.actor.id;
    sim.command({ type: 'attack', targetId: target });
    advance(sim, 1);
    expect(sim.snapshot().enemies[1]!.actor.health).toBe(state.enemies[1]!.actor.health);
    advance(sim, Math.round(WARRIOR_ABILITIES.basicAttack.hit * 60) + 2);
    expect(sim.snapshot().enemies[1]!.actor.health).toBeLessThan(state.enemies[1]!.actor.health);
    expect(sim.snapshot().resource).toBeGreaterThan(state.resource);
  });

  it('War Cry restores Rage and applies canonical buffs without legacy timers', () => {
    const sim = isolatedWarrior();
    const before = sim.snapshot();
    sim.command({ type: 'warriorAbility', id: 'warCry' });
    advance(sim, Math.round(WARRIOR_ABILITIES.warCry.hit * 60));
    const result = sim.snapshot();
    expect(result.resource).toBeGreaterThan(before.resource);
    expect(result.statusEffects?.player.map(effect => effect.id))
      .toEqual(expect.arrayContaining(['haste', 'fortified']));
    expect(result.effects.player.map(effect => effect.id)).not.toContain('haste');
  });

  it('Charge with a directional cursor uses the same timeline and respects Shift hold', () => {
    const sim = isolatedWarrior();
    const start = sim.snapshot();
    sim.command({ type: 'holdPosition', value: true });
    sim.command({ type: 'cast', slot: 'slot1',
      aim: { mode: 'DIRECTION', direction: { x: 1, y: 0 } } });
    expect(sim.snapshot().cooldowns.slot1).toBe(0);
    sim.command({ type: 'holdPosition', value: false });
    sim.command({ type: 'cast', slot: 'slot1',
      aim: { mode: 'DIRECTION', direction: { x: 1, y: 0 } } });
    expect(sim.snapshot().warriorAction?.id).toBe('charge');
    expect(sim.snapshot().player.x).toBe(start.player.x);
    advance(sim, Math.round(WARRIOR_ABILITIES.charge.hit * 60));
    expect(sim.snapshot().player.x).toBeGreaterThanOrEqual(start.player.x);
  });
});

describe('Prompt 09 — canonical status rules and periodic effects', () => {
  it('stacks poison deterministically, emits one tick and expires exactly once', () => {
    const poison = statusRule('poisoned', 3, 2);
    let statuses = applyStatus([], poison, 'spider');
    statuses = applyStatus(statuses, poison, 'spider');
    expect(statuses[0]?.stacks).toBe(2);
    const first = advanceStatuses(statuses, 1);
    expect(first.ticks).toHaveLength(1);
    expect(first.ticks[0]).toMatchObject({
      statusId: 'poisoned', sourceId: 'spider', magnitude: 6
    });
    const last = advanceStatuses(first.statuses, 1);
    expect(last.ticks).toHaveLength(1);
    expect(last.statuses).toHaveLength(0);
  });

  it('runs Mage burning in exactly one canonical periodic damage pipeline', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'MAGE' });
    const base = sim.snapshot();
    const enemy = base.enemies[0]!.actor;
    expect(sim.restore({
      ...base, player: { ...base.player, x: enemy.x - 90, y: enemy.y },
      enemies: base.enemies.map((unit, index) => ({
        ...unit, cooldown: 6, intent: null,
        ...(index === 0 ? {} : { actor: { ...unit.actor, health: 0, alive: false } })
      }))
    })).toBe(true);
    sim.command({ type: 'cast', slot: 'rmb',
      aim: { mode: 'GROUND_POSITION', position: { x: enemy.x, y: enemy.y } } });
    advance(sim, 20); // Fireball applies its DoT only on the cast hit frame.
    expect(sim.snapshot().effects.enemy.filter(effect => effect.id === 'burning')).toHaveLength(1);
    expect(sim.snapshot().statusEffects?.enemies[enemy.id]?.filter(s => s.id === 'burning')).toHaveLength(1);
    sim.drainEvents();
    advance(sim, 60);
    const burns = sim.drainEvents().filter(event =>
      event.type === 'damageResolved' && event.targetId === enemy.id && event.damageType === 'fire');
    expect(burns).toHaveLength(1);
  });

  it('allows stationary Mage spells under root but still immobilizes movement', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'MAGE' });
    const original = sim.snapshot();
    const active = applyStatus([], statusRule('rooted', 1, 3), 'enemy');
    expect(sim.restore({
      ...original, statusEffects: { player: active, enemies: {} }
    })).toBe(true);
    sim.command({ type: 'move', destination: { x: original.player.x + 150, y: original.player.y } });
    advance(sim, 8);
    expect(sim.snapshot().player.x).toBe(original.player.x);
    sim.command({ type: 'cast', slot: 'slot1' });
    expect(sim.snapshot().cooldowns.slot1).toBeGreaterThan(0);
    expect(sim.snapshot().resource).toBeLessThan(original.resource);
  });

  it('respects monster immunity tags and effect-specific immunity IDs', () => {
    expect(applyStatus([], statusRule('stunned'), 'hero',
      monsterStatusImmunities('crypt_lord'))).toHaveLength(0);
    expect(applyStatus([], statusRule('poisoned'), 'hero',
      monsterStatusImmunities('spider'))).toHaveLength(0);
    expect(applyStatus([], statusRule('bleeding'), 'hero',
      monsterStatusImmunities('skeleton'))).toHaveLength(0);
    expect(applyStatus([], statusRule('chilled'), 'hero',
      monsterStatusImmunities('skeleton'))).toHaveLength(1);
  });
});

describe('Prompt 10/11 — catalog monster abilities and tactical runtime', () => {
  it('normalizes fourteen families with distinct damage, buffs, heal and debuffs', () => {
    expect(monsterActions('ghoul').some(a => a.statusId === 'bleeding')).toBe(true);
    expect(monsterActions('spider').some(a => a.statusId === 'poisoned')).toBe(true);
    expect(monsterActions('skeletonMage').some(a => a.attack === 'bolt')).toBe(true);
    expect(monsterActions('cultHealer').some(a => a.kind === 'heal')).toBe(true);
    expect(monsterActions('cultHealer').some(a => a.kind === 'buff')).toBe(true);
    expect(monsterActions('fanatic').some(a => a.buffType === 'damageBonus')).toBe(true);
    expect(monsterActions('cultMage').some(a => a.kind === 'debuff')).toBe(true);
  });

  it('cult mage telegraphs a ready binding hex instead of an unavailable shadow bolt', () => {
    const sim = new GameSimulation();
    const base = sim.snapshot();
    const pack = createPack(5, 1, generateWorld(base.worldSeed).encounterPositions);
    const mage = pack[1]!;
    expect(mage.actor.type).toBe('cultMage');
    mage.cooldown = 0;
    mage.abilityCooldowns = { shadowBolt: 20, bindingHex: 0 };
    const player = { ...base.player, x: mage.actor.x + 240, y: mage.actor.y };
    expect(sim.restore({ ...base, wave: 5, player, selectedTargetId: null, enemies: pack })).toBe(true);
    advance(sim, 3);
    const intent = sim.snapshot().enemies[1]?.intent;
    expect(intent?.abilityId).toBe('bindingHex');
    expect(intent?.pattern).toBe('bolt');
  });
});
