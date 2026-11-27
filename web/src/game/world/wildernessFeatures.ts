/** Seeded, renderer-independent Act I wilderness features. GPL-3.0-only. */
import type { Point } from '../core/types';
import { CAMP, CAMP_RADIUS, CRYPT_GATE, type WorldLayout } from './generator';
import {
  ACTOR_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, canOccupy, findPath, type Obstacle
} from './navigation';
import { WORLD_OBJECTS } from './interactables';
import { NPC_POSITIONS } from './npcs';

/**
 * Stable IDs independent of seed, locale, save state and render instance.
 * The coordinator maps eventKind to Agent 25's quest event catalog; this
 * module never emits a live quest event or grants a reward.
 */
export const MANDATORY_FEATURE_IDS = [
  'act1.corruption_site',
  'act1.corrupted_forest',
  'act1.abandoned_graveyard',
  'act1.evidence_lead',
  'act1.grave_warden',
  'act1.tainted_beasts',
  'act1.crypt_entrance'
] as const;

export type MandatoryFeatureId = typeof MANDATORY_FEATURE_IDS[number];
export type OptionalFeatureId = `wild.poi.${number}` | `wild.treasure.${number}`
  | `wild.event.${number}` | `wild.encounter.${number}`;
export type WildernessFeatureId = MandatoryFeatureId | OptionalFeatureId;
export type WildernessFeatureKind =
  | 'corruption' | 'forest' | 'graveyard' | 'evidence'
  | 'miniBoss' | 'encounterZone' | 'cryptEntrance'
  | 'poi' | 'treasure' | 'event';

export const FEATURE_EVENT_KINDS: Readonly<Record<MandatoryFeatureId, string>> = {
  'act1.corruption_site': 'corruption_discovered',
  'act1.corrupted_forest': 'forest_discovered',
  'act1.abandoned_graveyard': 'graveyard_discovered',
  'act1.evidence_lead': 'evidence_recovered',
  'act1.grave_warden': 'mini_boss_defeated',
  'act1.tainted_beasts': 'tainted_beast_defeated',
  'act1.crypt_entrance': 'crypt_entered'
};

export interface WildernessFeature {
  readonly id: WildernessFeatureId;
  readonly kind: WildernessFeatureKind;
  readonly position: Readonly<Point>;
  /** A visual / encounter marker radius, NOT a newly added collision shape. */
  readonly radius: number;
  readonly mandatory: boolean;
  /** Stable localization key to be defined by the coordinator in both locales. */
  readonly presentationKey: string;
  /** Intended quest event kind, not an automatically dispatched event. */
  readonly eventKind: string | null;
  /** Renderer hint only; this does not modify terrain or the authoritative world. */
  readonly visualKey: string;
}

export type FeaturePlanErrorCode =
  | 'INVALID_SEED' | 'INVALID_LAYOUT'
  | 'UNREACHABLE_MANDATORY' | 'MANDATORY_PLACEMENT_FAILED'
  | 'DUNGEON_ANCHOR_PLACEMENT_FAILED';

export type FeaturePlanResult =
  | { readonly ok: true; readonly seed: number; readonly features: readonly WildernessFeature[] }
  | { readonly ok: false; readonly error: {
    readonly code: FeaturePlanErrorCode;
    readonly featureId?: MandatoryFeatureId;
  } };

interface FeatureSpec {
  readonly id: MandatoryFeatureId;
  readonly kind: WildernessFeatureKind;
  readonly anchor: Readonly<Point>;
  readonly radius: number;
  readonly presentationKey: string;
  readonly visualKey: string;
}

const SPECS: readonly FeatureSpec[] = [
  { id: 'act1.corruption_site', kind: 'corruption', anchor: { x: 1550, y: 280 },
    radius: 52, presentationKey: 'world.corruptionSite', visualKey: 'corruption' },
  { id: 'act1.corrupted_forest', kind: 'forest', anchor: { x: 1370, y: 940 },
    radius: 54, presentationKey: 'world.corruptedForest', visualKey: 'corrupted_forest' },
  { id: 'act1.abandoned_graveyard', kind: 'graveyard', anchor: { x: 1900, y: 690 },
    radius: 50, presentationKey: 'world.abandonedGraveyard', visualKey: 'graveyard' },
  { id: 'act1.evidence_lead', kind: 'evidence', anchor: { x: 870, y: 1050 },
    radius: 26, presentationKey: 'world.evidenceLead', visualKey: 'quest_evidence' },
  { id: 'act1.grave_warden', kind: 'miniBoss', anchor: { x: 1760, y: 1140 },
    radius: 68, presentationKey: 'world.graveWarden', visualKey: 'miniboss_anchor' },
  { id: 'act1.tainted_beasts', kind: 'encounterZone', anchor: { x: 1050, y: 860 },
    radius: 56, presentationKey: 'world.taintedBeasts', visualKey: 'tainted_beast_zone' }
];

