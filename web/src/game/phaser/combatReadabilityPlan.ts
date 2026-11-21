/**
 * Issue #128: non-color, deterministic combat-readability markers.
 * Pure presentation geometry derived only from already-resolved combat events.
 * No simulation ticks, damage, movement, random numbers, or sound playback.
 * Original project code: GPL-3.0-only.
 */
export interface ReadabilityPoint {
  readonly x: number;
  readonly y: number;
}

export interface ReadabilityLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export type CombatReadabilityInput =
  | Readonly<{
      type: 'telegraph';
      threat: 'boss' | 'miniboss' | 'trap';
      position: ReadabilityPoint;
      radius: number;
      /** Hollow King uses an angular cone; minibosses use a directed hit corridor. */
      shape?: 'circle' | 'cone' | 'line';
      angleRadians?: number;
      arcDegrees?: number;
      /** Miniboss actor position at the authoritative telegraph event. */
      origin?: ReadabilityPoint;
      /** Exact forward range (distinct from half-width radius for a miniboss). */
      range?: number;
      /** Presentation duration from the authoritative ability windup. */
      durationSeconds?: number;
    }>
  | Readonly<{
      type: 'impact';
      position: ReadabilityPoint;
      outcome: 'hit' | 'blocked' | 'dodged';
      damage: number;
      critical?: boolean;
    }>;

export interface CombatReadabilityCue {
  readonly kind: 'warning' | 'critical' | 'blocked' | 'dodged';
  readonly position: ReadabilityPoint;
  readonly radius: number;
  /** Stays visible for the same duration as the existing warning ring. */
  readonly durationMs: number;
  readonly strokeWidth: number;
  readonly color: number;
  readonly ring: boolean;
  /** Exclusive with ring; world-accurate cone boundaries in radians. */
  readonly sector?: Readonly<{ fromRadians: number; toRadians: number }>;
  /** Miniboss line/cone footprint, coordinates relative to the cue position. */
  readonly polygon?: readonly ReadabilityPoint[];
  /** Distinct outlined geometry, readable without relying only on hue or text. */
  readonly segments: readonly ReadabilityLine[];
}

const MAX_WORLD_COORDINATE = 1_000_000;
const finitePoint = (p: ReadabilityPoint | null | undefined): p is ReadabilityPoint =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && Math.abs(p.x) <= MAX_WORLD_COORDINATE
  && Math.abs(p.y) <= MAX_WORLD_COORDINATE;

const point = (p: ReadabilityPoint): ReadabilityPoint =>
  Object.freeze({ x: p.x, y: p.y });

const segment = (x1: number, y1: number, x2: number, y2: number): ReadabilityLine =>
  Object.freeze({ x1, y1, x2, y2 });

function buildWarning(radius: number): ReadabilityLine[] {
  const lines: ReadabilityLine[] = [];
  // Eight external ticks make the danger radius recognizable on small displays.
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    lines.push(segment(dx * radius * 0.86, dy * radius * 0.86,
      dx * radius * 1.1, dy * radius * 1.1));
  }
  // Central exclamation silhouette, not a language-dependent character.
  const scale = Math.min(22, radius * 0.42);
  lines.push(segment(0, -scale, 0, scale * 0.3));
  lines.push(segment(0, scale * 0.72, 0, scale * 0.89));
  lines.push(segment(-scale * 0.38, -scale * 1.05, 0, -scale * 1.22));
  lines.push(segment(0, -scale * 1.22, scale * 0.38, -scale * 1.05));
  return lines;
}

/** Sector boundary and directional chevrons entirely inside the real hit region. */
function buildCone(radius: number, fromRadians: number, toRadians: number): ReadabilityLine[] {
  const at = (angle: number, fraction: number): ReadabilityPoint => ({
    x: Math.cos(angle) * radius * fraction,
    y: Math.sin(angle) * radius * fraction
  });
  const lines: ReadabilityLine[] = [];
  const line = (a: ReadabilityPoint, b: ReadabilityPoint): void => {
    lines.push(segment(a.x, a.y, b.x, b.y));
  };
  // Both radial boundaries and a bounded eight-segment arc show real coverage.
  line({ x: 0, y: 0 }, at(fromRadians, 1));
  for (let i = 0; i < 8; i++) {
    const step = (toRadians - fromRadians) / 8;
    line(at(fromRadians + i * step, 1),
      at(fromRadians + (i + 1) * step, 1));
  }
  line(at(toRadians, 1), { x: 0, y: 0 });
  const angle = (fromRadians + toRadians) / 2;
  const spread = Math.min(0.19, (toRadians - fromRadians) / 4);
  line(at(angle, 0.22), at(angle, 0.68));
  line(at(angle - spread, 0.49), at(angle, 0.68));
  line(at(angle + spread, 0.49), at(angle, 0.68));
  return lines;
}

