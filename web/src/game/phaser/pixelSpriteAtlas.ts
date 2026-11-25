/**
 * Original, GPL-3.0-only procedural pixel-art frame atlas.
 * Deterministic 4-frame sequences for ten named combat animations. All 6 hero
 * classes and 16 enemy sprites share the same pixel scale but have distinct
 * silhouettes, armor, weapons, colors and locomotion. No external assets.
 *
 * All drawing runs once at Phaser scene creation, never on a simulation tick.
 * Gameplay and collision remain owned by GameSimulation.
 */
import type { CombatTimelineState } from '../animation/combatTimeline';
import type { ClassId } from '../data/classes';
import type { EnemyType } from '../enemies/enemies';
import { pixelClassCombatMarks } from './classCombatGlyphs';
import type { DirectionalPixelView } from './isometricActorFacing';

export const PIXEL_ANIMATIONS = [
  'idle', 'walk', 'run', 'attack', 'cast', 'channel', 'hit', 'block', 'dodge', 'death'
] as const;
export type PixelAnimation = typeof PIXEL_ANIMATIONS[number];
export const PIXEL_FRAME_WIDTH = 48;
export const PIXEL_FRAME_HEIGHT = 56;
export const PIXEL_ANIMATION_FRAMES = 4;

/** Four visual frames align their contact pose to the authoritative damage tick.
 * Before impact only anticipation frames play. Contact is exactly frame 2,
 * independent of the action's overall recovery/channel duration.
 */
export function pixelTimelineFrame(state: Readonly<CombatTimelineState>): number {
  if (state.phase === 'complete' || state.phase === 'cancelled' || state.phase === 'dead') return 3;
  const impact = state.impactTick ?? state.windupTicks;
  if (state.elapsedTicks < impact) {
    return state.elapsedTicks * 2 < impact ? 0 : 1;
  }
  if (state.elapsedTicks === impact) return 2;
  if (state.phase === 'sustain') return 2 + Math.floor((state.elapsedTicks - impact) / 8) % 2;
  return 3;
}

export type PixelActor = ClassId | EnemyType;
export type PixelActorShape = 'warrior' | 'mage' | 'rogue' | 'cleric'
  | 'skeleton' | 'ghost' | 'beast' | 'spider' | 'boar' | 'cultist' | 'bandit'
  | 'brute' | 'undead' | 'archer' | 'mageEnemy';

export interface PixelActorLook {
  readonly shape: PixelActorShape;
  readonly body: string;
  readonly highlight: string;
  readonly shadow: string;
  readonly accent: string;
  readonly skin: string;
}