const CRYPT: FeatureSpec = {
  id: 'act1.crypt_entrance', kind: 'cryptEntrance', anchor: CRYPT_GATE,
  radius: 30, presentationKey: 'world.cryptEntrance', visualKey: 'crypt_gate'
};
const SEPARATION = 12;
const NPC_CLEARANCE = 75;
const MAX_OBSTACLES = 512;
const MAX_ENCOUNTERS = 128;
const GRID_STEP = 64;
const MAX_MANDATORY_CANDIDATES = 256;
const MAX_OPTIONAL_ATTEMPTS = 96;
// The mine/cave can be optional to the story, but their exterior anchors
// must exist in the full Act I world and remain distinct from the crypt.
export const ACT_I_DUNGEON_ENTRANCE_SPACING = 96;

const error = (code: FeaturePlanErrorCode, featureId?: MandatoryFeatureId): FeaturePlanResult =>
  featureId === undefined ? { ok: false, error: { code } }
    : { ok: false, error: { code, featureId } };

function validSeed(seed: unknown): seed is number {
  return typeof seed === 'number' && Number.isSafeInteger(seed)
    && seed >= 0 && seed <= 0xffffffff;
}

function point(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<Point>;
  return typeof p.x === 'number' && Number.isFinite(p.x)
    && typeof p.y === 'number' && Number.isFinite(p.y);
}

function dist(a: Readonly<Point>, b: Readonly<Point>): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function wallDistance(p: Readonly<Point>, wall: Readonly<Obstacle>): number {
  const x = Math.max(wall.x, Math.min(p.x, wall.x + wall.width));
  const y = Math.max(wall.y, Math.min(p.y, wall.y + wall.height));
  return Math.hypot(p.x - x, p.y - y);
}

/**
 * Structural validation before calling the existing pathfinder, whose inputs
 * are assumed to be finite and whose grid size is fixed. No caller input is
 * repaired in place. A mismatched layout seed is explicitly rejected.
 */
function validLayout(seed: number, value: unknown): value is Readonly<WorldLayout> {
  if (!value || typeof value !== 'object') return false;
  const layout = value as Partial<WorldLayout>;
  if (!validSeed(layout.seed) || layout.seed !== seed || !point(layout.camp)
    || layout.camp.x !== CAMP.x || layout.camp.y !== CAMP.y
    || !Array.isArray(layout.obstacles) || !Array.isArray(layout.encounterPositions)
    || layout.obstacles.length > MAX_OBSTACLES
    || layout.encounterPositions.length === 0 || layout.encounterPositions.length > MAX_ENCOUNTERS) return false;

  const ids = new Set(WORLD_OBJECTS.map(o => o.id as string));
  for (const obstacle of layout.obstacles) {
    if (!obstacle || typeof obstacle !== 'object' || typeof obstacle.id !== 'string'
      || !obstacle.id.trim() || ids.has(obstacle.id)
      || !Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.y)
      || !Number.isFinite(obstacle.width) || !Number.isFinite(obstacle.height)
      || obstacle.width <= 0 || obstacle.height <= 0 || obstacle.x < 0 || obstacle.y < 0
      || obstacle.x + obstacle.width > WORLD_WIDTH
      || obstacle.y + obstacle.height > WORLD_HEIGHT) return false;
    ids.add(obstacle.id);
    // No wall may occupy the original safe town clearing.
    if (wallDistance(layout.camp, obstacle) < CAMP_RADIUS) return false;
  }

  const obstacles: readonly Obstacle[] = layout.obstacles;
  if (!canOccupy(layout.camp, ACTOR_RADIUS, obstacles)) return false;
  for (const npc of Object.values(NPC_POSITIONS)) {
    if (!canOccupy(npc, ACTOR_RADIUS, obstacles) || findPath(layout.camp, npc, ACTOR_RADIUS, obstacles).length === 0) return false;
  }
  for (const item of WORLD_OBJECTS.filter(item => item.zone === 'wilderness')) {
    if (!canOccupy(item.position, ACTOR_RADIUS, obstacles)) return false;
  }
  if (!canOccupy(CRYPT_GATE, ACTOR_RADIUS, obstacles)) return false;

  for (let i = 0; i < layout.encounterPositions.length; i++) {
    const encounter = layout.encounterPositions[i];
    if (!point(encounter) || !canOccupy(encounter, ACTOR_RADIUS, obstacles)
      || dist(encounter, layout.camp) <= CAMP_RADIUS + ACTOR_RADIUS) return false;
    for (let j = 0; j < i; j++) {
      if (dist(encounter, layout.encounterPositions[j]!) < ACTOR_RADIUS * 2) return false;
    }
  }
  return true;
}

