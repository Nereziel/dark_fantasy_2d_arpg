# Aether & Ruin — Architecture

## Production stack (first public migration)

The site at `https://nereziel.github.io/dark_fantasy_2d_arpg/` now deploys **`web/dist/`** instead of the old root HTML engine. This is an intentionally early playable migration; full campaign parity remains future work. The original root HTML engine is kept for reference.

- **Svelte 5:** menu, selection of six original classes, HUD, inventory/equipment, runtime locale.
- **Phaser 4.2.1:** world canvas, camera, input picking, actor proxies, procedurally drawn test environment, loot graphics, three distinct enemy silhouettes and ground attack telegraphs.
- **Strict TypeScript simulation:** authoritative positions, movement, basic attacks, 12 first active class skills, cooldown/resource validation, status effects, three data-driven sequential enemy archetypes, dodgeable attack windups, deterministic combat damage, XP/levels, loot, gold, inventory/equipment and events.
- **`svelte-i18n`:** Czech and English dictionaries, changed without reloading the game.
- **IndexedDB:** current web game snapshots (v4), including active effects, cooldowns, enemy archetype, pending telegraph and attack cooldown. Previous web demo and original HTML-game save versions are **not supported or migrated**.
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

## Enemy combat

`web/src/game/enemies/enemies.ts` defines three encounter archetypes: Wraith (ranged bolt and kiting), Skeleton Warrior (close sweep), and Corrupted Wolf (fast pursuit, telegraphed leap and poison). Only **one opponent is active at a time**; after defeat the next type spawns. That is deliberate until multi-enemy targeting and navigation are implemented. Enemy decision-making, attack target locking and damage timings run in the fixed-step game simulation. Phaser shows a warning circle and draws simple archetype-specific silhouettes; visuals do not decide whether an attack hits. A stun cancels a windup. When saving, the active archetype and any pending attack are serialized as v4 data.

## Hosting and CI

`.github/workflows/pages.yml` builds and tests the Svelte SPA on game/build input changes, runs Chromium E2E, then uploads **`web/dist` only** to GitHub Pages. GitHub Pages is static hosting and no backend is required.

The workflow intentionally ignores documentation-only/test-only pushes; independent quality tests for changes to tests and pull requests are configured in `quality.yml`.

The Vite base path is `/dark_fantasy_2d_arpg/`. All bundle and imported asset URLs must work at this repository subpath.

## Technical gaps

- The scene remains a test wilderness with one active enemy at a time; the original world generation, groups of enemies, quests, towns and bosses are not migrated.
- All six classes have two playable starter skills each; the complete original skill trees and advanced balance are not implemented yet.
- Ground and hero remain procedural placeholder graphics. Replace with coherent spritesheets/tilemaps while preserving core state.
- Direct movement has no pathfinding around obstacles yet.
- The current save format intentionally rejects legacy/demo saves rather than migrating them.
- Networking is not implemented.
