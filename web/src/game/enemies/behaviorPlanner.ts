/**
 * Renderer-independent, stateless tactical decisions.
 *
 * The caller owns cooldown timers, world navigation and action execution. Supply
 * reachability for each proposed kind of movement from the authoritative pathfinder;
 * a plan never teleports an actor or mutates the encounter.
 */
export const ENEMY_BEHAVIOR_IDS = [
  'meleeAggressor', 'rangedAttacker', 'defensive', 'healer', 'summoner',
  'ambusher', 'charger', 'caster', 'support'
] as const;

export type EnemyBehaviorId = typeof ENEMY_BEHAVIOR_IDS[number];

export interface EnemyBehaviorPoint {
  readonly x: number;
  readonly y: number;
}

export interface EnemyBehaviorActor extends EnemyBehaviorPoint {
  readonly id: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
}

export interface EnemyBehaviorAlly extends EnemyBehaviorActor {
  readonly lineOfSight: boolean;
  readonly reachable: boolean;
}

export interface EnemyBehaviorConfig {
  readonly archetypeId: EnemyBehaviorId;
  readonly aggroRange: number;
  readonly attackRange: number;
  readonly preferredDistance: number;
  readonly leashRange: number;
  /** Range for a role-specific ability (ambush, charge, heal, summon or support). */
  readonly specialRange?: number;
  /** Fraction of max HP at which a defensive enemy begins to retreat. */
  readonly fleeHealthRatio?: number;
  /** Fraction of max HP below which a healer prioritizes an ally. */
  readonly healHealthRatio?: number;
}

export interface EnemyBehaviorNavigation {
  readonly targetReachable: boolean;
  readonly originReachable: boolean;
  readonly repositionReachable: boolean;
  readonly retreatReachable: boolean;
  readonly patrolReachable: boolean;
}

export interface EnemyBehaviorContext {
  readonly actor: EnemyBehaviorActor;
  readonly origin: EnemyBehaviorPoint;
  readonly target: EnemyBehaviorActor | null;
  readonly allies?: readonly EnemyBehaviorAlly[];
  readonly config: EnemyBehaviorConfig;
  /** Seconds until ordinary attacks can be used; zero means ready. */
  readonly attackCooldown: number;
  /** Seconds until a role ability can be used; zero means ready. */
  readonly abilityCooldown: number;
  readonly lineOfSight: boolean;
  readonly navigation: EnemyBehaviorNavigation;
  readonly patrolTarget?: EnemyBehaviorPoint | null;
}

export type EnemyBehaviorDecision =
  | { readonly action: 'dead' | 'idle' }
  | { readonly action: 'attack' | 'heal' | 'cast'; readonly targetId: string }
  | { readonly action: 'summon' }
  | {
    readonly action: 'patrol' | 'chase' | 'reposition' | 'flee' | 'return';
    readonly destination: EnemyBehaviorPoint;
  };

const IDLE: EnemyBehaviorDecision = Object.freeze({ action: 'idle' });
const DEAD: EnemyBehaviorDecision = Object.freeze({ action: 'dead' });
const EPSILON = 1;

function validPoint(value: unknown): value is EnemyBehaviorPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<EnemyBehaviorPoint>;
  return typeof point.x === 'number' && Number.isFinite(point.x)
    && typeof point.y === 'number' && Number.isFinite(point.y);
}

function validActor(value: unknown): value is EnemyBehaviorActor {
  if (!validPoint(value)) return false;
  const actor = value as Partial<EnemyBehaviorActor>;
  return typeof actor.id === 'string' && actor.id.trim().length > 0
    && typeof actor.health === 'number' && Number.isFinite(actor.health)
    && typeof actor.maxHealth === 'number' && Number.isFinite(actor.maxHealth)
    && actor.maxHealth > 0 && actor.health >= 0 && actor.health <= actor.maxHealth
    && typeof actor.alive === 'boolean';
}

