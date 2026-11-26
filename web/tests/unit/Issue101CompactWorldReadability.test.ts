import { describe, expect, it } from 'vitest';
import { roleMarker, layoutWorldLabels, skillCueStyle, lootLabelsEnabled, setLootLabelsEnabled } from '../../src/game/ui/worldReadability';

describe('compact isometric readability', () => {
  it('shows real quest state rather than promising a quest for a civilian', () => {
    expect(roleMarker('quest','available')).toBe('!');
    expect(roleMarker('quest','ready')).toBe('?');
    expect(roleMarker('quest','active')).toBe('…');
    expect(roleMarker('civilian')).toBe('');
    expect(roleMarker('healer')).toBe('+');
    expect(roleMarker('blacksmith')).not.toBe(roleMarker('healer'));
  });
  it('stacks overlapping labels without changing stable identities or input', () => {
    const input = [{id:'a',x:100,y:100,width:90,height:20},{id:'b',x:103,y:100,width:80,height:20},{id:'c',x:400,y:120,width:80,height:20}];
    const labels = layoutWorldLabels(input);
    expect(labels.map(l=>l.id)).toEqual(['a','b','c']);
    expect(labels[0]?.y).toBe(100);
    expect(labels[1]?.y).toBeLessThanOrEqual(78);
    expect(labels[2]?.y).toBe(120);
    expect(input[1]?.y).toBe(100);
  });
  it('keeps distinct class cast cues with bounded motion',()=>{
    expect(skillCueStyle('PALADIN','healingLight').color).not.toBe(skillCueStyle('WARLOCK','demonSummoning').color);
    expect(skillCueStyle('WARRIOR','basicAttack').duration).toBeLessThan(skillCueStyle('MAGE','frostNova').duration);
  });
  it('uses a presentation-only toggle and never requires available storage',()=>{
    const map = new Map<string,string>();
    const storage = {getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};
    setLootLabelsEnabled(false,storage);
    expect(lootLabelsEnabled(storage)).toBe(false);
    setLootLabelsEnabled(true,storage);
    expect(lootLabelsEnabled(storage)).toBe(true);
  });
});
