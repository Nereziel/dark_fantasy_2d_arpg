/**
 * Issue #102 — browser-local presentation preferences.
 * Never part of GameSnapshot, character saves, or GameSimulation.
 * GPL-3.0-only.
 */
export type MotionPreference = 'system' | 'reduced' | 'full';
export type CameraShakePreference = 0 | 0.5 | 1;
export type UiScalePreference = 0.9 | 1 | 1.1;
export type PixelFilterPreference = 'sharp' | 'smooth';

export interface VisualPreferences {
  readonly motion: MotionPreference;
  readonly shake: CameraShakePreference;
  readonly uiScale: UiScalePreference;
  readonly floatingCombatText: boolean;
  readonly highContrast: boolean;
  /** Phaser 4 pixel-art texture interpolation; world simulation unaffected. */
  readonly pixelFilter: PixelFilterPreference;
}

export const VISUAL_PREFERENCES_KEY = 'aether-ruin-visual-preferences-v1';

export const DEFAULT_VISUAL_PREFERENCES: VisualPreferences = Object.freeze({
  motion: 'system',
  shake: 1,
  uiScale: 1,
  floatingCombatText: true,
  highContrast: false,
  pixelFilter: 'sharp'
});

const motionOptions: readonly MotionPreference[] = ['system', 'reduced', 'full'];
const shakeOptions: readonly CameraShakePreference[] = [0, 0.5, 1];
const scaleOptions: readonly UiScalePreference[] = [0.9, 1, 1.1];
const pixelFilterOptions: readonly PixelFilterPreference[] = ['sharp','smooth'];

export function normalizeVisualPreferences(input: unknown): VisualPreferences {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return DEFAULT_VISUAL_PREFERENCES;
  const value = input as Partial<VisualPreferences>;
  return Object.freeze({
    motion: motionOptions.includes(value.motion as MotionPreference)
      ? value.motion! : DEFAULT_VISUAL_PREFERENCES.motion,
    shake: shakeOptions.includes(value.shake as CameraShakePreference)
      ? value.shake! : DEFAULT_VISUAL_PREFERENCES.shake,
    uiScale: scaleOptions.includes(value.uiScale as UiScalePreference)
      ? value.uiScale! : DEFAULT_VISUAL_PREFERENCES.uiScale,
    floatingCombatText: typeof value.floatingCombatText === 'boolean'
      ? value.floatingCombatText : DEFAULT_VISUAL_PREFERENCES.floatingCombatText,
    highContrast: typeof value.highContrast === 'boolean'
      ? value.highContrast : DEFAULT_VISUAL_PREFERENCES.highContrast,
    pixelFilter: pixelFilterOptions.includes(value.pixelFilter as PixelFilterPreference)
      ? value.pixelFilter! : DEFAULT_VISUAL_PREFERENCES.pixelFilter
  });
}

export interface VisualPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readVisualPreferences(storage: VisualPreferenceStorage | null): VisualPreferences {
  if (!storage) return DEFAULT_VISUAL_PREFERENCES;
  try {
    const raw = storage.getItem(VISUAL_PREFERENCES_KEY);
    if (raw === null || raw.length > 2048) return DEFAULT_VISUAL_PREFERENCES;
    return normalizeVisualPreferences(JSON.parse(raw) as unknown);
  } catch { return DEFAULT_VISUAL_PREFERENCES; }
}

export function writeVisualPreferences(
  storage: VisualPreferenceStorage | null, input: unknown
): VisualPreferences {
  const normalized = normalizeVisualPreferences(input);
  try { storage?.setItem(VISUAL_PREFERENCES_KEY, JSON.stringify(normalized)); }
  catch { /* Privacy mode or quota error must never interrupt gameplay. */ }
  return normalized;
}

let cached: VisualPreferences | null = null;

function browserStorage(): VisualPreferenceStorage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

/** Shared synchronous read for App + Phaser event adapter, no per-hit storage I/O. */
export function getVisualPreferences(): VisualPreferences {
  return cached ?? (cached = readVisualPreferences(browserStorage()));
}

export function setVisualPreferences(input: unknown): VisualPreferences {
  cached = writeVisualPreferences(browserStorage(), input);
  return cached;
}

export function shouldReduceMotion(
  prefs: VisualPreferences, operatingSystemReduced: boolean
): boolean {
  return prefs.motion === 'reduced'
    || (prefs.motion === 'system' && operatingSystemReduced);
}

/** Restore a saved preference after browser-local storage event elsewhere. */
export function reloadVisualPreferences(): VisualPreferences {
  cached = readVisualPreferences(browserStorage());
  return cached;
}