function validConfig(value: unknown): value is EnemyBehaviorConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<EnemyBehaviorConfig>;
  return ENEMY_BEHAVIOR_IDS.some(id => id === config.archetypeId)
    && typeof config.aggroRange === 'number' && Number.isFinite(config.aggroRange) && config.aggroRange > 0
    && typeof config.attackRange === 'number' && Number.isFinite(config.attackRange) && config.attackRange > 0
    && typeof config.leashRange === 'number' && Number.isFinite(config.leashRange) && config.leashRange > 0
    && typeof config.preferredDistance === 'number' && Number.isFinite(config.preferredDistance)
    && config.preferredDistance >= 0 && config.preferredDistance <= config.attackRange
    && (config.specialRange === undefined || (Number.isFinite(config.specialRange) && config.specialRange > 0))
    && (config.fleeHealthRatio === undefined
      || (Number.isFinite(config.fleeHealthRatio) && config.fleeHealthRatio >= 0 && config.fleeHealthRatio <= 1))
    && (config.healHealthRatio === undefined
      || (Number.isFinite(config.healHealthRatio) && config.healHealthRatio >= 0 && config.healHealthRatio <= 1));
}

function validNavigation(value: unknown): value is EnemyBehaviorNavigation {
  if (!value || typeof value !== 'object') return false;
  const navigation = value as Partial<EnemyBehaviorNavigation>;
  return typeof navigation.targetReachable === 'boolean'
    && typeof navigation.originReachable === 'boolean'
    && typeof navigation.repositionReachable === 'boolean'
    && typeof navigation.retreatReachable === 'boolean'
    && typeof navigation.patrolReachable === 'boolean';
}

function validContext(value: unknown): value is EnemyBehaviorContext {
  if (!value || typeof value !== 'object') return false;
  const ctx = value as Partial<EnemyBehaviorContext>;
  return validActor(ctx.actor) && validPoint(ctx.origin)
    && (ctx.target === null || validActor(ctx.target))
    && validConfig(ctx.config) && validNavigation(ctx.navigation)
    && typeof ctx.lineOfSight === 'boolean'
    && typeof ctx.attackCooldown === 'number' && Number.isFinite(ctx.attackCooldown) && ctx.attackCooldown >= 0
    && typeof ctx.abilityCooldown === 'number' && Number.isFinite(ctx.abilityCooldown) && ctx.abilityCooldown >= 0
    && (ctx.allies === undefined || Array.isArray(ctx.allies))
    && (ctx.patrolTarget === undefined || ctx.patrolTarget === null || validPoint(ctx.patrolTarget));
}