const ARMOR = '#353c4d';
const METAL = '#c0bdb2';
const BONE = '#d8cba9';
export const PIXEL_ACTOR_LOOKS: Readonly<Record<PixelActor, PixelActorLook>> = Object.freeze({
  WARRIOR: { shape:'warrior',body:'#626a78',highlight:'#aab0b4',shadow:'#252d3d',accent:'#c4a172',skin:'#ddbb97' },
  PALADIN: { shape:'cleric',body:'#8a7952',highlight:'#d9cb90',shadow:'#34374a',accent:'#f4d47b',skin:'#e7c79d' },
  MAGE: { shape:'mage',body:'#4a537e',highlight:'#798dbc',shadow:'#252848',accent:'#76c8f2',skin:'#dbb99e' },
  ROGUE: { shape:'rogue',body:'#4b5459',highlight:'#8a9792',shadow:'#222d34',accent:'#a0d2af',skin:'#ddc0aa' },
  NECROMANCER: { shape:'mage',body:'#485d52',highlight:'#83a48b',shadow:'#1e3236',accent:'#94e0c5',skin:'#dfcab0' },
  WARLOCK: { shape:'mage',body:'#5c4169',highlight:'#9974a8',shadow:'#29223c',accent:'#d094dd',skin:'#d7b3b0' },
  wraith: { shape:'ghost',body:'#544c6e',highlight:'#9991bd',shadow:'#222039',accent:'#d6a0db',skin:'#b5a6c5' },
  skeleton: { shape:'skeleton',body:'#b6ad95',highlight:BONE,shadow:'#48464d',accent:'#9b8e68',skin:BONE },
  skeletonArcher: { shape:'archer',body:'#aaa68e',highlight:BONE,shadow:'#45434d',accent:'#8f7b5e',skin:BONE },
  skeletonMage: { shape:'mageEnemy',body:'#72648b',highlight:'#bbb0c8',shadow:'#352f53',accent:'#a9a0ee',skin:BONE },
  ghoul: { shape:'undead',body:'#62705e',highlight:'#9a9f75',shadow:'#303c37',accent:'#d2b078',skin:'#adb18c' },
  zombie: { shape:'undead',body:'#5b6250',highlight:'#8d936a',shadow:'#313b36',accent:'#936e7b',skin:'#abac89' },
  wolf: { shape:'beast',body:'#514940',highlight:'#968276',shadow:'#272831',accent:'#bc8e79',skin:'#bba08d' },
  spider: { shape:'spider',body:'#4b4650',highlight:'#756a6e',shadow:'#26262e',accent:'#a3d06f',skin:'#8d8088' },
  corruptedBoar: { shape:'boar',body:'#68444b',highlight:'#9b6260',shadow:'#30272f',accent:'#d69c87',skin:'#b0877e' },
  banditFighter: { shape:'bandit',body:'#6d6057',highlight:'#a28e78',shadow:'#302f37',accent:'#c0b399',skin:'#d0a98d' },
  banditArcher: { shape:'archer',body:'#54624c',highlight:'#8da07c',shadow:'#283138',accent:'#e0bc81',skin:'#cfa78b' },
  banditRogue: { shape:'rogue',body:'#535059',highlight:'#817c8e',shadow:'#292631',accent:'#a9d0c7',skin:'#cfac93' },
  fanatic: { shape:'cultist',body:'#6e4147',highlight:'#a86564',shadow:'#32212f',accent:'#e7b375',skin:'#d1ac91' },
  cultMage: { shape:'mageEnemy',body:'#51395c',highlight:'#8c608c',shadow:'#2d253c',accent:'#c282d9',skin:'#c9ac9b' },
  cultHealer: { shape:'cleric',body:'#525d4c',highlight:'#94a98b',shadow:'#273439',accent:'#a8d8a7',skin:'#d7b8a0' },
  crypt_lord: { shape:'brute',body:'#53505e',highlight:'#92808d',shadow:'#252436',accent:'#d26d79',skin:'#ccc1ba' }
});

export function pixelAtlasKey(actor: PixelActor): string { return 'ar-pixel-' + actor; }
/** Distinct lazy texture cache keys; the orthographic atlas stays untouched. */
export function directionalPixelAtlasKey(actor: PixelActor, view: DirectionalPixelView): string {
  return pixelAtlasKey(actor) + '-iso-' + view;
}
export function pixelFrame(animation: PixelAnimation, frame: number): string {
  return animation + '-' + Math.max(0, Math.min(3, Math.floor(Number.isFinite(frame) ? frame : 0)));
}

/** Last line of defense: never paint into another animation cell. */
function paintCellRect(ctx: CanvasRenderingContext2D, color: string,
  x: number, y: number, w: number, h: number): void {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(PIXEL_FRAME_WIDTH, Math.round(x) + w);
  const bottom = Math.min(PIXEL_FRAME_HEIGHT, Math.round(y) + h);
  if (right <= left || bottom <= top) return;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, right - left, bottom - top);
}

