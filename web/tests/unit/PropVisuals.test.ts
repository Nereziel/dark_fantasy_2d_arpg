import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_IDS } from '../../src/game/world/environmentInteractions';
import { buildCryptWorld } from '../../src/game/world/dungeonRuntime';
import { propPreset, propArt, propBody, PROP_PRESETS, decorativeCryptProps } from '../../src/game/phaser/propVisuals';

describe('isometric prop presentation',()=>{
  it('maps every live wilderness interaction to a real art preset',()=>{
    for(const id of ENVIRONMENT_IDS)expect(propPreset(id)).not.toBeNull();
    expect(propPreset('field-chest')).toBe('chest');
    expect(propPreset('env.crate')).toBe('crate');
    expect(propPreset('env.barrel')).toBe('barrel');
    expect(propPreset('story-evidence')).toBe('evidence');
    expect(propPreset('crypt/optional/mine/treasure','crypt.open.treasure')).toBe('chest');
    expect(propPreset('crypt/room/interactable/0-sarcophagus','crypt.open.sarcophagus')).toBe('sarcophagus');
    expect(propPreset('dungeon-portal:mine')).toBeNull();
  });
  it('uses bounded, deterministic and geometrically distinct art, not recolored diamonds',()=>{
    const silhouettes=new Set<string>();
    for(const preset of PROP_PRESETS){
      const art=propArt(preset,true);
      expect(art.length).toBeGreaterThan(2);
      expect(art).toEqual(propArt(preset,true));
      for(const shape of art)for(const p of shape.points){
        expect(p.x).toBeGreaterThanOrEqual(-32);expect(p.x).toBeLessThanOrEqual(32);
        expect(p.y).toBeGreaterThanOrEqual(-56);expect(p.y).toBeLessThanOrEqual(8);
      }
      expect(propBody(preset).bodyHeight).toBeGreaterThan(0);
      silhouettes.add(JSON.stringify(art.map(p=>p.points)));
    }
    expect(silhouettes.size).toBe(PROP_PRESETS.length);
    expect(propArt('sarcophagus',false)).not.toEqual(propArt('sarcophagus',true));
  });
  it('never projects secret-room or actionable props as decoration',()=>{
    const theme=buildCryptWorld(42).theme;
    const props=decorativeCryptProps(theme);
    expect(props.length).toBeGreaterThan(0);
    expect(props.every(p=>p.capability==='decorative'&&theme.roomVisuals.some(r=>r.roomId===p.roomId&&r.initiallyVisible))).toBe(true);
    expect(props.every(p=>!theme.interactables.some(i=>i.propId===p.id))).toBe(true);
  });
});
