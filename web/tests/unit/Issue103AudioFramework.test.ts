import { describe, expect, it } from 'vitest';
import {
  AUDIO_BUSES, AUDIO_PREFERENCES_STORAGE_KEY, AUDIO_VOLUME_KEYS,
  DEFAULT_AUDIO_PREFERENCES, normalizeAudioPreferences,
  readAudioPreferences, writeAudioPreferences
} from '../../src/game/audio/audioPreferences';
import {
  AUDIO_CUE_MANIFEST, isValidAudioManifest, planGameAudio
} from '../../src/game/audio/audioCuePlan';
import { WebAudioDirector } from '../../src/game/audio/WebAudioDirector';
import type { GameEvent } from '../../src/game/core/types';

describe('Issue 103: audio mixer preferences and original sound plan', () => {
  it('has independent master, music, ambience, combat, monsters, spells and UI gain', () => {
    expect(AUDIO_VOLUME_KEYS).toEqual([
      'master', 'music', 'ambience', 'combat', 'monsters', 'spells', 'ui'
    ]);
    expect(new Set(AUDIO_BUSES).size).toBe(6);
    expect(AUDIO_VOLUME_KEYS.every(key =>
      DEFAULT_AUDIO_PREFERENCES[key] >= 0 && DEFAULT_AUDIO_PREFERENCES[key] <= 1)).toBe(true);
  });

  it('ignores invalid stored gain, unknown fields, overflow and malformed JSON', () => {
    expect(normalizeAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(normalizeAudioPreferences([])).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(normalizeAudioPreferences({
      master: Number.NaN, music: -1, ambience: 1.5, combat: '0',
      monsters: Infinity, spells: -Infinity, ui: 0.15, muted: 'true'
    })).toEqual({ ...DEFAULT_AUDIO_PREFERENCES, ui: 0.15 });
    expect(Object.isFrozen(normalizeAudioPreferences({ master: 0 }))).toBe(true);
    const store = {
      getItem: () => 'x'.repeat(5000),
      setItem: () => { throw new Error('blocked'); }
    };
    expect(readAudioPreferences(store)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(writeAudioPreferences(store, { muted: true, combat: 0 })).toEqual({
      ...DEFAULT_AUDIO_PREFERENCES, combat: 0, muted: true
    });
    expect(readAudioPreferences({
      getItem: () => '{not json', setItem: () => {}
    })).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it('roundtrips mute, zero gain, and partial settings without touching character save', () => {
    const store = new Map<string,string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string,value: string) => { store.set(key,value); }
    };
    const written = writeAudioPreferences(storage, { master: 0, ui: 1, muted: true });
    expect(readAudioPreferences(storage)).toEqual(written);
    expect(store.has(AUDIO_PREFERENCES_STORAGE_KEY)).toBe(true);
    expect([...store.keys()]).toEqual([AUDIO_PREFERENCES_STORAGE_KEY]);
  });

  it('routes authoritative events without duplicate hit/impact playback', () => {
    expect(isValidAudioManifest()).toBe(true);
    expect(Object.keys(AUDIO_CUE_MANIFEST).length).toBeGreaterThanOrEqual(15);
    const hit: GameEvent = {
      type:'damageResolved',sourceId:'hero',targetId:'zombie-1',
      damageType:'physical',damage:15,absorbed:0,critical:true,dodged:false,blocked:false
    };
    expect(planGameAudio(hit)).toBe('combat.critical');
    expect(planGameAudio({ ...hit, critical:false })).toBe('combat.hit');
    expect(planGameAudio({ ...hit, blocked:true, damage:0 })).toBe('combat.block');
    expect(planGameAudio({ ...hit, dodged:true, damage:0 })).toBe('combat.evade');
    expect(planGameAudio({ ...hit, critical:false, damage:0 })).toBeNull();
    expect(planGameAudio({ ...hit, targetId:'hero', sourceId:'zombie-1' }))
      .toBe('combat.critical');
    expect(planGameAudio({ ...hit, targetId:'hero', sourceId:'zombie-1', critical:false }))
      .toBe('monsters.attack');
    expect(planGameAudio({ type:'hit', targetId:'zombie-1', damage:15 })).toBeNull();
    expect(planGameAudio({ type:'cast',skillId:'basicAttack',x:10,y:20 }))
      .toBe('combat.swing');
    expect(planGameAudio({ type:'cast',skillId:'fireball',x:10,y:20 }))
      .toBe('spells.cast');
    expect(planGameAudio({ type:'enemyWindup',enemyId:'wolf-3',pattern:'leap' }))
      .toBe('monsters.windup');
    expect(planGameAudio({ type:'enemyAttack',enemyId:'wolf-3',hit:true }))
      .toBeNull();
    expect(planGameAudio({ type:'defeat',targetId:'wolf-3',kills:1 }))
      .toBe('monsters.death');
    expect(planGameAudio({ type:'loot',id:'loot-1' })).toBe('ui.loot');
    expect(planGameAudio({ type:'npcDialogue',npcId:'warden_vesna' }))
      .toBe('ui.interact');
    expect(planGameAudio({ type:'zoneChanged',zone:'crypt' })).toBeNull();
    expect(planGameAudio({ type:'miniBossCue', enemyId:'captain',
      bossId:'bandit_captain', kind:'telegraph',x:0,y:0,radius:40,phase:1
    } as GameEvent)).toBe('monsters.boss');
  });
});

class FakeParam {
  value = 0;
  targets = 0;
  setValueAtTime(value: number): this { this.value=value; return this; }
  exponentialRampToValueAtTime(value: number): this { this.value=value; return this; }
  setTargetAtTime(value: number): this { this.value=value; this.targets++; return this; }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  type: OscillatorType = 'sine';
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect(_node?: unknown): this { return this; }
  disconnect(): void {}
  start(): void { this.started = true; }
  stop(): void { this.stopped = true; }
}
class FakeContext {
  state: AudioContextState = 'running';
  currentTime = 20;
  destination = new FakeNode();
  gains: FakeNode[] = [];
  oscillators: FakeNode[] = [];
  createGain(): GainNode {
    const node = new FakeNode();
    this.gains.push(node);
    return node as unknown as GainNode;
  }
  createOscillator(): OscillatorNode {
    const node = new FakeNode();
    this.oscillators.push(node);
    return node as unknown as OscillatorNode;
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
}

describe('Issue 103: gesture-gated Web Audio adapter', () => {
  it('creates zero audio resources before unlock, then explicit buses and original drones', () => {
    const ctx = new FakeContext();
    let constructions=0;
    const director = new WebAudioDirector(
      () => { constructions++; return ctx as unknown as AudioContext; }, () => 1000
    );
    director.setPreferences({ master:0.5, music:0.2, ambience:0.1, combat:0.4 });
    director.play('combat.hit');
    expect(constructions).toBe(0);
    expect(ctx.oscillators).toHaveLength(0);
    expect(director.isUnlocked).toBe(false);
    director.unlock();
    expect(constructions).toBe(1);
    expect(director.isUnlocked).toBe(true);
    expect(ctx.gains).toHaveLength(9); // master + six buses + two drone envelopes
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.gains[0]?.gain.value).toBe(0.5);
    expect(ctx.gains[1]?.gain.value).toBe(0); // music silenced while paused
    expect(ctx.gains[6]?.gain.value).toBe(DEFAULT_AUDIO_PREFERENCES.ui);
    director.unlock();
    expect(constructions).toBe(1);
    director.setZone('wilderness');
    expect(ctx.oscillators[0]!.frequency.targets).toBe(0);
    director.setZone('crypt');
    expect(ctx.oscillators[0]!.frequency.targets).toBe(1);
    expect(ctx.oscillators[1]!.frequency.targets).toBe(1);
    director.setZone('crypt');
    expect(ctx.oscillators[0]!.frequency.targets).toBe(1);
    director.dispose();
    expect(ctx.state).toBe('closed');
    expect(ctx.oscillators.every(node => node.stopped)).toBe(true);
    expect(director.unlock()).toBe(false);
  });

  it('rate-limits cue floods, applies independent bus+master volume and caps voices', () => {
    const ctx = new FakeContext();
    let now=1000;
    const director = new WebAudioDirector(() => ctx as unknown as AudioContext,()=>now);
    director.unlock();
    director.setPaused(false);
    director.play('combat.hit');
    expect(ctx.oscillators).toHaveLength(3); // two drones + combat impact
    expect(director.activeVoices).toBe(1);
    director.play('combat.hit');
    expect(director.activeVoices).toBe(1);
    now+=41;
    director.play('combat.hit');
    expect(director.activeVoices).toBe(2);
    director.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, master:0, combat:1 });
    director.play('combat.critical');
    expect(director.activeVoices).toBe(2);
    director.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, master:1, combat:0 });
    director.play('combat.critical');
    expect(director.activeVoices).toBe(2);
    director.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, master:1, combat:1 });
    director.setHidden(true);
    expect(ctx.gains[0]?.gain.value).toBe(0);
    director.play('combat.critical');
    expect(director.activeVoices).toBe(2);
    director.setHidden(false);
    director.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted:true });
    director.play('combat.critical');
    expect(director.activeVoices).toBe(2);
    director.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted:false });
    director.play('combat.critical');
    expect(director.activeVoices).toBe(3);
    ctx.oscillators[2]!.onended?.();
    expect(director.activeVoices).toBe(2);
    director.dispose();
  });

  it('treats unavailable WebAudio and rejected unlock as safe no-ops', () => {
    const director = new WebAudioDirector(() => { throw new Error('Audio blocked'); });
    expect(director.unlock()).toBe(false);
    director.play('combat.hit');
    director.playGameEvent({type:'loot',id:'item-1'});
    director.setPaused(false);
    director.setHidden(true);
    director.dispose();
    expect(director.unlock()).toBe(false);
  });
});