function makeFeature(spec: FeatureSpec, position: Point): WildernessFeature {
  return {
    id: spec.id,
    kind: spec.kind,
    position: { x: position.x, y: position.y },
    radius: spec.radius,
    mandatory: true,
    presentationKey: spec.presentationKey,
    eventKind: FEATURE_EVENT_KINDS[spec.id],
    visualKey: spec.visualKey
  };
}

/** Valid for an actor to reach; features do not place new obstacles. */
function validPosition(
  position: Point, radius: number, layout: Readonly<WorldLayout>,
  placed: readonly WildernessFeature[], isPortal: boolean
): boolean {
  if (!point(position) || !canOccupy(position, ACTOR_RADIUS, layout.obstacles)
    || dist(position, layout.camp) <= CAMP_RADIUS + radius + SEPARATION) return false;

  for (const npc of Object.values(NPC_POSITIONS)) {
    if (dist(position, npc) <= NPC_CLEARANCE + radius) return false;
  }
  for (const obj of WORLD_OBJECTS) {
    if (obj.zone === 'wilderness' && dist(position, obj.position) < radius + obj.hitRadius + SEPARATION) return false;
  }
  for (const encounter of layout.encounterPositions) {
    if (dist(position, encounter) < radius + ACTOR_RADIUS + 32) return false;
  }
  for (const feature of placed) {
    if (dist(position, feature.position) < radius + feature.radius + SEPARATION) return false;
  }

  // Existing dungeon portal coordinates must not be shifted to clear a wall:
  // only the authoritative actor-collision/path checks apply to the gate.
  if (!isPortal) {
    for (const obstacle of layout.obstacles) {
      if (wallDistance(position, obstacle) < ACTOR_RADIUS + 16) return false;
    }
  }
  return true;
}

function reachable(layout: Readonly<WorldLayout>, destination: Point): boolean {
  return findPath(layout.camp, destination, ACTOR_RADIUS, layout.obstacles).length > 0;
}

function mandatoryCandidates(anchor: Readonly<Point>): Point[] {
  const candidates: Point[] = [{ x: anchor.x, y: anchor.y }];
  const cells: Point[] = [];
  for (let y = 72; y <= WORLD_HEIGHT - 72; y += GRID_STEP) {
    for (let x = 72; x <= WORLD_WIDTH - 72; x += GRID_STEP) {
      cells.push({ x, y });
    }
  }
  cells.sort((a, b) => {
    const delta = (a.x - anchor.x) ** 2 + (a.y - anchor.y) ** 2
      - ((b.x - anchor.x) ** 2 + (b.y - anchor.y) ** 2);
    return delta || a.y - b.y || a.x - b.x;
  });
  candidates.push(...cells.slice(0, MAX_MANDATORY_CANDIDATES - 1));
  return candidates;
}

