/**
 * Issue #103: browser-local audio mixer settings.
 * Not serialized with GameSnapshot, CharacterProgress or WorldSessionProgress.
 * All values are linear gain coefficients in [0,1]. GPL-3.0-only.
 */
export const AUDIO_BUSES = ['music', 'ambience', 'combat', 'monsters', 'spells', 'ui'] as const;
export type AudioBus = typeof AUDIO_BUSES[number];
export type AudioVolumeKey = 'master' | AudioBus;
export const AUDIO_VOLUME_KEYS: readonly AudioVolumeKey[] = ['master', ...AUDIO_BUSES];

export type AudioPreferences = Readonly<Record<AudioVolumeKey, number> & { muted: boolean }>;
export const AUDIO_PREFERENCES_STORAGE_KEY = 'aether-ruin-audio-v1';
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = Object.freeze({
  master: 0.65, music: 0.35, ambience: 0.3, combat: 0.7,
  monsters: 0.6, spells: 0.65, ui: 0.55, muted: false
});

export function normalizeAudioPreferences(value: unknown): AudioPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return DEFAULT_AUDIO_PREFERENCES;
  const obj = value as Record<string, unknown>;
  const next: Record<string, number | boolean> = { ...DEFAULT_AUDIO_PREFERENCES };
  for (const bus of AUDIO_VOLUME_KEYS) {
    const volume = obj[bus];
    if (typeof volume === 'number' && Number.isFinite(volume)
      && volume >= 0 && volume <= 1) next[bus] = volume;
  }
  if (typeof obj.muted === 'boolean') next.muted = obj.muted;
  return Object.freeze(next) as AudioPreferences;
}

export interface AudioStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): AudioStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

export function readAudioPreferences(store: AudioStorage | null): AudioPreferences {
  if (!store) return DEFAULT_AUDIO_PREFERENCES;
  try {
    const raw = store.getItem(AUDIO_PREFERENCES_STORAGE_KEY);
    if (raw === null || raw.length > 2048) return DEFAULT_AUDIO_PREFERENCES;
    return normalizeAudioPreferences(JSON.parse(raw) as unknown);
  } catch { return DEFAULT_AUDIO_PREFERENCES; }
}

export function writeAudioPreferences(store: AudioStorage | null, value: unknown): AudioPreferences {
  const next = normalizeAudioPreferences(value);
  try { store?.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(next)); }
  catch { /* Blocked or full storage must never interrupt play. */ }
  return next;
}

let cached: AudioPreferences | null = null;

export function getAudioPreferences(): AudioPreferences {
  return cached ?? (cached = readAudioPreferences(browserStorage()));
}

export function setAudioPreferences(value: unknown): AudioPreferences {
  cached = writeAudioPreferences(browserStorage(), value);
  return cached;
}

export function reloadAudioPreferences(): AudioPreferences {
  cached = readAudioPreferences(browserStorage());
  return cached;
}