/** Mini-boss strike geometry must mirror GameSimulation.miniBossHit.
 * A line is a rectangular corridor. A miniboss cone widens by exactly
 * max(18, along * 0.58) from the boss toward the locked aim point.
 * Both footprints are visual only, not alternative hit calculations.
 */
function buildMinibossFootprint(
  shape: 'line' | 'cone', radius: number, range: number,
  origin: ReadabilityPoint, aim: ReadabilityPoint
): { polygon: ReadabilityPoint[]; segments: ReadabilityLine[] } | null {
  const dx = aim.x - origin.x, dy = aim.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1) return null;
  const fx = dx / length, fy = dy / length;
  const sideX = -fy, sideY = fx;
  const vertex = (along: number, sideways: number): ReadabilityPoint =>
    ({ x: fx * along + sideX * sideways, y: fy * along + sideY * sideways });

  // miniBossHit additionally rejects distance(player,boss) > range, even
  // when the player is inside the rectangular or widening corridor. The true
  // footprint is the intersection with a disc around the caster. Its far end
  // is curved, not a full-width flat cap.
  const floorEnd = 18 / 0.58;
  const coneCrossover = range / Math.hypot(1, 0.58);
  const arcStart = shape === 'line'
    ? Math.sqrt(Math.max(0, range * range - radius * radius))
    : coneCrossover >= floorEnd
      ? coneCrossover : Math.sqrt(Math.max(0, range * range - 18 * 18));
  const lateralWidth = (along: number): number => Math.min(
    shape === 'line' ? radius : Math.max(18, along * 0.58),
    Math.sqrt(Math.max(0, range * range - along * along))
  );
  const distances = [0];
  // Include changes in the boundary function exactly. A straight chord
  // across the kink could otherwise protrude outside the hit predicate.
  if (shape === 'cone' && floorEnd < arcStart) distances.push(floorEnd);
  if (arcStart > 0 && arcStart < range) distances.push(arcStart);
  // Eight bounded segments approximate the radial arc from INSIDE the disc;
  // no polygon edge may mark a location outside the authoritative hit zone.
  for (let i = 1; i <= 8; i++) {
    const along = arcStart + (range - arcStart) * i / 8;
    if (along > distances[distances.length - 1]! + 1e-9)
      distances.push(along);
  }
  if (distances[distances.length - 1]! < range) distances.push(range);
  const upper = distances.map(along => vertex(along, lateralWidth(along)));
  // Omit the repeated zero-width nose to keep a simple closed polygon.
  const lower = distances.slice(0, -1).reverse().map(along =>
    vertex(along, -lateralWidth(along)));
  const polygon = [...upper, ...lower];

  // Graphic markings indicate forward direction even for monochrome display.
  const mid = vertex(range * 0.7, 0);
  const arrowStart = vertex(range * 0.49, 0);
  const arrowLeft = vertex(range * 0.57, 9);
  const arrowRight = vertex(range * 0.57, -9);
  const root = vertex(range * 0.2, 0);
  const segments = [
    segment(root.x, root.y, mid.x, mid.y),
    segment(arrowLeft.x, arrowLeft.y, mid.x, mid.y),
    segment(arrowRight.x, arrowRight.y, mid.x, mid.y),
    segment(arrowStart.x, arrowStart.y, mid.x, mid.y)
  ];
  return { polygon, segments };
}

function buildCritical(): ReadabilityLine[] {
  const lines: ReadabilityLine[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    lines.push(segment(dx * 8, dy * 8, dx * 25, dy * 25));
  }
  lines.push(segment(0, -11, 11, 0), segment(11, 0, 0, 11),
    segment(0, 11, -11, 0), segment(-11, 0, 0, -11));
  return lines;
}

function buildBlock(): ReadabilityLine[] {
  // Angular shield outline plus a large unmistakable horizontal bar.
  const p: ReadabilityPoint[] = [
    { x: 0, y: -22 }, { x: 18, y: -14 }, { x: 16, y: 6 },
    { x: 0, y: 22 }, { x: -16, y: 6 }, { x: -18, y: -14 }
  ];
  const lines = p.map((value, index) => {
    const next = p[(index + 1) % p.length]!;
    return segment(value.x, value.y, next.x, next.y);
  });
  lines.push(segment(-10, -1, 10, -1), segment(0, -12, 0, 11));
  return lines;
}

