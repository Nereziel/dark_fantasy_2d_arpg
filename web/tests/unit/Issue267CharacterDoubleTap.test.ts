import { describe, expect, it } from 'vitest';
import { CharacterDoubleTap } from '../../src/game/ui/characterDoubleTap';

describe('saved character double-tap', () => {
  it('consumes only a close pair of taps on the same identity', () => {
    const taps = new CharacterDoubleTap();
    expect(taps.tap('a',100,20,30)).toBe(false);
    expect(taps.tap('a',350,22,35)).toBe(true);
    expect(taps.tap('a',400,20,30)).toBe(false);
  });
  it('does not combine different rows, distant points, slow taps or canceled gestures', () => {
    const taps = new CharacterDoubleTap();
    expect(taps.tap('a',100,20,30)).toBe(false);
    expect(taps.tap('b',200,20,30)).toBe(false);
    expect(taps.tap('b',300,90,30)).toBe(false);
    expect(taps.tap('b',1000,90,30)).toBe(false);
    taps.reset();
    expect(taps.tap('b',1050,90,30)).toBe(false);
    expect(taps.tap('b',1200,90,30)).toBe(true);
  });
});
