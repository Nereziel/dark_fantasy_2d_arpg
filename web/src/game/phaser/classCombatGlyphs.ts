/**
 * Issue #128: six distinct hero combat silhouettes baked into the sprite atlas.
 * Pure pixel positions; all gameplay / hit timing remains in GameSimulation.
 * GPL-3.0-only — original Aether & Ruin art.
 */
import type { ClassId } from '../data/classes';
import type { PixelActor, PixelAnimation } from './pixelSpriteAtlas';

export interface ClassCombatMark {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
}

type GlyphPose = 'attack' | 'cast' | 'hit' | 'block';
type PixelDot = readonly [number, number];
type HeroGlyphs = Readonly<Record<GlyphPose, readonly PixelDot[]>>;

export const HERO_GLYPH_CLASSES = Object.freeze([
  'WARRIOR', 'PALADIN', 'MAGE', 'ROGUE', 'NECROMANCER', 'WARLOCK'
] as const satisfies readonly ClassId[]);

/** The eye can distinguish weapon/sigil shapes without their colors.
 * All positions are inside one 48x56 sprite cell; zero new sprites/tweens.
 */
const GLYPHS: Readonly<Record<ClassId, HeroGlyphs>> = {
  // A descending, sweeping steel blade and a crown-like battle shout.
  WARRIOR: {
    attack: [[29,32],[31,28],[33,25],[35,22],[37,19],[39,16],[41,13],[43,10]],
    cast: [[16,10],[18,7],[21,11],[24,6],[27,11],[30,7],[32,10]],
    hit: [[18,29],[20,31],[22,33],[24,35],[26,33],[28,31]],
    block: [[13,25],[15,23],[17,23],[19,25],[19,31],[17,34],[15,34],[13,31]]
  },
  // Hammer head / upright golden cross, shield edge on impact.
  PALADIN: {
    attack: [[35,15],[38,15],[41,15],[38,18],[38,21],[38,24],[38,27],[35,27]],
    cast: [[37,8],[37,11],[37,14],[34,14],[40,14],[37,17],[37,20],[37,23]],
    hit: [[20,29],[22,27],[24,29],[26,31],[24,34],[22,34]],
    block: [[15,23],[17,21],[19,23],[19,30],[17,34],[15,30],[17,26]]
  },
  // Lightning forks versus a four-direction arcane star.
  MAGE: {
    attack: [[32,11],[37,13],[34,18],[40,20],[35,24],[42,27],[39,31]],
    cast: [[37,8],[37,12],[37,16],[33,16],[41,16],[35,20],[39,20],[37,24]],
    hit: [[19,28],[23,26],[25,30],[21,33],[27,35],[24,37]],
    block: [[17,23],[21,25],[25,23],[27,28],[23,32],[19,32],[15,28]]
  },
  // Paired fast daggers and twin offset evasion chevrons.
  ROGUE: {
    attack: [[29,23],[32,20],[35,17],[38,14],[35,30],[38,27],[41,24],[44,21]],
    cast: [[32,12],[35,15],[32,18],[39,12],[42,15],[39,18],[35,22],[39,22]],
    hit: [[17,27],[21,30],[17,33],[25,27],[29,30],[25,33]],
    block: [[13,28],[17,24],[21,28],[25,24],[29,28],[21,33]]
  },
  // Bone claws / unmistakable skull-shaped death sigil.
  NECROMANCER: {
    attack: [[31,21],[33,18],[35,15],[37,21],[39,18],[41,15],[35,26],[39,26]],
    cast: [[34,11],[37,9],[40,11],[33,15],[41,15],[34,19],[37,21],[40,19],[37,16]],
    hit: [[19,28],[23,30],[20,33],[24,35],[22,38],[26,31]],
    block: [[16,24],[20,22],[24,24],[26,28],[24,33],[20,35],[16,33],[14,28]]
  },
  // Forking void claws / angular hex-diamond rift.
  WARLOCK: {
    attack: [[31,12],[35,16],[38,20],[41,16],[44,12],[35,25],[41,25],[38,29]],
    cast: [[37,8],[33,13],[37,18],[41,13],[37,23],[33,28],[41,28],[37,33]],
    hit: [[19,27],[23,25],[27,29],[25,34],[21,36],[17,32]],
    block: [[17,21],[21,24],[25,21],[29,26],[25,32],[21,35],[17,32],[13,26]]
  }
};

const PALETTE: Readonly<Record<ClassId, readonly [string, string]>> = Object.freeze({
  WARRIOR: ['#ffe4af', '#bc8250'],
  PALADIN: ['#fff2b9', '#d4a356'],
  MAGE: ['#d8f3ff', '#71b8ee'],
  ROGUE: ['#d5ffe3', '#65bfaa'],
  NECROMANCER: ['#aaf3c8', '#5cb699'],
  WARLOCK: ['#efd3ff', '#b076d1']
});

const EMPTY: readonly ClassCombatMark[] = Object.freeze([]);

/** Windup (frame 1) shows only a partial silhouette; impact (frame 2) is
 * complete at pixelTimelineFrame's authoritative contact tick. Reactions keep
 * their own complete glyph. Recovery returns to the original sprite art.
 */
export function pixelClassCombatMarks(
  actor: PixelActor,
  animation: PixelAnimation,
  frame: number
): readonly ClassCombatMark[] {
  if (frame !== 1 && frame !== 2) return EMPTY;
  if (!Object.prototype.hasOwnProperty.call(GLYPHS, actor)) return EMPTY;
  const pose: GlyphPose | null = animation === 'channel' || animation === 'cast'
    ? 'cast' : animation === 'attack' ? 'attack'
      : animation === 'hit' ? 'hit' : animation === 'block' ? 'block' : null;
  if (!pose) return EMPTY;
  const hero = actor as ClassId;
  const pattern = GLYPHS[hero][pose];
  const count = frame === 1 && (pose === 'attack' || pose === 'cast')
    ? Math.max(2, Math.ceil(pattern.length / 2)) : pattern.length;
  const [light, shadow] = PALETTE[hero];
  return Object.freeze(pattern.slice(0, count).map(([x, y], index) => Object.freeze({
    x, y, size: frame === 2 && index % 3 === 0 ? 3 : 2,
    color: index % 3 === 1 ? shadow : light
  })));
}