function distance(a: EnemyBehaviorPoint, b: EnemyBehaviorPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function move(action: 'patrol' | 'chase' | 'reposition' | 'flee' | 'return',
  destination: EnemyBehaviorPoint): EnemyBehaviorDecision {
  return validPoint(destination)
    ? { action, destination: { x: destination.x, y: destination.y } }
    : IDLE;
}

function settle(ctx: EnemyBehaviorContext, distanceFromHome: number): EnemyBehaviorDecision {
  if (distanceFromHome > EPSILON) {
    return ctx.navigation.originReachable ? move('return', ctx.origin) : IDLE;
  }
  const patrol = ctx.patrolTarget;
  return patrol && validPoint(patrol) && ctx.navigation.patrolReachable
    && distance(patrol, ctx.origin) <= ctx.config.aggroRange
    ? move('patrol', patrol)
    : IDLE;
}

function stepAway(actor: EnemyBehaviorActor, target: EnemyBehaviorActor, step: number): EnemyBehaviorPoint {
  const dx = actor.x - target.x;
  const dy = actor.y - target.y;
  const length = Math.hypot(dx, dy);
  // A coincident actor pair uses a fixed heading, never a random choice.
  const ux = length > 0 ? dx / length : 1;
  const uy = length > 0 ? dy / length : 0;
  return { x: actor.x + ux * step, y: actor.y + uy * step };
}

function bestAlly(ctx: EnemyBehaviorContext, belowRatio: number): EnemyBehaviorAlly | null {
  let best: EnemyBehaviorAlly | null = null;
  for (const ally of ctx.allies ?? []) {
    if (!validActor(ally) || !ally.alive || ally.health === 0 || ally.id === ctx.actor.id
      || ally.reachable !== true || typeof ally.lineOfSight !== 'boolean') continue;
    const ratio = ally.health / ally.maxHealth;
    if (ratio >= belowRatio || !Number.isFinite(distance(ctx.actor, ally))) continue;
    if (!best || ratio < best.health / best.maxHealth
      || (ratio === best.health / best.maxHealth && ally.id < best.id)) best = ally;
  }
  return best;
}

/**
 * Plans one action without applying it. Invalid input produces idle; a dead actor
 * produces dead. The caller must also validate the returned destination against
 * current collision geometry before executing it.
 */
export function planEnemyBehavior(context: EnemyBehaviorContext): EnemyBehaviorDecision {
  if (!validContext(context)) return IDLE;
  const { actor, origin, target, config, navigation } = context;
  if (!actor.alive || actor.health === 0) return DEAD;

  const fromHome = distance(actor, origin);
  if (!Number.isFinite(fromHome)) return IDLE;
  if (fromHome > config.leashRange) {
    return navigation.originReachable ? move('return', origin) : IDLE;
  }

  // Player death, lost aggro and a target outside the leash cancel all attacks.
  if (!target || !target.alive || target.health === 0) return settle(context, fromHome);
  const toTarget = distance(actor, target);
  const targetFromHome = distance(origin, target);
  if (!Number.isFinite(toTarget) || !Number.isFinite(targetFromHome)) return IDLE;
  if (toTarget > config.aggroRange || targetFromHome > config.leashRange) {
    return settle(context, fromHome);
  }

  const specialRange = config.specialRange ?? config.attackRange;
  const abilityReady = context.abilityCooldown === 0;
  const attackReady = context.attackCooldown === 0;

  if (config.archetypeId === 'ambusher' && toTarget > (config.specialRange ?? config.aggroRange * 0.5)) {
    return settle(context, fromHome);
  }

  // Healing and support actions take precedence over attacking the player.
  if (config.archetypeId === 'healer' && abilityReady) {
    const ally = bestAlly(context, config.healHealthRatio ?? 0.6);
    if (ally) {
      if (distance(actor, ally) <= specialRange && ally.lineOfSight) {
        return { action: 'heal', targetId: ally.id };
      }
      return move('chase', ally);
    }
  }
  if (config.archetypeId === 'support' && abilityReady) {
    const ally = bestAlly(context, 1.01);
    if (ally && distance(actor, ally) <= specialRange && ally.lineOfSight) {
      return { action: 'cast', targetId: ally.id };
    }
  }

  // A blocked path cannot produce a chase or a direct strike in this isolated
  // policy. Ranged attacks across impassable terrain require coordinator rules.
  if (!navigation.targetReachable) return IDLE;

  if (config.archetypeId === 'defensive'
    && actor.health / actor.maxHealth <= (config.fleeHealthRatio ?? 0.25)
    && navigation.retreatReachable) {
    return move('flee', stepAway(actor, target, Math.max(config.attackRange, config.preferredDistance)));
  }

  if (config.archetypeId === 'summoner' && abilityReady && context.lineOfSight
    && toTarget <= specialRange) return { action: 'summon' };

  if (config.archetypeId === 'charger' && abilityReady && context.lineOfSight
    && toTarget > config.attackRange && toTarget <= specialRange) {
    return { action: 'cast', targetId: target.id };
  }

  if (toTarget > config.attackRange || !context.lineOfSight) {
    return move('chase', target);
  }

  if ((config.archetypeId === 'rangedAttacker' || config.archetypeId === 'caster'
    || config.archetypeId === 'support' || config.archetypeId === 'healer')
    && toTarget < config.preferredDistance && navigation.repositionReachable) {
    return move('reposition', stepAway(actor, target, config.preferredDistance - toTarget));
  }

  if (config.archetypeId === 'caster') {
    return abilityReady ? { action: 'cast', targetId: target.id } : IDLE;
  }
  return attackReady ? { action: 'attack', targetId: target.id } : IDLE;
}
