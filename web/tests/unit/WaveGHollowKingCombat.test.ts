import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildHollowKingRuntime } from '../../src/game/bosses/hollowKingRuntime';
import { canOccupy, ACTOR_RADIUS } from '../../src/game/world/navigation';
import { buildCryptWorld } from '../../src/game/world/dungeonRuntime';

function tick(sim: GameSimulation, frames: number): void {
  for (let i = 0; i < frames; i++) sim.advance(16.667);
}

function enterCrypt(sim: GameSimulation): void {
  sim.command({ type: 'usePortal' });
  for (let i = 0; i < 240 && sim.snapshot().zone !== 'crypt'; i++) sim.advance(16.667);
  expect(sim.snapshot().zone).toBe('crypt');
}

function killGuardian(sim: GameSimulation, index: number): void {
  const snapshot = sim.snapshot();
  const target = snapshot.enemies[index]!.actor;
  expect(sim.restore({
    ...snapshot, player: { ...snapshot.player, x: target.x - 34, y: target.y },
    enemies: snapshot.enemies.map((unit, i) => ({
      ...unit, actor: { ...unit.actor, health: i === index ? 1 : unit.actor.health },
      cooldown: 6, intent: null, effects: []
    })), selectedTargetId: null
  })).toBe(true);
  sim.command({ type: 'attack', targetId: target.id });
  for (let i = 0; i < 140 && sim.snapshot().enemies[index]?.actor.alive; i++) sim.advance(16.667);
  expect(sim.snapshot().enemies[index]!.actor.alive).toBe(false);
}

function reachKing(sim: GameSimulation): void {
  enterCrypt(sim);
  for (let i = 0; i < 3; i++) killGuardian(sim, i);
  tick(sim, 210);
  const state = sim.snapshot();
  expect(state.dungeonStage).toBe(1);
  expect(state.enemies[0]!.actor.id).toBe('crypt_lord-4');
}

describe('Wave G Hollow King combat integration', () => {
  it.each([0, 1, 42])('uses a reachable genuine boss arena in runtime seed %s', seed => {
    const runtime = buildHollowKingRuntime(seed, 500);
    const layout = buildCryptWorld(seed).layout;
    expect(runtime.initial.actorId).toBe('crypt_lord-4');
    for (const p of [runtime.arena.safePoint, runtime.arena.escapePoint]) {
      expect(canOccupy(p, ACTOR_RADIUS, layout.obstacles)).toBe(true);
    }
    expect(new GameSimulation(seed).snapshot().hollowKing).toBeNull();
  });

  it('retains stage/actor identity and begins a telegraphed three-phase fight', () => {
    const sim = new GameSimulation(42);
    reachKing(sim);
    const first = sim.snapshot();
    const boss = first.enemies[0]!.actor;
    expect(first.hollowKing?.maxHealth).toBe(boss.maxHealth);
    expect(first.hollowKing?.phase).toBe(1);
    const safe = first.hollowKing!.arena.safePoint;
    expect(sim.restore({
      ...first, player: { ...first.player, ...safe }
    })).toBe(true);
    sim.drainEvents();
    tick(sim, 2);
    const intro = sim.snapshot();
    expect(intro.hollowKing?.revision).toBeGreaterThan(0);
    expect(intro.hollowKing?.phase).toBe(1);
    expect(intro.hollowKing?.mode).toBe('telegraph');
    expect(intro.hollowKing?.warning?.windupSeconds).toBeGreaterThan(0.5);
    expect(sim.drainEvents().some(e => e.type === 'hollowKingCue'
      && e.kind === 'telegraph')).toBe(true);

    const half = sim.snapshot();
    expect(sim.restore({ ...half, enemies: half.enemies.map((u, i) => ({
      ...u, actor: { ...u.actor, health: i === 0 ? Math.floor(boss.maxHealth * 0.55) : u.actor.health }
    })) })).toBe(true);
    tick(sim, 1);
    expect(sim.snapshot().hollowKing?.phase).toBe(2);

    const last = sim.snapshot();
    expect(sim.restore({ ...last, enemies: last.enemies.map((u, i) => ({
      ...u, actor: { ...u.actor, health: i === 0 ? Math.floor(boss.maxHealth * 0.2) : u.actor.health }
    })) })).toBe(true);
    tick(sim, 1);
    expect(sim.snapshot().hollowKing?.phase).toBe(3);
    expect(sim.snapshot().hollowKing?.warning).toBeNull();
    expect(sim.snapshot().enemies[0]!.actor.id).toBe('crypt_lord-4');
    expect(sim.character()).not.toHaveProperty('hollowKing');
    expect(sim.worldProgress()).not.toHaveProperty('hollowKing');
    expect(sim.restore({ ...sim.snapshot(), hollowKingAddActorIds: { fake: 'summon-1-3' } }))
      .toBe(false);
  });

  it('continues original Act I boss quest and dungeon clear rules with exactly-once loot', () => {
    const sim = new GameSimulation(0);
    reachKing(sim);
    const before = sim.snapshot();
    const target = before.enemies[0]!.actor;
    expect(sim.restore({
      ...before, player: { ...before.player, x: target.x - 34, y: target.y },
      enemies: before.enemies.map((unit, index) => ({
        ...unit, actor: { ...unit.actor, health: index === 0 ? 1 : unit.actor.health },
        cooldown: 6, intent: null, effects: []
      })), selectedTargetId: null
    })).toBe(true);
    sim.command({ type: 'attack', targetId: target.id });
    for (let i = 0; i < 140 && sim.snapshot().enemies[0]!.actor.alive; i++) sim.advance(16.667);
    expect(sim.snapshot().enemies[0]!.actor.alive).toBe(false);
    expect(sim.snapshot().hollowKing?.deathEmitted).toBe(true);
    const gold = sim.snapshot().gold;
    tick(sim, 3);
    expect(sim.snapshot().gold).toBe(gold);
    expect(sim.drainEvents().filter(event => event.type === 'defeat'
      && event.targetId === 'crypt_lord-4')).toHaveLength(1);
  });
});
