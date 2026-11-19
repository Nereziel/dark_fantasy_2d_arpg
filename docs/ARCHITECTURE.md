# Aether & Ruin — Architecture

## Production stack (first public migration)

The site at `https://nereziel.github.io/dark_fantasy_2d_arpg/` now deploys **`web/dist/`** instead of the old root HTML engine. This is an intentionally early playable migration; full campaign parity remains future work. The original root HTML engine is kept for reference.

- **Svelte 5:** menu, selection of six original classes, HUD, inventory/equipment, runtime locale.
- **Phaser 4.2.1:** world canvas, camera, input picking, actor proxies, procedurally drawn test environment and loot graphics.
- **Strict TypeScript simulation:** authoritative positions, movement, basic attacks, XP/levels, deterministic loot, gold, inventory/equipment, resource regen and events.
- **`svelte-i18n`:** Czech and English dictionaries, changed without reloading the game.
- **IndexedDB:** versioned web game snapshots (v2). A small migrator reads the previous web demo's v1 save. Old original-HTML game saves are **not** imported yet.
- **Vitest and Playwright:** headless domain unit tests, translation key tests and browser smoke tests.

## Data ownership

```text
Phaser world clicks ----> typed command bus <---- Svelte panels
                                  |
                                  v
                         GameSimulation
                     (fixed-step; seedable RNG)
                                  |
                      immutable game snapshot
                       /                \
                Phaser visuals         Svelte HUD
```

Neither Phaser GameObjects nor translated labels are serialized into saved state. Persistent IDs are independent of locale. Inventory equip and world pickup are typed commands.

The starter base attributes for Warrior, Paladin, Mage, Rogue, Necromancer and Warlock are taken from the original `CLASS_DEFINITIONS`. Item bases and rarity distribution follow the original `ItemGenerator`; generated affix IDs/values are stored, while UI names and labels are rendered from `cs`/`en` dictionaries.

## Hosting and CI

`.github/workflows/pages.yml` builds and tests the Svelte SPA on game/build input changes, runs Chromium E2E, then uploads **`web/dist` only** to GitHub Pages. GitHub Pages is static hosting and no backend is required.

The workflow intentionally ignores documentation-only/test-only pushes; independent quality tests for changes to tests and pull requests are configured in `quality.yml`.

The Vite base path is `/dark_fantasy_2d_arpg/`. All bundle and imported asset URLs must work at this repository subpath.

## Technical gaps

- The scene remains a test wilderness; the original world generation, quests, towns and bosses are not migrated.
- Basic attack behavior is class-specific by stats/range but original six skill bars are not implemented yet.
- Ground and hero remain procedural placeholder graphics. Replace with coherent spritesheets/tilemaps while preserving core state.
- Direct movement has no pathfinding around obstacles yet.
- Browser saves still need explicit legacy-HTML import with recovery, validation and player opt-in.
- Networking is not implemented.
