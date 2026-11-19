# Aether & Ruin — Architecture

## Production stack (first public migration)

The site at `https://nereziel.github.io/dark_fantasy_2d_arpg/` now deploys **`web/dist/`** instead of the old root HTML engine. This is an intentionally early playable migration; full campaign parity remains future work. The original root HTML engine is kept for reference.

- **Svelte 5:** menu, selection of six original classes, HUD, inventory/equipment, runtime locale.
- **Phaser 4.2.1:** world canvas, camera, input picking, actor proxies, procedurally drawn test environment, loot graphics, three simultaneous enemy silhouettes, individual health/status overlays, selected-target indicators and ground attack telegraphs.
- **Strict TypeScript simulation:** authoritative positions, movement, basic attacks, 12 first active class skills, cooldown/resource validation, status effects, three simultaneous data-driven enemy archetypes with individual AI, dodgeable attack windups, deterministic combat damage, XP/levels, loot, gold, inventory/equipment and events.
- **`svelte-i18n`:** Czech and English dictionaries, changed without reloading the game.
- **IndexedDB:** character-only save records (format v6) containing class, level, XP, gold, cumulative kills, inventory and equipment. Enemy state, active effects, cooldowns, world drops, positions and encounter wave are never persisted; old saves are not migrated.
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

## Enemy combat and navigation

`web/src/game/enemies/enemies.ts` defines three enemy archetypes: Wraith (ranged bolt and kiting), Skeleton Warrior (close sweep) and Corrupted Wolf (fast pursuit, telegraphed leap and poison). All three spawn **simultaneously** as an encounter pack; the next full wave spawns after all three are defeated. Their actor states, effects, cooldowns and windups are independent, with unique IDs. Target selection is explicit and supports clicking a sprite or a Svelte target-list entry.

The game simulation owns attack decisions, locked danger zones and damage on fixed ticks. Phaser only draws warnings, enemy outlines and effects. Stuns interrupt the affected enemy's windup without affecting unrelated actors.

`web/src/game/world/navigation.ts` owns fixed obstacle rectangles. Its collision-aware movement prevents tunneling; player click-to-move uses deterministic A* waypoints around obstacles. Enemy steering applies collision and separation so opponents do not occupy exactly the same position. The renderer draws barricades and ruins from the same obstacle definitions.

`GameSnapshot` version 5 is an **ephemeral, renderer-facing simulation snapshot**, not a save format. `CharacterProgress` is the persistent allowlisted projection. `SaveRepository` writes only `SavedGame` format 6; loading reinitializes a fresh encounter and the hero at the safe start point with full health. Incompatible old save formats are rejected without import. The test wilderness is still a fixed map; full procedural world regeneration is a later milestone.

## Hosting and CI

`.github/workflows/pages.yml` builds and tests the Svelte SPA on game/build input changes, runs Chromium E2E, then uploads **`web/dist` only** to GitHub Pages. GitHub Pages is static hosting and no backend is required.

The workflow intentionally ignores documentation-only/test-only pushes; independent quality tests for changes to tests and pull requests are configured in `quality.yml`.

The Vite base path is `/dark_fantasy_2d_arpg/`. All bundle and imported asset URLs must work at this repository subpath.

## Technical gaps

- The scene remains a fixed test wilderness with one simultaneous three-enemy pack; full world generation, dynamic large groups, quests, towns and bosses are not migrated.
- All six classes have two playable starter skills each; the complete original skill trees and advanced balance are not implemented yet.
- Ground and hero remain procedural placeholder graphics. Replace with coherent spritesheets/tilemaps while preserving core state.
- Direct movement has no pathfinding around obstacles yet.
- Saved characters start new game sessions rather than restoring active combat. Save is currently manual; auto-save and complete character progression (quests, talents, unlocked skills) remain future work.
- Networking is not implemented.
