import { describe, expect, it } from 'vitest';
import { HeldPointerMovement } from '../../src/game/input/heldMovement';
import { resolveSkillAim } from '../../src/game/input/skillAiming';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { SKILLS } from '../../src/game/skills/skills';

const advance = (sim: GameSimulation, frames: number) => {
  for (let i = 0; i < frames; i++) sim.advance(16.667);
};

describe('Prompt 03: held Diablo mouse movement', () => {
  it('throttles held pointer commands and releases without jitter or spurious moves', () => {
    const input = new HeldPointerMovement(110, 12);
    input.begin({ x: 400, y: 470 }, 0);
    expect(input.update({ x: 404, y: 472 }, 40)).toBeNull();
    expect(input.update({ x: 600, y: 472 }, 65)).toBeNull();
    expect(input.update({ x: 600, y: 472 }, 120)).toEqual({ x: 600, y: 472 });
    expect(input.update({ x: 605, y: 475 }, 260)).toBeNull();
    expect(input.update({ x: 670, y: 470 }, 290)).toEqual({ x: 670, y: 470 });
    input.release();
    expect(input.update({ x: 900, y: 470 }, 480)).toBeNull();
  });
  it('prevents motion through root/stun while allowing movement again after expiry', () => {
    const sim = new GameSimulation();
    const initial = sim.snapshot();
    expect(sim.restore({
      ...initial,
      effects: { ...initial.effects, player: [
        { id: 'rooted', remaining: 1, magnitude: 0, tick: 0 }
      ] }
    })).toBe(true);
    sim.command({ type: 'move', destination: { x: 800, y: 470 } });
    advance(sim, 28);
    expect(sim.snapshot().player.x).toBe(initial.player.x);
    advance(sim, 54);
    expect(sim.snapshot().player.x).toBeGreaterThan(initial.player.x + 20);
  });
});

describe('Prompt 04: reusable interactive world objects', () => {
  it('approaches a sanctuary shrine, grants a shield once and does not save session state', () => {
    const sim = new GameSimulation();
    expect(sim.snapshot().interactables.some(o => o.id === 'soul-shrine')).toBe(true);
    sim.command({ type: 'interactObject', id: 'soul-shrine' });
    advance(sim, 420);
    const used = sim.snapshot();
    expect(used.shield).toBeGreaterThan(0);
    expect(used.interactables.some(o => o.id === 'soul-shrine')).toBe(false);
    expect('shield' in sim.character()).toBe(false);
    expect('interactables' in sim.character()).toBe(false);
    const shield = used.shield;
    sim.command({ type: 'interactObject', id: 'soul-shrine' });
    expect(sim.snapshot().shield).toBe(shield);
  });
  it('approaches a chest and drops one item without duplicating loot', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'interactObject', id: 'field-chest' });
    advance(sim, 360);
    expect(sim.snapshot().groundLoot).toHaveLength(1);
    sim.command({ type: 'interactObject', id: 'field-chest' });
    advance(sim, 30);
    expect(sim.snapshot().groundLoot).toHaveLength(1);
  });
});

describe('Prompt 05: typed skill aims', () => {
  it('resolves all five aim modes from a cursor with finite directions', () => {
    const origin = { x: 400, y: 470 };
    const pointer = { x: 620, y: 470 };
    expect(resolveSkillAim('SELF', origin, pointer, null)).toEqual({ mode: 'SELF' });
    expect(resolveSkillAim('TARGET_ENTITY', origin, pointer, 'wraith-1')).toEqual({
      mode: 'TARGET_ENTITY', targetId: 'wraith-1'
    });
    expect(resolveSkillAim('GROUND_POSITION', origin, pointer, null)).toEqual({
      mode: 'GROUND_POSITION', position: pointer
    });
    expect(resolveSkillAim('DIRECTION', origin, pointer, null)).toEqual({
      mode: 'DIRECTION', direction: { x: 1, y: 0 }
    });
    expect(resolveSkillAim('AREA', origin, pointer, null)).toEqual({
      mode: 'AREA', position: pointer
    });
    expect(resolveSkillAim('DIRECTION', origin, origin, null)).toBeNull();
    expect(resolveSkillAim('AREA', origin, { x: NaN, y: 4 }, null)).toBeNull();
    expect(SKILLS.MAGE.slot1.kind).toBe('nova');
  });
  it('fires an aimed ground nova centered near the mouse rather than always on the hero', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'MAGE' });
    sim.command({
      type: 'cast', slot: 'slot1',
      aim: { mode: 'AREA', position: { x: 780, y: 520 } }
    });
    const state = sim.snapshot();
    expect(state.cooldowns.slot1).toBeGreaterThan(0);
    expect(state.enemies[0]!.actor.health).toBeLessThan(state.enemies[0]!.actor.maxHealth);
  });
});

describe('Prompt 06: typed damage, shields and real projectiles', () => {
  it('uses a delayed authoritative projectile for a wraith bolt', () => {
    const sim = new GameSimulation();
    const s = sim.snapshot();
    const hero = { ...s.player, x: 850, y: 565 };
    const wraith = s.enemies[0]!;
    const fixed = {
      ...s, player: hero,
      enemies: s.enemies.map((unit, i) => i === 0
        ? { ...unit, cooldown: 0, intent: {
          pattern: 'bolt' as const, x: hero.x, y: hero.y,
          radius: 44, remaining: 0.001, total: wraith.intent?.total ?? 0.8
        } }
        : { ...unit, actor: { ...unit.actor, health: 0, alive: false }, intent: null, effects: [] })
    };
    expect(sim.restore(fixed)).toBe(true);
    advance(sim, 1);
    expect(sim.snapshot().projectiles).toHaveLength(1);
    expect(sim.snapshot().player.health).toBe(hero.health);
    advance(sim, 120);
    expect(sim.snapshot().projectiles).toHaveLength(0);
    expect(sim.drainEvents().some(e => e.type === 'projectileImpact')).toBe(true);
  });
  it('replenishes a shield from paladin consecration and resolves attacks against it', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'reset', classId: 'PALADIN' });
    sim.command({ type: 'cast', slot: 'slot1' });
    expect(sim.snapshot().shield).toBeGreaterThan(0);
    const saved = sim.character();
    expect('shield' in saved).toBe(false);
    expect(sim.restoreCharacter(saved, 10)).toBe(true);
    expect(sim.snapshot().shield).toBe(0);
  });
});
