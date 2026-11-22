/**
 * Issue #103 — presentation-only Web Audio director.
 * The audio context is NEVER created until unlock() is called from a real
 * pointer/key gesture. No HTMLAudioElement, remote fetch or third-party files.
 * Every cue and background drone is authored in this project (GPL-3.0-only).
 */
import type { GameEvent, ZoneId } from '../core/types';
import {
  AUDIO_BUSES, DEFAULT_AUDIO_PREFERENCES, normalizeAudioPreferences,
  type AudioPreferences, type AudioBus
} from './audioPreferences';
import { AUDIO_CUE_MANIFEST, planGameAudio, type AudioCueId } from './audioCuePlan';

export class WebAudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: Partial<Record<AudioBus, GainNode>> = {};
  private readonly lastCueAt = new Map<AudioCueId, number>();
  private voices = 0;
  private background: Array<{ oscillator: OscillatorNode; bus: AudioBus }> = [];
  private settings: AudioPreferences = DEFAULT_AUDIO_PREFERENCES;
  private zone: ZoneId = 'wilderness';
  private hidden = false;
  private paused = true;
  private disposed = false;

  constructor(
    private readonly factory: () => AudioContext = () => new AudioContext(),
    private readonly clock: () => number = () => Date.now()
  ) {}

  get isUnlocked(): boolean { return this.ctx !== null; }
  get activeVoices(): number { return this.voices; }

  /** Must be called from a genuine browser user gesture, not on mount/tick. */
  unlock(): boolean {
    if (this.disposed) return false;
    if (!this.ctx) {
      try {
        const ctx = this.factory();
        const master = ctx.createGain();
        master.connect(ctx.destination);
        const nodes: Partial<Record<AudioBus, GainNode>> = {};
        for (const bus of AUDIO_BUSES) {
          const node = ctx.createGain();
          node.connect(master);
          nodes[bus] = node;
        }
        this.ctx = ctx;
        this.master = master;
        this.nodes = nodes;
        this.startDrones();
        this.applyVolumes();
      } catch {
        // Browser autoplay restrictions, disabled audio, missing WebAudio,
        // or an exhausted audio device must never affect the game.
        return false;
      }
    }
    this.resumeIfVisible();
    return true;
  }

  private startDrones(): void {
    if (!this.ctx || this.background.length) return;
    for (const [bus, freq, peak] of [
      ['music', this.zone === 'crypt' ? 92.5 : 110, 0.035],
      ['ambience', this.zone === 'crypt' ? 48 : 73, 0.045]
    ] as const) {
      try {
        const oscillator = this.ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;
        const gain = this.ctx.createGain();
        gain.gain.value = peak;
        oscillator.connect(gain);
        gain.connect(this.nodes[bus]!);
        oscillator.start();
        this.background.push({ oscillator, bus });
      } catch { /* Background sound is optional. */ }
    }
  }

  setZone(zone: ZoneId): void {
    this.zone = zone;
    const now = this.ctx?.currentTime ?? 0;
    for (const entry of this.background) {
      const frequency = entry.bus === 'music'
        ? zone === 'crypt' ? 92.5 : 110
        : zone === 'crypt' ? 48 : 73;
      try { entry.oscillator.frequency.setTargetAtTime(frequency, now, 0.25); }
      catch { /* No damage to simulation if device disconnects. */ }
    }
  }

  setPreferences(value: unknown): void {
    this.settings = normalizeAudioPreferences(value);
    this.applyVolumes();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyVolumes();
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.applyVolumes();
    if (hidden && this.ctx?.state === 'running') {
      void this.ctx.suspend().catch(() => {});
    } else if (!hidden) this.resumeIfVisible();
  }

  private resumeIfVisible(): void {
    if (!this.hidden && this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  private applyVolumes(): void {
    if (!this.master || !this.ctx) return;
    const disabled = this.settings.muted || this.hidden;
    this.master.gain.value = disabled ? 0 : this.settings.master;
    for (const bus of AUDIO_BUSES) {
      const node = this.nodes[bus];
      if (node) node.gain.value = this.paused && bus !== 'ui'
        ? 0 : this.settings[bus];
    }
  }

  playGameEvent(event: GameEvent): void {
    const cue = planGameAudio(event);
    if (cue) this.play(cue);
  }

  play(cueId: AudioCueId): void {
    if (!this.ctx || this.disposed || this.hidden || this.settings.muted) return;
    const cue = AUDIO_CUE_MANIFEST[cueId];
    if (this.paused && cue.bus !== 'ui') return;
    if (this.settings.master === 0 || this.settings[cue.bus] === 0) return;
    const now = this.clock();
    if (!Number.isFinite(now)) return;
    const last = this.lastCueAt.get(cueId);
    if (last !== undefined && now - last < cue.cooldownMs) return;
    if (this.voices >= 12) return;
    const bus = this.nodes[cue.bus];
    if (!bus || this.ctx.state !== 'running') return;
    try {
      const oscillator = this.ctx.createOscillator();
      const envelope = this.ctx.createGain();
      const t = this.ctx.currentTime;
      oscillator.type = cue.waveform;
      oscillator.frequency.setValueAtTime(cue.frequency, t);
      oscillator.frequency.exponentialRampToValueAtTime(cue.endFrequency, t + cue.duration);
      envelope.gain.setValueAtTime(0.0001, t);
      envelope.gain.exponentialRampToValueAtTime(cue.peak, t + Math.min(0.018, cue.duration / 4));
      envelope.gain.exponentialRampToValueAtTime(0.0001, t + cue.duration);
      oscillator.connect(envelope);
      envelope.connect(bus);
      oscillator.onended = () => {
        this.voices = Math.max(0, this.voices - 1);
        try { oscillator.disconnect(); envelope.disconnect(); } catch { /* Device removed. */ }
      };
      oscillator.start(t);
      oscillator.stop(t + cue.duration + 0.025);
      this.voices++;
      this.lastCueAt.set(cueId, now);
    } catch { /* Missing/broken audio device is a safe no-op. */ }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { oscillator } of this.background) {
      try { oscillator.stop(); oscillator.disconnect(); } catch { /* Device removed. */ }
    }
    this.background = [];
    this.nodes = {};
    this.master = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => {});
    this.lastCueAt.clear();
  }
}