/** One 48×56 pixel-art frame, rooted at feet for collision/health-bar alignment. */
function paintFrame(ctx: CanvasRenderingContext2D, actor: PixelActor, look: PixelActorLook,
  animation: PixelAnimation, frame: number, view: DirectionalPixelView): void {
  const run = animation === 'run' || animation === 'dodge';
  const stride = animation === 'walk' || run ? [-3,1,4,-1][frame]! : 0;
  const bob = animation === 'idle' || animation === 'channel' ? [0,-1,0,1][frame]!
    : run ? [0,-2,0,-2][frame]! : 0;
  const striking = animation === 'attack' && frame >= 1 && frame <= 2;
  const casting = animation === 'cast' || animation === 'channel';
  const hit = animation === 'hit' && frame >= 1;
  const falling = animation === 'death';
  // Keep the body and equipment inside the original pivot-centered cell.
  // Wide creatures use shorter lateral shifts; their legs/head still move
  // relative to the body. This is visual only, never collision displacement.
  const shift = animation === 'dodge' ? [-4,-2,2,4][frame]! : hit ? 2 : 0;
  const x = 24 + (look.shape === 'spider' ? Math.max(-2, Math.min(2, shift)) : shift);
  const y = falling ? 0 : bob;
  // Earlier death poses collapse toward the planted foot line instead of
  // translating an upright sprite down into the next row of the atlas.
  const collapse = falling && frame < 3 ? [0.84,0.62,0.38][frame]! : 1;
  const rect = (target: CanvasRenderingContext2D, color: string,
    rx: number, ry: number, w: number, h: number): void => {
    const top = Math.round(51 + (ry - 51) * collapse);
    const bottom = Math.round(51 + (ry + h - 51) * collapse);
    paintCellRect(target, color, rx, top, w, Math.max(1, bottom - top));
  };
  if (falling && frame >= 3) {
    rect(ctx,look.shadow,10,46,29,5);
    rect(ctx,look.body,12,43,25,4);
    rect(ctx,look.accent,35,44,5,3);
    return;
  }
  rect(ctx,'#10131d',x-13,50,27,4);

  if (look.shape === 'spider') {
    rect(ctx,look.shadow,x-13,30+y,27,16);
    rect(ctx,look.body,x-12,28+y,24,15);
    rect(ctx,look.highlight,x-6,28+y,12,6);
    for(let i=0;i<4;i++) {
      const leftFoot = Math.max(0, x-22-i%2*2);
      const rightFoot = Math.min(PIXEL_FRAME_WIDTH-4, x+18+i%2*2);
      rect(ctx,look.shadow,leftFoot+2,28+i*4+y,x-10-leftFoot-2,2);
      rect(ctx,look.shadow,x+10,28+i*4+y,rightFoot+2-x-10,2);
      rect(ctx,look.body,leftFoot,29+i*4+y,4,11);
      rect(ctx,look.body,rightFoot,29+i*4+y,4,11);
    }
    if (view === 's') {
      rect(ctx,look.accent,x-6,36+y,4,4);
      rect(ctx,look.accent,x+3,36+y,4,4);
    } else if (view === 'n' || view === 'ne') {
      rect(ctx,look.highlight,x-4,29+y,8,6);
      if (view === 'ne') rect(ctx,look.accent,x+9,29+y,3,3);
    } else {
      rect(ctx,look.accent,x+10,view === 'e' ? 32+y : 37+y,4,4);
    }
    return;
  }
  if (look.shape === 'beast' || look.shape === 'boar') {
    rect(ctx,look.shadow,x-17,31+y,31,15);
    rect(ctx,look.body,x-15,29+y,30,15);
    rect(ctx,look.highlight,x-7,28+y,18,5);
    // The existing south view retains the legacy silhouette. Other views
    // move the muzzle/head rather than rotating the complete upright sprite.
    const headX = Math.min(PIXEL_FRAME_WIDTH-19, view === 'n' ? x-7 : view === 'ne' ? x+3 : x+8);
    const headY = view === 'n' ? 19+y : view === 'ne' ? 20+y : view === 'se' ? 28+y : 23+y;
    rect(ctx,look.body,headX,headY,15,15);
    if (view !== 'n') {
      rect(ctx,look.skin,headX+8,headY+7,8,6);
      rect(ctx,look.accent,headX+7,headY+5,4,3);
    }
    rect(ctx,look.shadow,x-14-stride,41+y,7,10);
    rect(ctx,look.shadow,x+7+stride,41+y,7,10);
    rect(ctx,look.body,headX+2,headY-4,6,7);
    rect(ctx,look.body,headX+10,headY-3,5,7);
    if (look.shape==='boar' && view !== 'n') rect(ctx,BONE,headX+12,headY+13,7,3);
    else rect(ctx,look.shadow,Math.max(0,x-23),30+y,9,4);
    return;
  }
  if (look.shape === 'ghost') {
    rect(ctx,look.shadow,x-13,18+y,27,30);
    rect(ctx,look.body,x-12,16+y,24,30);
    rect(ctx,look.highlight,x-9,13+y,18,20);
    for(let i=0;i<4;i++) rect(ctx,look.body,x-12+i*7,43+y+(frame+i)%3,5,5);
    if (view === 's') {
      rect(ctx,look.accent,x-7,22+y,5,4);
      rect(ctx,look.accent,x+3,22+y,5,4);
      rect(ctx,look.shadow,x-3,30+y,6,11);
    } else if (view === 'n' || view === 'ne') {
      rect(ctx,look.body,x-6,20+y,12,16);
      if (view === 'ne') rect(ctx,look.accent,x+7,21+y,3,3);
    } else {
      rect(ctx,look.accent,x+(view === 'e' ? 7 : 4),23+y,5,4);
      rect(ctx,look.shadow,x+4,30+y,6,11);
    }
    return;
  }
  const skeleton = look.shape==='skeleton' || look.shape==='archer'
    || look.shape==='mageEnemy' && look.skin===BONE;
  const broad = look.shape==='brute';
  const hood = look.shape==='cultist' || look.shape==='mage' || look.shape==='mageEnemy'
    || look.shape==='rogue' || look.shape==='cleric';
  const legSpread = stride;
  rect(ctx,look.shadow,x-10-legSpread,39+y,8,12);
  rect(ctx,look.shadow,x+3+legSpread,39+y,8,12);
  rect(ctx,look.body,x-10-legSpread,39+y,7,8);
  rect(ctx,look.body,x+4+legSpread,39+y,7,8);
  if (broad) {
    rect(ctx,look.shadow,x-17,20+y,34,23);
    rect(ctx,look.body,x-15,18+y,30,23);
  } else {
    rect(ctx,look.shadow,x-13,23+y,26,21);
    rect(ctx,look.body,x-11,22+y,22,21);
  }
  rect(ctx,look.highlight,x-9,23+y,18,5);
  if (view === 'n' || view === 'ne') rect(ctx,look.shadow,x-3,26+y,6,13);
  else rect(ctx,look.accent,x-3,26+y,6,13);
  if (skeleton) {
    for(let i=0;i<3;i++) rect(ctx,look.shadow,x-8,28+i*4+y,16,2);
  } else if (view === 'n' || view === 'ne') {
    rect(ctx,look.highlight,x-7,27+y,14,2);
    rect(ctx,look.shadow,x-8,35+y,16,3);
  }
  rect(ctx,look.shadow,x-10,10+y,20,15);
  rect(ctx,hood?look.shadow:look.skin,x-8,11+y,16,15);
  if (view === 's') rect(ctx,skeleton?BONE:look.skin,x-6,14+y,12,10);
  else if (view === 'se' || view === 'e') rect(ctx,skeleton?BONE:look.skin,x+1,14+y,view === 'e' ? 7 : 10,10);
  else rect(ctx,look.body,x-7,13+y,14,11);
  rect(ctx,hood?look.body:look.highlight,x-11,8+y,22,8);
  if(look.shape==='cleric') rect(ctx,look.accent,x-2,7+y,4,18);
  if(look.shape==='brute') rect(ctx,look.accent,x-14,9+y,28,5);
  const eye = skeleton?'#252b34':'#24232d';
  if (view === 's') {
    rect(ctx,eye,x-6,17+y,4,3);
    rect(ctx,eye,x+3,17+y,4,3);
  } else if (view === 'se') {
    rect(ctx,eye,x+1,17+y,3,3);
    rect(ctx,eye,x+7,17+y,3,3);
  } else if (view === 'e') {
    rect(ctx,eye,x+6,17+y,3,3);
  } else if (view === 'ne') {
    rect(ctx,look.skin,x+7,16+y,3,5);
  }
  rect(ctx,look.shadow,x-16,26+y,6,15);
  rect(ctx,look.body,x-16,25+y,5,13);
  const armLift = striking || casting ? -10 : 0;
  rect(ctx,look.shadow,x+10,26+armLift+y,6,15);
  rect(ctx,look.body,x+11,25+armLift+y,5,12);
  if(look.shape === 'archer') {
    const bowX = Math.min(x+18,PIXEL_FRAME_WIDTH-5);
    rect(ctx,look.accent,bowX,13+armLift+y,3,31);
    rect(ctx,METAL,bowX+4,14+armLift+y,1,28);
    rect(ctx,look.accent,x-18,28+y,15,2);
  } else if(look.shape==='mage'||look.shape==='mageEnemy'||look.shape==='cultist'||look.shape==='cleric') {
    const staffX = Math.min(x+16,PIXEL_FRAME_WIDTH-7);
    rect(ctx,look.shadow,staffX+2,17+armLift+y,3,31);
    rect(ctx,look.accent,staffX,14+armLift+y,7,6);
    const spellWidth = 12+frame%2*2;
    if(casting) rect(ctx,look.accent,Math.min(x+13,PIXEL_FRAME_WIDTH-spellWidth),
      Math.max(0,7+armLift+y),spellWidth,5);
  } else if(look.shape==='rogue') {
    const bladeX = Math.min(x+16,PIXEL_FRAME_WIDTH-14);
    rect(ctx,METAL,bladeX,22+armLift+y,14,3);
    rect(ctx,look.accent,bladeX+3,19+armLift+y,3,8);
    rect(ctx,METAL,Math.max(0,x-20),26+y,10,2);
  } else {
    const weaponX = Math.min(x+13,PIXEL_FRAME_WIDTH-10);
    rect(ctx,ARMOR,weaponX+1,20+armLift+y,4,17);
    rect(ctx,METAL,weaponX+3,12+armLift+y,5,14);
    rect(ctx,look.accent,weaponX,24+armLift+y,10,4);
  }
  if(look.shape==='bandit') rect(ctx,look.accent,x-4,12+y,9,4);
  if(hit) rect(ctx,'#e4a897',x-13,27+y,5,5);
  if(animation==='block') {
    rect(ctx,look.shadow,x-21,23+y,15,19);
    rect(ctx,look.highlight,x-20,24+y,13,17);
    rect(ctx,look.accent,x-14,27+y,3,12);
  }
  // Contact ornaments are baked once, into the correct pre-impact/impact
  // frame. There is no per-tick particle allocation or new combat authority.
  for (const mark of pixelClassCombatMarks(actor, animation, frame))
    rect(ctx, mark.color, mark.x, mark.y, mark.size, mark.size);
}

/** Generates a complete Phaser-ready atlas canvas with named frames. */
export function renderPixelAtlas(actor: PixelActor, view: DirectionalPixelView = 's'): HTMLCanvasElement {
  const look = PIXEL_ACTOR_LOOKS[actor];
  const canvas = document.createElement('canvas');
  canvas.width = PIXEL_FRAME_WIDTH * PIXEL_ANIMATION_FRAMES;
  canvas.height = PIXEL_FRAME_HEIGHT * PIXEL_ANIMATIONS.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Pixel atlas requires Canvas2D');
  ctx.imageSmoothingEnabled = false;
  PIXEL_ANIMATIONS.forEach((animation,row) => {
    for(let frame=0;frame<PIXEL_ANIMATION_FRAMES;frame++) {
      ctx.save();
      ctx.translate(frame*PIXEL_FRAME_WIDTH,row*PIXEL_FRAME_HEIGHT);
      paintFrame(ctx,actor,look,animation,frame,view);
      ctx.restore();
    }
  });
  return canvas;
}
