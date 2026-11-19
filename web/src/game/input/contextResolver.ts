/** Renderer-agnostic mouse picking and command proposal (Prompt 04 foundation).
 * No scene, UI or simulation side effects. GPL-3.0-only.
 */
import type { GameCommand, Point } from '../core/types';
import { isNpcId } from '../world/npcs';
import { isWorldObjectId } from '../world/interactables';

export type ContextKind =
  | 'GROUND' | 'ENEMY' | 'NPC' | 'LOOT' | 'INTERACTABLE' | 'UI' | 'INVALID';

export type ContextTarget = {
  kind: 'ENEMY' | 'NPC' | 'LOOT' | 'INTERACTABLE';
  id: string;
  position: Point;
  hitRadius: number;
  /** A dead enemy is never selectable; non-enemy targets do not need this flag. */
  alive?: boolean;
};

export type PointerContextInput = {
  pointer: Point;
  /** True when a Svelte overlay or another UI layer captured this pointer. */
  uiCaptured: boolean;
  /** Ground collision is supplied by the caller, not by the navigation module. */
  walkable: boolean;
  targets: readonly ContextTarget[];
};

export type ResolvedPointerContext =
  | { kind: 'UI' | 'INVALID' }
  | { kind: 'GROUND'; position: Point }
  | { kind: ContextTarget['kind']; id: string };

export type ContextCursor =
  | 'move' | 'hostile' | 'talk' | 'loot' | 'interact' | 'blocked' | 'ui';

function finitePoint(point: Point): boolean {
  return point != null && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Lower value wins; categories are independent of the input array order. */
function targetPriority(kind: ContextTarget['kind']): number | null {
  switch (kind) {
    case 'NPC': return 0;
    case 'LOOT': return 1;
    case 'ENEMY': return 2;
    case 'INTERACTABLE': return 3;
    default: return null;
  }
}

/**
 * Chooses the highest-priority target under the pointer.
 * Ties are broken by center distance, then by stable, locale-independent ID.
 */
export function resolvePointerContext(input: PointerContextInput): ResolvedPointerContext {
  // UI always wins, even if a world pointer is malformed or an enemy is below it.
  if (input.uiCaptured) return { kind: 'UI' };
  if (!finitePoint(input.pointer)) return { kind: 'INVALID' };

  let selected: ContextTarget | null = null;
  let selectedPriority = Infinity;
  let selectedDistance = Infinity;

  for (const candidate of input.targets) {
    if (!candidate || typeof candidate.id !== 'string' || !candidate.id.trim()
      || !finitePoint(candidate.position)
      || !Number.isFinite(candidate.hitRadius) || candidate.hitRadius <= 0
      || (candidate.kind === 'ENEMY' && candidate.alive === false)) continue;

    const priority = targetPriority(candidate.kind);
    if (priority === null) continue;

    const distance = Math.hypot(
      candidate.position.x - input.pointer.x,
      candidate.position.y - input.pointer.y
    );
    if (!(distance <= candidate.hitRadius)) continue;

    if (!selected || priority < selectedPriority
      || (priority === selectedPriority && (
        distance < selectedDistance
        || (distance === selectedDistance && candidate.id < selected.id)
      ))) {
      selected = candidate;
      selectedPriority = priority;
      selectedDistance = distance;
    }
  }

  if (selected) return { kind: selected.kind, id: selected.id };
  if (input.walkable) {
    return { kind: 'GROUND', position: { x: input.pointer.x, y: input.pointer.y } };
  }
  return { kind: 'INVALID' };
}

/** Data-only cursor hint. Applying the actual cursor/highlight belongs to Phaser. */
export function cursorForContext(context: ResolvedPointerContext): ContextCursor {
  switch (context.kind) {
    case 'GROUND': return 'move';
    case 'ENEMY': return 'hostile';
    case 'NPC': return 'talk';
    case 'LOOT': return 'loot';
    case 'INTERACTABLE': return 'interact';
    case 'UI': return 'ui';
    case 'INVALID': return 'blocked';
  }
}

/** Existing typed commands only. Unknown NPCs and future interactables are inert. */
export function contextToCommand(context: ResolvedPointerContext): GameCommand | null {
  switch (context.kind) {
    case 'GROUND':
      return finitePoint(context.position)
        ? { type: 'move', destination: { x: context.position.x, y: context.position.y } }
        : null;
    case 'ENEMY':
      return context.id.trim() ? { type: 'attack', targetId: context.id } : null;
    case 'LOOT':
      return context.id.trim() ? { type: 'pickup', id: context.id } : null;
    case 'NPC':
      return isNpcId(context.id)
        ? { type: 'interactNpc', npcId: context.id }
        : null;
    case 'INTERACTABLE':
      if (context.id === 'crypt-portal') return { type: 'usePortal' };
      return isWorldObjectId(context.id)
        ? { type: 'interactObject', id: context.id } : null;
    case 'UI':
    case 'INVALID':
      return null;
  }
}
