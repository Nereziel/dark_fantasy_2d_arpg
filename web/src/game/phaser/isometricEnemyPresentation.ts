// GPL-3.0-only — transient renderer state; no combat or persistence authority.
import type { GameEvent, GameSnapshot, Point } from '../core/types';
import { MINI_BOSS_DEFINITIONS } from '../enemies/miniBossRules';
import type { AttackPattern, EnemySnapshot, EnemyUnit } from '../enemies/enemies';
import type { PixelAnimation } from './pixelSpriteAtlas';

export interface EnemyPose { pose: PixelAnimation; frame: number }
type Cue = { pose: 'attack' | 'cast' | 'hit'; started: number };
type Death = { actor: EnemySnapshot; started: number };
const DEATH_MS = 640;
const MAX_DEATHS = 32;

/** Active windup cannot display contact or recovery, even just before impact. */
export function enemyWindupPose(pattern: AttackPattern, remaining: number, total: number): EnemyPose | undefined {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || remaining <= 0 || total <= 0) return;
  return { pose: pattern === 'bolt' ? 'cast' : 'attack', frame: remaining > total / 2 ? 0 : 1 };
}

function kingPattern(ability?: string): AttackPattern {
  return ability === 'raise_dead' || ability === 'grave_circle' || ability === 'rune_storm'
    ? 'bolt' : 'sweep';
}

function miniPattern(boss: keyof typeof MINI_BOSS_DEFINITIONS, abilityId?: string | null): AttackPattern {
  const ability = MINI_BOSS_DEFINITIONS[boss].abilities.find(a => a.id === abilityId);
  return ability && ['support', 'hazard', 'summon'].includes(ability.effect) ? 'bolt' : 'sweep';
}

/** Read the real pending attack from the relevant simulation snapshot. */
export function snapshotEnemyWindup(state: Pick<GameSnapshot, 'miniBossStates' | 'hollowKing' | 'player'>,
  unit: EnemyUnit): (EnemyPose & { aim: Point }) | undefined {
  const king = state.hollowKing;
  if (king?.actorId === unit.actor.id && king.mode === 'telegraph' && king.warning) {
    const w = king.warning;
    const pose = enemyWindupPose(kingPattern(w.ability), w.remainingSeconds, w.windupSeconds);
    const aim = w.geometry.shape === 'cone'
      ? { x: unit.actor.x + Math.cos(w.geometry.angleRadians) * 10,
          y: unit.actor.y + Math.sin(w.geometry.angleRadians) * 10 }
      : w.geometry.position;
    return pose && { ...pose, aim };
  }
  const mini = state.miniBossStates?.[unit.actor.id];
  if (mini?.stage === 'windup' && mini.lockedPoint) {
    const ability = MINI_BOSS_DEFINITIONS[mini.bossId].abilities.find(a => a.id === mini.activeAbilityId);
    const pose = ability && enemyWindupPose(miniPattern(mini.bossId, ability.id),
      mini.remainingSeconds, ability.windupSeconds);
    return pose && { ...pose, aim: mini.lockedPoint };
  }
  const intent = unit.intent;
  if (!intent) return;
  const pose = enemyWindupPose(intent.pattern, intent.remaining, intent.total);
  return pose && { ...pose, aim: intent.pattern === 'sweep' ? state.player : intent };
}

/** Bounded, disposable view memory. Only published events may start reactions. */
export class EnemyPresentation {
  private readonly known = new Map<string, EnemySnapshot>();
  private readonly cues = new Map<string, Cue>();
  private readonly dead = new Map<string, Death>();
  private projectileImpact = false;

  clear(): void {
    this.known.clear();
    this.cues.clear();
    this.dead.clear();
    this.projectileImpact = false;
  }

  sync(units: readonly EnemyUnit[], now: number): void {
    this.known.clear();
    for (const unit of units) {
      const actor = unit.actor;
      this.known.set(actor.id, { ...actor });
      // A reused slot is a new living actor, never a continuation of a corpse.
      if (actor.alive) this.dead.delete(actor.id);
    }
    for (const [id] of this.cues) {
      if (!this.known.get(id)?.alive || !this.pose(id, now)) this.cues.delete(id);
    }
    for (const [id, death] of this.dead) {
      if (now - death.started >= DEATH_MS) this.dead.delete(id);
    }
  }

  record(event: GameEvent, units: readonly EnemyUnit[], now: number): void {
    const afterProjectile = this.projectileImpact;
    // GameSimulation emits projectileImpact immediately followed by enemyAttack.
    // The latter is the projectile result, not another attack by its caster.
    this.projectileImpact = event.type === 'projectileImpact';
    let id: string | undefined;
    let pose: Cue['pose'] | undefined;
    switch (event.type) {
      case 'defeat': {
        const actor = units.find(u => u.actor.id === event.targetId)?.actor
          ?? this.known.get(event.targetId);
        if (!actor || this.dead.has(actor.id)) return;
        this.cues.delete(actor.id);
        if (this.dead.size >= MAX_DEATHS) {
          const oldest = this.dead.keys().next().value;
          if (oldest !== undefined) this.dead.delete(oldest);
        }
        this.dead.set(actor.id, { actor: { ...actor }, started: now });
        return;
      }
      case 'enemyAttack':
        if (afterProjectile) return;
        id = event.enemyId; pose = 'attack'; break;
      case 'projectileLaunch':
        id = event.sourceId; pose = 'cast'; break;
      case 'enemyHeal':
        id = event.enemyId; pose = 'cast'; break;
      case 'damageResolved':
        if (event.damage <= 0 || event.dodged) return;
        id = event.targetId; pose = 'hit'; break;
      case 'miniBossCue':
        if (event.kind !== 'impact') return;
        id = event.enemyId; pose = miniPattern(event.bossId, event.abilityId) === 'bolt' ? 'cast' : 'attack'; break;
      case 'hollowKingCue':
        if (event.kind !== 'hitWindow') return;
        id = 'crypt_lord-4'; pose = kingPattern(event.ability) === 'bolt' ? 'cast' : 'attack'; break;
      default: return;
    }
    if (!id || !pose || !units.some(u => u.actor.id === id && u.actor.alive)) return;
    this.cues.set(id, { pose, started: now });
  }

  pose(id: string, now: number): EnemyPose | undefined {
    const cue = this.cues.get(id);
    if (!cue) return;
    const elapsed = Math.max(0, now - cue.started);
    if (cue.pose === 'hit') {
      if (elapsed >= 200) return;
      return { pose: 'hit', frame: elapsed < 80 ? 1 : elapsed < 150 ? 2 : 3 };
    }
    if (elapsed >= 280) return;
    return { pose: cue.pose, frame: elapsed < 120 ? 2 : 3 };
  }

  deaths(now: number): (Death & EnemyPose)[] {
    const result: (Death & EnemyPose)[] = [];
    for (const death of this.dead.values()) {
      const elapsed = Math.max(0, now - death.started);
      if (elapsed >= DEATH_MS) continue;
      result.push({ ...death, pose: 'death', frame: Math.min(3, Math.floor(elapsed / 120)) });
    }
    return result;
  }
}
