# Aether & Ruin — Architecture

## Production stack (first public migration)

The site at `https://nereziel.github.io/dark_fantasy_2d_arpg/` now deploys **`web/dist/`** instead of the old root HTML engine. This is an intentionally early playable migration; full campaign parity remains future work. The original root HTML engine is kept for reference.

- **Svelte 5:** menu, selection of six classes, HUD, inventory/equipment, localized NPC dialogue, merchant and blacksmith panels, quest journal and runtime locale.
- **Phaser 4.2.1:** world canvas, camera, input picking, actor proxies, seeded wilderness and crypt terrain, portal drawings, safe starter camp, loot graphics, individual enemy/boss visuals, selected-target indicators and telegraphs.
- **Character model (Prompt 02):** `web/src/game/stats/deriveStats.ts` owns primary and derived character stats; `web/src/game/entities/player.ts` owns spawn, max-health adjustments and resource regeneration. All derive on demand from class base values and equipped items. Svelte `CharacterSheet` is an read-only projection opened with C and is translated in CS/EN. Advanced resistances, dodge and some secondary stats are displayed but not yet wired to defensive combat rules (planned Prompt 06).
- **Strict TypeScript simulation:** authoritative positions, movement, basic attacks, 12 first active class skills, cooldown/resource validation, status effects, three wilderness archetypes plus a crypt boss, independent enemy AI and windups, two-phase dungeon encounters, zone transitions, XP/levels, loot, gold, inventory/equipment, first quest lifecycle and events.
- **`svelte-i18n`:** Czech and English dictionaries, changed without reloading the game.
- **IndexedDB:** automatic debounced plus manual character-only saves (format v8) with class, level, XP, gold, cumulative kills, inventory, equipment/tempering levels and persistent quest progress. Enemy state, effects, cooldowns, drops, positions, encounter wave and world seed are never persisted; old saves are not migrated.
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

`web/src/game/world/navigation.ts` provides collision-aware movement and deterministic A* navigation. `web/src/game/world/generator.ts` builds a small wilderness layout from a **per-session seed**. The safe camp and encounter spawns remain accessible while randomized extra ruins use the same collision and graphical geometry. This is an initial procedural slice, not yet a full biome/tilemap generator.

`GameSnapshot` version 5 is an **ephemeral, renderer-facing snapshot**, not a save format; its `worldSeed` never reaches storage. `CharacterProgress` is the persistent allowlisted projection. `SaveRepository` writes only format 8. The UI bridge generates fresh random world seeds on every new-game/load, while the simulation remains deterministic for a given seed. The hero returns to the safe camp with full health and fresh encounters. `CharacterAutosaver` coalesces changes and serializes writes; the page-hide flush is best-effort. Older saves are rejected.

## First camp NPC and permanent quest progress

`web/src/game/quests/firstQuest.ts` defines the stable quest ID `ashes_at_gate`, progression validation, a three-kill objective and one-time reward. `web/src/game/world/npcs.ts` owns the warden's position and interaction range. Clicking Warden Vesna in Phaser or the Svelte quest-journal action sends the same typed `interactNpc` command; the simulation moves the hero into range and emits a dialogue event. The bilingual dialog pauses combat and exposes typed quest accept/turn-in actions. Only kills **after acceptance** count, and rewards cannot be claimed twice.

The `CharacterProgress.quest` field is included in allowlisted character-only saves and validated on load. New sessions regenerate the world and combat normally but preserve story progression. Earlier save formats are deliberately not migrated.

## Camp commerce

`web/src/game/trade/commerce.ts` defines deterministic merchant stock, prices, sell values and pure blacksmith upgrade operations. The player talks to Merchant Bram or Blacksmith Odan through the same typed NPC interaction commands and in-world positions as Warden Vesna. Purchases, sales and tempering pass through `GameSimulation` authorization: the correct nearby NPC, living hero, sufficient gold, inventory space, and a valid item/slot are all required. The Svelte panel displays status and sends typed actions while the world is paused. Vendors do not persist their stock, and no combat state is stored.

`Item.upgrades` (0–3) is a permanent part of purchased or dropped gear. A blacksmith upgrade adds armor or weapon damage and costs more after each temper. Character-only v8 saves include this gear and gold but not shop session state. Older saves are intentionally rejected instead of migrated.

## First dungeon and zone transitions

The `usePortal` command is the single authoritative path between the starting wilderness and the **Crypt of the Hollow Crown**. Phaser renders clickable stone gateways and the Svelte `DungeonPanel` offers the same action; the simulation automatically steers the hero within reach before travelling. `GameSnapshot.zone`, `dungeonStage` and `dungeonCleared` exist **only while the game is running**, never in `CharacterProgress`.

`generateCrypt(seed)` builds a deterministic crypt area with boundaries, pillars, rubble and guaranteed traversable access between the exit, guardian spawns and boss arena. The area reuses the collision-aware A* engine with its own geometry. `createCryptPack` first spawns three tougher guardians, then the **Crypt Lord** plus two retainers. The boss has substantially more health, area damage and a longer telegraphed windup. A single clear reward is granted once the final pack is defeated; the crypt does not auto-respawn its boss until a new entry. Leaving the crypt discards its current enemies and uncollected ground loot, while character XP, gold, inventory, equipment and quest flags remain. Reloading a saved character always starts at camp.

This is a playable procedural crypt environment, not a full multi-level, room-and-corridor generator. Further dungeon design, boss behavior and reward balancing are planned.

## Hosting and CI

`.github/workflows/pages.yml` builds and tests the Svelte SPA on game/build input changes, runs Chromium E2E, then uploads **`web/dist` only** to GitHub Pages. GitHub Pages is static hosting and no backend is required.

The workflow intentionally ignores documentation-only/test-only pushes; independent quality tests for changes to tests and pull requests are configured in `quality.yml`.

The Vite base path is `/dark_fantasy_2d_arpg/`. All bundle and imported asset URLs must work at this repository subpath.

## Technical gaps

- The scene includes a seeded wilderness and first crypt with a boss; full biome generation, multi-level dungeons, larger enemy packs, additional quests and full towns are not migrated.
- All six classes have two playable starter skills each; the complete original skill trees and advanced balance are not implemented yet.
- Ground and hero remain procedural placeholder graphics. Replace with coherent spritesheets/tilemaps while preserving core state.
- Obstacle-aware A* exists for click-to-move, but full navigation-mesh and dynamic obstacle handling remain future work.
- Saved characters start new sessions instead of restoring combat. Basic autosaving and one permanent quest are implemented; talent and learned-skill persistence requires those systems to be added.
- Networking is not implemented.
