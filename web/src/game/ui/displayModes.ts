/**
 * Issue #102: native browser fullscreen and Phaser 4 interpolation policy.
 * Only the renderer is recreated on filter change; game simulation is owned
 * by the unchanged GameBridge. GPL-3.0-only.
 */
import type { PixelFilterPreference } from './visualPreferences';

export interface BrowserFullscreenTarget {
  requestFullscreen?: () => Promise<void>;
}

export interface BrowserFullscreenDocument {
  readonly fullscreenElement: Element | object | null;
  exitFullscreen?: () => Promise<void>;
}

export function isFullscreenAvailable(
  doc: BrowserFullscreenDocument | null,
  target: BrowserFullscreenTarget | null
): boolean {
  return Boolean(doc && target && typeof target.requestFullscreen === 'function'
    && typeof doc.exitFullscreen === 'function');
}

/** Call only inside a real user click handler. Never auto-enter fullscreen. */
export async function toggleBrowserFullscreen(
  doc: BrowserFullscreenDocument | null,
  target: BrowserFullscreenTarget | null
): Promise<boolean> {
  if (!isFullscreenAvailable(doc,target)) return false;
  try {
    if (doc!.fullscreenElement) await doc!.exitFullscreen!();
    else await target!.requestFullscreen!();
    return true;
  } catch {
    // Browser/iframe/OS may refuse fullscreen; keep the game functional.
    return false;
  }
}

export function renderFilterConfig(filter: PixelFilterPreference): Readonly<{
  pixelArt: boolean;
  smoothPixelArt: boolean;
  antialias: boolean;
}> {
  return filter === 'smooth'
    ? { pixelArt:false, smoothPixelArt:true, antialias:true }
    : { pixelArt:true, smoothPixelArt:false, antialias:false };
}
