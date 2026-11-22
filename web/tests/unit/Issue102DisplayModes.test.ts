/**
 * Issue #102 — browser fullscreen and Phaser pixel-art filtering.
 * Fullscreen is an explicit user action, not an option persisted in saves.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  renderFilterConfig, toggleBrowserFullscreen, isFullscreenAvailable
} from '../../src/game/ui/displayModes';
import { DEFAULT_VISUAL_PREFERENCES, normalizeVisualPreferences,
  readVisualPreferences, writeVisualPreferences, VISUAL_PREFERENCES_KEY
} from '../../src/game/ui/visualPreferences';

describe('Issue 102: pixel-art filter setting', () => {
  it('defaults to crisp pixel art and restores existing v1 preferences', () => {
    expect(DEFAULT_VISUAL_PREFERENCES.pixelFilter).toBe('sharp');
    expect(normalizeVisualPreferences({
      motion:'reduced', uiScale:1.1, highContrast:true
    })).toMatchObject({pixelFilter:'sharp', motion:'reduced', uiScale:1.1});
    expect(normalizeVisualPreferences({pixelFilter:'smooth'}).pixelFilter).toBe('smooth');
    expect(normalizeVisualPreferences({pixelFilter:'unsupported'}).pixelFilter).toBe('sharp');
    expect(normalizeVisualPreferences({pixelFilter:42}).pixelFilter).toBe('sharp');
  });
  it('stores display filtering only in browser prefs, with no save version change', () => {
    const map = new Map<string,string>();
    const storage = {
      getItem:(key:string)=>map.get(key)??null,
      setItem:(key:string,value:string)=>{map.set(key,value);}
    };
    const saved=writeVisualPreferences(storage,{
      ...DEFAULT_VISUAL_PREFERENCES,pixelFilter:'smooth'
    });
    expect(saved.pixelFilter).toBe('smooth');
    expect(readVisualPreferences(storage).pixelFilter).toBe('smooth');
    expect([...map.keys()]).toEqual([VISUAL_PREFERENCES_KEY]);
  });
  it('produces supported Phaser 4 pixel-art vs smooth interpolation configs', () => {
    expect(renderFilterConfig('sharp')).toEqual({
      pixelArt:true,smoothPixelArt:false,antialias:false
    });
    expect(renderFilterConfig('smooth')).toEqual({
      pixelArt:false,smoothPixelArt:true,antialias:true
    });
    expect(renderFilterConfig('unknown' as 'sharp')).toEqual(
      renderFilterConfig('sharp')
    );
  });
});

describe('Issue 102: native fullscreen toggle is permission safe', () => {
  it('requests fullscreen only on explicit calls and tracks availability', async () => {
    let current: object|null = null;
    const target={requestFullscreen:vi.fn(async()=>{current=target;})};
    const doc={
      get fullscreenElement(){return current;},
      exitFullscreen:vi.fn(async()=>{current=null;})
    };
    expect(isFullscreenAvailable(doc,target)).toBe(true);
    expect(target.requestFullscreen).not.toHaveBeenCalled();
    expect(await toggleBrowserFullscreen(doc,target)).toBe(true);
    expect(target.requestFullscreen).toHaveBeenCalledOnce();
    expect(await toggleBrowserFullscreen(doc,target)).toBe(true);
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(doc.fullscreenElement).toBeNull();
  });
  it('returns false on missing API, denied requests, and failures to exit', async () => {
    expect(isFullscreenAvailable(null,null)).toBe(false);
    expect(await toggleBrowserFullscreen(null,null)).toBe(false);
    expect(await toggleBrowserFullscreen({fullscreenElement:null},{})).toBe(false);
    const denied={requestFullscreen:vi.fn(async()=>{throw new Error('Denied');})};
    const doc={fullscreenElement:null,exitFullscreen:vi.fn(async()=>{})};
    expect(await toggleBrowserFullscreen(doc,denied)).toBe(false);
    expect(await toggleBrowserFullscreen({
      fullscreenElement:{} as Element,
      exitFullscreen:vi.fn(async()=>{throw new Error('Denied');})
    },denied)).toBe(false);
  });
});
