import { describe, expect, it } from 'vitest';
import { npcVisualPreset, npcPixels, NPC_VISUAL_PRESETS, NPC_FRAME_WIDTH, NPC_FRAME_HEIGHT } from '../../src/game/phaser/npcVisuals';
import { getTownManifest } from '../../src/game/world/townManifest';
import { VILLAGE_QUESTS } from '../../src/game/quests/villageQuests';

describe('Civilian NPC pixel art',()=>{
  it('gives every camp service a distinct stable preset, including three residents',()=>{
    const presets=getTownManifest().map(n=>npcVisualPreset(n.id,n.role));
    expect(new Set(presets).size).toBe(presets.length);
    expect(npcVisualPreset('warden_vesna','quest')).toBe('warden');
    expect(npcVisualPreset('smith_odan','blacksmith')).toBe('smith');
    expect(npcVisualPreset('merchant_bram','weaponMerchant')).toBe('merchant');
    expect(npcVisualPreset('healer_iva','healer')).toBe('healer');
    expect(npcVisualPreset('stash_camp','stash')).toBe('keeper');
  });
  it('recognizes a quest giver even when its gameplay role is civilian',()=>{
    expect(npcVisualPreset('north-village-civilian','civilian')).toBe('village-quest');
    expect(npcVisualPreset('east-village-quest','quest')).toBe('village-quest');
    for(const q of VILLAGE_QUESTS)expect(npcVisualPreset(q.giverId,q.giverId.endsWith('civilian')?'civilian':'quest')).toBe('village-quest');
    expect(npcVisualPreset('east-village-blacksmith','blacksmith')).toBe('smith');
  });
  it('uses distinct geometry and occupied silhouettes, not just different palettes',()=>{
    const geometry=NPC_VISUAL_PRESETS.map(p=>JSON.stringify(npcPixels(p).map(({x,y,w,h})=>[x,y,w,h])));
    expect(new Set(geometry).size).toBe(geometry.length);
    const silhouettes=NPC_VISUAL_PRESETS.map(p=>{
      const mask=new Uint8Array(NPC_FRAME_WIDTH*NPC_FRAME_HEIGHT);
      for(const {x,y,w,h} of npcPixels(p)){
        expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);
        expect(x+w).toBeLessThanOrEqual(NPC_FRAME_WIDTH);
        expect(y+h).toBeLessThanOrEqual(NPC_FRAME_HEIGHT);
        for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)mask[row*NPC_FRAME_WIDTH+col]=1;
      }
      expect(mask.some(Boolean)).toBe(true);
      return mask.join('');
    });
    expect(new Set(silhouettes).size).toBe(silhouettes.length);
  });
  it('is deterministic and independent of quest status and world seed',()=>{
    for(const p of NPC_VISUAL_PRESETS)expect(npcPixels(p)).toEqual(npcPixels(p));
    expect(npcVisualPreset('other-civilian','civilian')).toBe(npcVisualPreset('other-civilian','civilian'));
  });
});
