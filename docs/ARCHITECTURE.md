# Aether & Ruin — Architecture (migration stage 01)

This document describes the **partially implemented** Svelte/Phaser client at `web/`. The original playable root HTML game is still served by GitHub Pages. The staged client is intentionally incomplete.

## Stack

- Svelte 5 for UI, settings and HUD, with Svelte runes.
- Phaser 4.2.1 for drawing the world and pointer input.
- Strict TypeScript simulation and typed commands/immutable snapshots.
- Vite for local dev/static export, with base path `/dark_fantasy_2d_arpg/`.
- `svelte-i18n` with `cs` and `en` catalogs.
- IndexedDB for staged game saves; legacy saves are not yet imported.
- Vitest for renderer-independent tests; Playwright for smoke tests.

## Data flow

```text
Mouse click -> Phaser FrontierScene -> GameBridge.command(Move/Attack)
Svelte menu -> GameBridge.command(Pause/Reset)
                              |
                              v
               GameSimulation (fixed 60 Hz)
                              |
                              v
                     GameSnapshot / GameEvent
                      |                  |
                 Phaser views         Svelte HUD
```

The simulation depends on **neither Phaser nor Svelte**. It cannot import the DOM, locale strings or renderer objects. `GameBridge` publishes UI snapshots at most eight times per second; Phaser reads state for every rendered frame. A bounded time accumulator prevents giant simulation jumps when the browser resumes from suspension.

The current simplified combat is **not** a port of all legacy combat: it is a working integration reference with a single foe. All future items/quests/skills will be migrated to pure TypeScript domain systems with stable IDs and regression tests.

## Scene/rendering

`web/src/game/phaser/FrontierScene.ts` currently draws programmatic placeholder terrain/trees and two characters. It demonstrates a Phaser-managed camera, input, sprite proxies and basic combat bars. Actual sprite atlases, tilemaps, pathfinding and chunk streaming are later milestones.

## Browser persistence

`web/src/persistence/SaveRepository.ts` uses a versioned IndexedDB record (`format: 1`) and intentionally **does not** migrate or overwrite the original HTML game's localStorage saves. Migration, backup and more robust save DTO validation are later work.

## Localization

The `svelte-i18n` catalogs are in `web/src/i18n/locales/`. The language selector updates the UI without restarting Phaser. Locale preference lives separately in localStorage. New content must ship with Czech and English strings. See `2d_arpg_implementation_prompts.md` for full locale/grammar requirements.

## Deployment

`.github/workflows/pages.yml` watches only the **published legacy** game. The staged `web/` app is validated by `.github/workflows/quality.yml` without Pages deployment. Do not switch the Pages artifact to `web/dist/` until legacy gameplay/save parity has been demonstrated in browser E2E tests.

## Known limitations

- Original six classes, loot, talents, quests, NPC conversations and dungeon generation are **not yet migrated**.
- Player and enemy graphics are temporary procedural shapes, not finished spritesheets.
- Movement is direct point navigation without pathfinding around obstacles.
- The initial save adapter works for the new format only.
- Offline font fallback is available, but optional Google Fonts require network.
