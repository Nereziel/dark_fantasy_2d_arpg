// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { EnemyPresentation, enemyWindupPose } from '../../src/game/phaser/isometricEnemyPresentation';
import type { EnemyUnit } from '../../src/game/enemies/enemies';
import type { GameEvent } from '../../src/game/core/types';

const unit = (id = 'wolf-1', alive = true): EnemyUnit => ({
  actor: { id, type: 'wolf', x: 120, y: 150, alive, health: alive ? 50 : 0, maxHealth: 50 },
  intent: null, cooldown: 0, effects: []
});
const damage = (targetId: string, amount = 7, dodged = false): GameEvent => ({
  type: 'damageResolved', sourceId: 'hero', targetId, damageType: 'physical',
  damage: amount, absorbed: 0, critical: false, dodged, blocked: false
});

describe('G1/C2.3 authoritative enemy presentation', () => {
  it('uses only anticipation frames while winding up, and the actual intent pattern', () => {
    expect(enemyWindupPose('bolt', 1, 1)).toEqual({ pose: 'cast', frame: 0 });
    expect(enemyWindupPose('sweep', 0.49, 1)).toEqual({ pose: 'attack', frame: 1 });
    expect(enemyWindupPose('leap', 0.001, 1)).toEqual({ pose: 'attack', frame: 1 });
    expect(enemyWindupPose('bolt', 0, 1)).toBeUndefined();
    expect(enemyWindupPose('bolt', 1, 0)).toBeUndefined();
  });
  it('starts contact only on an actual attack event, even on a miss', () => {
    const p = new EnemyPresentation();
    const u = unit();
    p.sync([u], 0);
    expect(p.pose(u.actor.id, 50)).toBeUndefined();
    p.record({ type: 'enemyAttack', enemyId: u.actor.id, hit: false }, [u], 100);
    expect(p.pose(u.actor.id, 100)).toEqual({ pose: 'attack', frame: 2 });
    expect(p.pose(u.actor.id, 250)).toEqual({ pose: 'attack', frame: 3 });
    expect(p.pose(u.actor.id, 500)).toBeUndefined();
  });
  it('casts on launch, not again when a projectile lands', () => {
    const p = new EnemyPresentation();
    const u = unit();
    p.record({ type: 'projectileLaunch', id: 'p1', sourceId: u.actor.id }, [u], 0);
    expect(p.pose(u.actor.id, 1)).toEqual({ pose: 'cast', frame: 2 });
    p.record({ type: 'projectileImpact', id: 'p1', hit: true }, [u], 500);
    p.record({ type: 'enemyAttack', enemyId: u.actor.id, hit: true }, [u], 500);
    expect(p.pose(u.actor.id, 500)).toBeUndefined();
    p.record({ type: 'enemyAttack', enemyId: u.actor.id, hit: true }, [u], 550);
    expect(p.pose(u.actor.id, 550)).toEqual({ pose: 'attack', frame: 2 });
  });
  it('reacts only to real damage and does not fabricate reactions on dodge or zero damage', () => {
    const p = new EnemyPresentation(), u = unit();
    p.record(damage(u.actor.id, 0), [u], 0);
    p.record(damage(u.actor.id, 7, true), [u], 10);
    expect(p.pose(u.actor.id, 10)).toBeUndefined();
    p.record(damage(u.actor.id), [u], 20);
    expect(p.pose(u.actor.id, 20)).toEqual({ pose: 'hit', frame: 1 });
    expect(p.pose(u.actor.id, 110)).toEqual({ pose: 'hit', frame: 2 });
    expect(p.pose(u.actor.id, 240)).toBeUndefined();
  });
  it('renders a short death sequence after authoritative defeat even if the actor was removed', () => {
    const p = new EnemyPresentation(), u = unit();
    p.sync([u], 0);
    p.record({ type: 'defeat', targetId: u.actor.id, kills: 1 }, [], 10);
    p.sync([], 10);
    expect(p.deaths(10)[0]).toMatchObject({ actor: u.actor, pose: 'death', frame: 0 });
    expect(p.deaths(370)[0]?.frame).toBe(3);
    p.sync([], 700);
    expect(p.deaths(700)).toEqual([]);
    p.sync([u], 710);
    expect(p.pose(u.actor.id, 710)).toBeUndefined();
  });
  it('does not confuse despawning, an unknown ID or a restored dead actor with a defeat', () => {
    const p = new EnemyPresentation(), u = unit();
    p.sync([u], 0);
    p.sync([], 20);
    expect(p.deaths(20)).toEqual([]);
    p.record({ type: 'defeat', targetId: 'missing', kills: 2 }, [], 30);
    p.sync([unit('dead', false)], 30);
    expect(p.deaths(30)).toEqual([]);
    p.record({ type: 'defeat', targetId: 'dead', kills: 2 }, [unit('dead', false)], 40);
    p.clear();
    expect(p.deaths(40)).toEqual([]);
  });
  it('clears reactions on actor retirement and suppresses stale corpses on ID reuse', () => {
    const p = new EnemyPresentation(), u = unit();
    p.record(damage(u.actor.id), [u], 0);
    p.sync([], 10);
    expect(p.pose(u.actor.id, 20)).toBeUndefined();
    p.record({ type: 'defeat', targetId: u.actor.id, kills: 2 }, [unit(u.actor.id, false)], 30);
    expect(p.deaths(30)).toHaveLength(1);
    p.sync([u], 40);
    expect(p.deaths(40)).toEqual([]);
  });
  it('uses boss impact and healing events, not guessed damage timestamps', () => {
    const p = new EnemyPresentation(), u = unit('morrow_gravebound');
    p.record({ type: 'miniBossCue', enemyId: u.actor.id, bossId: 'morrow_gravebound',
      kind: 'telegraph', x: 20, y: 30, radius: 70, phase: 1 }, [u], 0);
    expect(p.pose(u.actor.id, 0)).toBeUndefined();
    p.record({ type: 'miniBossCue', enemyId: u.actor.id, bossId: 'morrow_gravebound',
      kind: 'impact', x: 20, y: 30, radius: 70, phase: 1 }, [u], 100);
    expect(p.pose(u.actor.id, 100)?.frame).toBe(2);
    p.record({ type: 'enemyHeal', enemyId: u.actor.id, targetId: 'other', amount: 5 }, [u], 500);
    expect(p.pose(u.actor.id, 500)).toEqual({ pose: 'cast', frame: 2 });
  });
});
