import { describe, expect, it } from 'vitest';
import { normalizeWorldHud, worldLabelVisible, npcWorldLabel, roleMarker } from '../../src/game/ui/worldReadability';
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

describe('persistent NPC service and quest markers',()=>{
  const defaults=normalizeWorldHud(null);
  it('shows just the marker until focus, then just the localized name',()=>{
    for(const marker of ['!','?',roleMarker('weaponMerchant'),roleMarker('blacksmith'),roleMarker('stash'),roleMarker('healer')]){
      expect(npcWorldLabel('Service',marker,false,defaults)).toEqual({text:marker,markerOnly:true});
      expect(npcWorldLabel('Service',marker,true,defaults)).toEqual({text:'Service',markerOnly:false});
    }
  });
  it('does not mark ordinary or exhausted quest NPCs; honors explicit always-show-names preference',()=>{
    expect(npcWorldLabel('Resident','',false,defaults)).toBeNull();
    expect(npcWorldLabel('Resident','',true,defaults)).toEqual({text:'Resident',markerOnly:false});
    expect(npcWorldLabel('Merchant','¤',false,normalizeWorldHud({npcNames:true}))).toEqual({text:'Merchant',markerOnly:false});
  });
});
