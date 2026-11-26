import { describe, expect, it } from 'vitest';
import { normalizeWorldHud, worldLabelVisible } from '../../src/game/ui/worldReadability';
describe('minimal world HUD policy',()=>{
  it('defaults to hover loot and interactions, no auxiliary panels',()=>{
    expect(normalizeWorldHud(null)).toEqual({loot:'hover',npcNames:false,highlight:true,assistance:false});
    expect(normalizeWorldHud({loot:'invalid',assistance:1})).toEqual(normalizeWorldHud(null));
  });
  it('shows only focused labels by default and respects loot preference',()=>{
    expect(worldLabelVisible('loot',false,normalizeWorldHud(null))).toBe(false);
    expect(worldLabelVisible('loot',true,normalizeWorldHud(null))).toBe(true);
    expect(worldLabelVisible('loot',true,normalizeWorldHud({loot:'off'}))).toBe(false);
    expect(worldLabelVisible('loot',false,normalizeWorldHud({loot:'always'}))).toBe(true);
    expect(worldLabelVisible('portal',false,normalizeWorldHud({loot:'always'}))).toBe(false);
    expect(worldLabelVisible('npc',false,normalizeWorldHud({npcNames:true}))).toBe(true);
  });
});
