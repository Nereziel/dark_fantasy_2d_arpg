# Aether & Ruin — audio architecture (Prompt 48, Stage A)

All sound cues are **original procedural Web Audio oscillators** authored in
web/src/game/audio/audioCuePlan.ts. Background music/ambience drones are
synthesized in web/src/game/audio/WebAudioDirector.ts.

**Copyright/license:** project-authored sound and source: GPL-3.0-only.
**External assets/sources:** none; no third-party recordings, samples,
sound packs, music tracks or remote URLs are bundled. Missing files cannot
block the game because no external audio file is currently needed.

## Runtime contract

- GameSimulation does not import or depend on audio; typed GameEvent is the
  sole source of authoritative combat, boss, item, NPC and world cues.
- GameBridge.onEvent sends events to WebAudioDirector.playGameEvent, using a
  pure stateless planGameAudio mapping and centralized, license-marked manifest.
- AudioContext construction occurs **only** on a trusted pointerdown/keydown,
  never at application startup, on ticks or in a delayed timer.
- One master gain feeds six independent buses: music, ambience, combat,
  monsters, spells and UI. Mute and volume choices are browser-local,
  separate from character and world saves.
- A pause silences non-UI buses. Hidden tabs mute the master gain and
  suspend the context; visible tabs may resume an already unlocked context.
- Per-cue throttling and 12 simultaneous effect voices bound Web Audio use.
  Unsupported/blocked audio is silently disabled without affecting gameplay.
- Authored drones are minimal **placeholders, not a complete soundtrack**.
  Future licensed audio files must include full attribution in this directory,
  remain optional, and not require changes to the authoritative simulation.

## Verification

Unit tests cover event routing, avoiding duplicate hit cues, invalid or blocked
storage, independent volumes, mute, gesture gating, throttling, voice limits
and unavailable WebAudio. Chromium checks persisted controls and 320–430px UI.
Full CI and postmerge Pages are required before calling this shipped.