function buildDodge(): ReadabilityLine[] {
  // Paired offset chevrons communicate avoidance instead of impact.
  return [-12, 0, 12].flatMap(x => [
    segment(x - 7, -12, x + 1, 0),
    segment(x + 1, 0, x - 7, 12)
  ]);
}

function makeCue(
  kind: CombatReadabilityCue['kind'],
  position: ReadabilityPoint,
  radius: number,
  durationMs: number,
  color: number,
  strokeWidth: number,
  ring: boolean,
  lines: ReadabilityLine[],
  sector?: Readonly<{ fromRadians: number; toRadians: number }>,
  polygon?: readonly ReadabilityPoint[]
): CombatReadabilityCue {
  return Object.freeze({
    kind, position: point(position), radius, durationMs,
    color, strokeWidth, ring,
    ...(sector ? { sector: Object.freeze({ ...sector }) } : {}),
    ...(polygon ? { polygon: Object.freeze(polygon.map(value => point(value))) } : {}),
    segments: Object.freeze(lines)
  });
}

/**
 * Returns null when no extra marker is warranted. The existing damage VFX
 * renders ordinary hits; this layer only distinguishes threats and outcomes.
 */
export function planCombatReadability(
  event: CombatReadabilityInput
): CombatReadabilityCue | null {
  if (!event || !finitePoint(event.position)) return null;

  if (event.type === 'telegraph') {
    if (event.threat !== 'boss' && event.threat !== 'miniboss' && event.threat !== 'trap')
      return null;
    if (!Number.isFinite(event.radius) || event.radius <= 0) return null;
    const shape = event.shape ?? 'circle';
    if (shape !== 'circle' && shape !== 'cone' && shape !== 'line') return null;
    if (event.durationSeconds !== undefined
      && (!Number.isFinite(event.durationSeconds) || event.durationSeconds <= 0
        || event.durationSeconds > 2.5)) return null;
    const isMinibossFootprint = event.threat === 'miniboss'
      && (shape === 'line' || shape === 'cone');
    if (shape === 'line' && !isMinibossFootprint) return null;
    if (shape === 'cone' && !isMinibossFootprint && (!Number.isFinite(event.angleRadians)
      || Math.abs(event.angleRadians!) > Math.PI
      || !Number.isFinite(event.arcDegrees) || event.arcDegrees! <= 0
      || event.arcDegrees! > 360)) return null;
    const radius = Math.max(18, Math.min(140, event.radius));
    const durationMs = event.durationSeconds === undefined
      ? event.threat === 'boss' ? 700 : event.threat === 'miniboss' ? 800 : 850
      : Math.round(event.durationSeconds * 1000);
    const color = event.threat === 'boss' ? 0xfbe0a7 : event.threat === 'miniboss'
      ? 0xffd19b : 0xf4d8b0;
    if (isMinibossFootprint) {
      if (!finitePoint(event.origin) || !Number.isFinite(event.range)
        || event.range! <= 0 || event.range! > 400
        || event.radius > 140) return null;
      const footprint = buildMinibossFootprint(shape as 'line' | 'cone',
        radius, event.range!, event.origin, event.position);
      if (!footprint) return null;
      return makeCue('warning', event.origin, radius, durationMs,
        color, 4, false, footprint.segments, undefined, footprint.polygon);
    }
    if (shape === 'cone') {
      const halfArc = event.arcDegrees! * Math.PI / 360;
      const sector = Object.freeze({
        fromRadians: event.angleRadians! - halfArc,
        toRadians: event.angleRadians! + halfArc
      });
      return makeCue('warning', event.position, radius, durationMs,
        color, 4, false, buildCone(radius, sector.fromRadians, sector.toRadians), sector);
    }
    return makeCue('warning', event.position, radius, durationMs,
      color, 4, true, buildWarning(radius));
  }

  if (event.type !== 'impact' || !Number.isFinite(event.damage) || event.damage < 0
    || !['hit', 'blocked', 'dodged'].includes(event.outcome)
    || (event.critical !== undefined && typeof event.critical !== 'boolean')) return null;

  if (event.outcome === 'dodged') return makeCue('dodged', event.position,
    25, 380, 0xb5f1de, 3, false, buildDodge());
  if (event.outcome === 'blocked') return makeCue('blocked', event.position,
    23, 400, 0xb5dcfa, 3, false, buildBlock());
  if (event.critical === true && event.damage > 0) return makeCue('critical',
    event.position, 26, 360, 0xffe6a1, 3, false, buildCritical());
  return null;
}
