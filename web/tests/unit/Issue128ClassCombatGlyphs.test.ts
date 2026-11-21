/** Issue #128: original six-class attack/cast/hit silhouettes and exact hit-frame gating. */
import { describe, expect, it, vi } from 'vitest';
import { HERO_GLYPH_CLASSES, pixelClassCombatMarks } from '../../src/game/phaser/classCombatGlyphs';
import { pixelTimelineFrame, renderPixelAtlas } from '../../src/game/phaser/pixelSpriteAtlas';
import { startCombatTimeline } from '../../src/game/animation/combatTimeline';

describe('Issue 128: distinct six-class pixel combat presentation', () => {
  it('has six different non-color silhouettes for attack, cast, hit and block', () => {
    expect(HERO_GLYPH_CLASSES).toHaveLength(6);
    for (const animation of ['attack', 'cast', 'hit', 'block'] as const) {
      const silhouettes = HERO_GLYPH_CLASSES.map(actor => {
        const marks = pixelClassCombatMarks(actor, animation, 2);
        expect(marks.length).toBeGreaterThanOrEqual(6);
        return JSON.stringify(marks.map(mark => [mark.x, mark.y, mark.size]));
      });
      expect(new Set(silhouettes).size).toBe(6);
    }
  });

  it('gates windup, impact and recovery glyphs to the authoritative contact frame', () => {
    const start = startCombatTimeline({
      animation: 'attack', actionId: 'basicAttack', windupTicks: 11, recoveryTicks: 16
    }).state;
    const windup = pixelTimelineFrame({ ...start, elapsedTicks: 10, phase: 'windup' });
    const impact = pixelTimelineFrame({ ...start, elapsedTicks: 11, phase: 'recovery' });
    const after = pixelTimelineFrame({ ...start, elapsedTicks: 12, phase: 'recovery' });
    expect(windup).toBe(1);
    expect(impact).toBe(2);
    expect(after).toBe(3);
    for (const actor of HERO_GLYPH_CLASSES) {
      const anticipation = pixelClassCombatMarks(actor, 'attack', windup);
      const contact = pixelClassCombatMarks(actor, 'attack', impact);
      expect(anticipation.length).toBeLessThan(contact.length);
      expect(pixelClassCombatMarks(actor, 'attack', after)).toHaveLength(0);
      expect(pixelClassCombatMarks(actor, 'attack', 0)).toHaveLength(0);
      expect(pixelClassCombatMarks(actor, 'cast', 2).length)
        .toBeGreaterThan(pixelClassCombatMarks(actor, 'cast', 1).length);
      expect(pixelClassCombatMarks(actor, 'channel', 2))
        .toEqual(pixelClassCombatMarks(actor, 'cast', 2));
    }
  });

  it('keeps marks inside the sprite cell and freezes bounded 40-actor projections', () => {
    const copies = Array.from({ length: 40 }, (_, i) =>
      pixelClassCombatMarks(HERO_GLYPH_CLASSES[i % 6]!, 'attack', 2));
    for (const [i, marks] of copies.entries()) {
      expect(Object.isFrozen(marks)).toBe(true);
      expect(marks.length).toBeLessThanOrEqual(12);
      expect(marks).toEqual(pixelClassCombatMarks(HERO_GLYPH_CLASSES[i % 6]!, 'attack', 2));
      for (const mark of marks) {
        expect(Object.isFrozen(mark)).toBe(true);
        expect(mark.size).toBeGreaterThanOrEqual(2);
        expect(mark.x).toBeGreaterThanOrEqual(0);
        expect(mark.y).toBeGreaterThanOrEqual(0);
        expect(mark.x + mark.size).toBeLessThanOrEqual(48);
        expect(mark.y + mark.size).toBeLessThanOrEqual(56);
      }
    }
    expect(pixelClassCombatMarks('skeleton', 'attack', 2)).toHaveLength(0);
    expect(pixelClassCombatMarks('wraith', 'cast', 2)).toHaveLength(0);
    expect(pixelClassCombatMarks('WARRIOR', 'idle', 2)).toHaveLength(0);
    expect(pixelClassCombatMarks('WARRIOR', 'attack', Infinity)).toHaveLength(0);
  });

  it('bakes marks into each real 4-frame procedural atlas, not just unused planner data', () => {
    const painted = new Set<string>();
    const context = {
      fillStyle: '', imageSmoothingEnabled: false,
      fillRect() { painted.add(this.fillStyle); },
      save() {}, restore() {}, translate() {}
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      for (const hero of HERO_GLYPH_CLASSES) {
        painted.clear();
        const result = renderPixelAtlas(hero);
        expect(result.width).toBe(48 * 4);
        expect(result.height).toBe(56 * 10);
        const expectedColors = pixelClassCombatMarks(hero, 'attack', 2)
          .map(mark => mark.color);
        expect(expectedColors.every(color => painted.has(color))).toBe(true);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
