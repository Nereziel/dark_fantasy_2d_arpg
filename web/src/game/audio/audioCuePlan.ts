/**
 * Stateless authoring manifest and event routing for browser sound.
 * Never reads simulation state, time, renderer or localization.
 * All cue timbres are original procedural oscillators, GPL-3.0-only.
 */
import type { GameEvent } from '../core/types';
import type { AudioBus } from './audioPreferences';

export interface AudioCueDefinition {
  readonly bus: AudioBus;
  readonly waveform: OscillatorType;
  readonly frequency: number;
  readonly endFrequency: number;
  readonly duration: number;
  readonly peak: number;
  readonly cooldownMs: number;
  readonly source: 'procedural-original';
  readonly license: 'GPL-3.0-only';
}

/** Prepared for later licensed audio-file overrides, no external assets shipped. */
const cue = (bus: AudioBus, waveform: OscillatorType, frequency: number,
  endFrequency: number, duration: number, peak: number,
  cooldownMs: number): AudioCueDefinition => Object.freeze({
  bus, waveform, frequency, endFrequency, duration, peak, cooldownMs,
  source: 'procedural-original', license: 'GPL-3.0-only'
});

export const AUDIO_CUE_MANIFEST = Object.freeze({
  'combat.swing': cue('combat','triangle',150,80,.16,.19,75),
  'combat.hit': cue('combat','triangle',125,65,.13,.27,40),
  'combat.critical': cue('combat','sawtooth',205,55,.29,.33,85),
  'combat.block': cue('combat','square',370,210,.11,.13,105),
  'combat.evade': cue('combat','sine',180,490,.15,.11,160),
  'monsters.windup': cue('monsters','triangle',105,68,.32,.21,260),
  'monsters.attack': cue('monsters','sawtooth',110,52,.2,.17,120),
  'monsters.death': cue('monsters','triangle',170,35,.33,.24,120),
  'monsters.boss': cue('monsters','sawtooth',72,40,.58,.22,420),
  'spells.cast': cue('spells','sine',460,670,.21,.20,60),
  'spells.impact': cue('spells','triangle',410,145,.23,.23,100),
  'ui.loot': cue('ui','sine',700,1040,.14,.13,110),
  'ui.potion': cue('ui','sine',520,840,.22,.14,150),
  'ui.interact': cue('ui','sine',540,480,.12,.11,100),
  'ui.level': cue('ui','triangle',410,920,.45,.19,280),
  'ui.select': cue('ui','sine',710,880,.065,.075,75),
  'ambience.world': cue('ambience','triangle',115,65,.36,.1,430),
  'ambience.trap': cue('ambience','triangle',220,65,.28,.19,300),
  'ambience.event': cue('ambience','sine',300,120,.44,.13,350)
});

export type AudioCueId = keyof typeof AUDIO_CUE_MANIFEST;

/**
 * Only one cue per authoritative event; duplicate 'hit' / warriorImpact /
 * projectileImpact notifications do not produce extra damage sounds.
 */
export function planGameAudio(event: GameEvent): AudioCueId | null {
  switch (event.type) {
    case 'cast':
      return event.skillId === 'basicAttack' ? 'combat.swing' : 'spells.cast';
    case 'damageResolved':
      if (event.dodged) return 'combat.evade';
      if (event.blocked) return 'combat.block';
      if (event.damage <= 0) return null;
      return event.critical ? 'combat.critical'
        : event.targetId === 'hero' ? 'monsters.attack' : 'combat.hit';
    case 'enemyWindup': return 'monsters.windup';
    case 'enemyAttack': return null; // damageResolved is canonical
    case 'miniBossCue':
      return event.kind === 'telegraph' ? 'monsters.boss' : null;
    case 'hollowKingCue':
      return event.kind === 'windup' || event.kind === 'telegraph'
        ? 'monsters.boss' : null;
    case 'defeat': return 'monsters.death';
    case 'playerDeath': return 'monsters.boss';
    case 'loot':
    case 'pickup': return 'ui.loot';
    case 'potionUsed': return 'ui.potion';
    case 'npcDialogue':
    case 'townInteraction':
    case 'townServiceUsed':
    case 'stashUpdated':
    case 'waypointActivated':
    case 'waypointTravel':
    case 'checkpointActivated': return 'ui.interact';
    case 'levelUp': return 'ui.level';
    case 'environmentInteracted':
      return event.kind === 'trap' ? 'ambience.trap' : 'ambience.world';
    case 'worldInteract':
    case 'cryptInteract': return 'ambience.world';
    case 'cryptTrapWindup':
    case 'cryptTrap': return 'ambience.trap';
    case 'worldEventStarted':
    case 'worldEventCompleted': return 'ambience.event';
    default: return null;
  }
}

/** Guards against accidental manifest expansion with unsafe oscillator values. */
export function isValidAudioManifest(): boolean {
  return Object.values(AUDIO_CUE_MANIFEST).every(c =>
    Number.isFinite(c.frequency) && c.frequency >= 20 && c.frequency <= 4000
    && Number.isFinite(c.endFrequency) && c.endFrequency >= 20 && c.endFrequency <= 4000
    && Number.isFinite(c.duration) && c.duration > 0 && c.duration <= 2
    && Number.isFinite(c.peak) && c.peak > 0 && c.peak <= 0.4
    && Number.isFinite(c.cooldownMs) && c.cooldownMs >= 0
    && c.source === 'procedural-original' && c.license === 'GPL-3.0-only'
  );
}