/** A tiny seeded PRNG owned by this invocation, never global simulation RNG. */
function seededRandom(seed: number): () => number {
  let state = (seed ^ 0x6d2b79f5) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plans mandatory story anchors and optional encounters, treasures and events
 * over a previously validated WorldLayout. All retries are finite. The returned
 * manifest is plain JSON-compatible data, not a save/world snapshot.
 *
 * Failed mandatory placement returns an error; it never returns a partial plan.
 * Ordinary optional placement may omit an entry after MAX_OPTIONAL_ATTEMPTS.
 * The two dungeon POIs instead try a bounded deterministic grid fallback;
 * if even that fails, reject the feature plan so runtime can retry its layout.
 */
export function planWildernessFeatures(seed: number, layout: Readonly<WorldLayout>): FeaturePlanResult {
  if (!validSeed(seed)) return error('INVALID_SEED');
  if (!validLayout(seed, layout)) return error('INVALID_LAYOUT');

  const features: WildernessFeature[] = [];
  if (!validPosition(CRYPT_GATE, CRYPT.radius, layout, features, true)) {
    return error('INVALID_LAYOUT', CRYPT.id);
  }
  if (!reachable(layout, CRYPT_GATE)) return error('UNREACHABLE_MANDATORY', CRYPT.id);

  // Reserve the original portal before selecting any other feature positions.
  const portal = makeFeature(CRYPT, CRYPT_GATE);
  features.push(portal);
  for (const encounter of layout.encounterPositions) {
    if (!reachable(layout, encounter)) return error('INVALID_LAYOUT');
  }

  const mandatory: WildernessFeature[] = [];
  for (const spec of SPECS) {
    let selected: WildernessFeature | null = null;
    for (const candidate of mandatoryCandidates(spec.anchor)) {
      if (!validPosition(candidate, spec.radius, layout, features, false)) continue;
      if (!reachable(layout, candidate)) continue;
      selected = makeFeature(spec, candidate);
      break;
    }
    if (!selected) return error('MANDATORY_PLACEMENT_FAILED', spec.id);
    features.push(selected);
    mandatory.push(selected);
  }
  mandatory.push(portal);

  const rng = seededRandom(seed);
  const optionals: WildernessFeature[] = [];
  const variants = [
    { category: 'encounter' as const, kind: 'encounterZone' as const,
      count: 2, radius: 48, presentationKey: 'world.optionalEncounter', eventKind: 'optional_encounter_discovered',
      visualKey: 'wilderness_encounter' },
    { category: 'poi' as const, kind: 'poi' as const,
      count: 3, radius: 26, presentationKey: 'world.optionalPoi', eventKind: 'poi_discovered',
      visualKey: 'wilderness_poi' },
    { category: 'treasure' as const, kind: 'treasure' as const,
      count: 2, radius: 22, presentationKey: 'world.optionalTreasure', eventKind: 'treasure_discovered',
      visualKey: 'wilderness_treasure' },
    { category: 'event' as const, kind: 'event' as const,
      count: 2, radius: 28, presentationKey: 'world.optionalEvent', eventKind: 'world_event_discovered',
      visualKey: 'wilderness_event' }
  ];

  for (const variant of variants) {
    for (let index = 0; index < variant.count; index++) {
      const id: OptionalFeatureId = `wild.${variant.category}.${index + 1}`;
      const dungeonAnchor = id === 'wild.poi.2' || id === 'wild.poi.3';
      const acceptable = (position: Point): boolean =>
        validPosition(position, variant.radius, layout, features, false)
        && (!dungeonAnchor || features.every(f =>
          (f.id !== CRYPT.id && f.id !== 'wild.poi.2' && f.id !== 'wild.poi.3')
          || dist(position, f.position) >= ACT_I_DUNGEON_ENTRANCE_SPACING))
        && reachable(layout, position);
      let position: Point | undefined;
      let lastCandidate: Point = layout.camp;
      for (let attempt = 0; attempt < MAX_OPTIONAL_ATTEMPTS; attempt++) {
        lastCandidate = {
          x: Math.round(80 + rng() * (WORLD_WIDTH - 160)),
          y: Math.round(80 + rng() * (WORLD_HEIGHT - 160))
        };
        if (!acceptable(lastCandidate)) continue;
        position = lastCandidate;
        break;
      }
      if (!position && dungeonAnchor) {
        // Keep the seeded preference and use no extra random draws. All
        // fallback points undergo the same clearance and reachability checks.
        position = mandatoryCandidates(lastCandidate).find(acceptable);
        if (!position) return error('DUNGEON_ANCHOR_PLACEMENT_FAILED');
      }
      if (!position) continue;
      const feature: WildernessFeature = {
        id, kind: variant.kind, position, radius: variant.radius,
        mandatory: false, presentationKey: variant.presentationKey,
        eventKind: variant.eventKind, visualKey: variant.visualKey
      };
      features.push(feature);
      optionals.push(feature);
    }
  }
  // Mandatory story order is stable independently of placement/reservation order.
  return { ok: true, seed, features: [...mandatory, ...optionals] };
}
