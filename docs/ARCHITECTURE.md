# Aether & Ruin — Architecture

## Production stack

The site at `https://nereziel.github.io/dark_fantasy_2d_arpg/` now deploys **`web/dist/`** instead of the old root HTML engine. The original root HTML engine is kept for reference. The [roadmap](ROADMAP.md) tracks campaign and release scope.

- **Svelte 5:** menu, selection of six classes, HUD, inventory/equipment, localized NPC dialogue, merchant and blacksmith panels, quest journal and runtime locale.
- **Phaser 4.2.1:** world canvas, camera, input picking, actor proxies, seeded wilderness and crypt terrain, portal drawings, safe starter camp, loot graphics, individual enemy/boss visuals, selected-target indicators and telegraphs.
- **Character model (Prompt 02):** `web/src/game/stats/deriveStats.ts` owns primary and derived character stats; `web/src/game/entities/player.ts` owns spawn, max-health adjustments and resource regeneration. All derive on demand from class base values and equipped items. Svelte `CharacterSheet` is a read-only projection opened with C and is translated in CS/EN. Derived dodge/block and elemental resistances are now applied to incoming attack types; shields absorb after mitigation and are ephemeral. Further life-steal and advanced stat content is deferred to future item/skill prompts.
- **Strict TypeScript simulation:** authoritative movement and collision, combat timelines, skills, status effects, enemy AI and bosses, zone transitions, progression, loot, economy, inventory/equipment and quest state.
- **`svelte-i18n`:** Czech and English dictionaries, changed without reloading the game.
- **IndexedDB:** versioned character and world records, with debounced character autosave and manual save.
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

## Integrated foundational modules (Prompts 02–06)

- `web/src/game/entities/player.ts` and `web/src/game/stats/deriveStats.ts` are used by the simulation for hero creation, equipment-driven statistics, health and regeneration (Agent 01).
- `resolveReachableDestination` in `web/src/game/world/navigation.ts` finds the closest reachable point for blocked ground destinations. The simulation computes an A* route to this point, so clicking a wall is not silently ignored (Agent 02).
- `web/src/game/input/contextResolver.ts` resolves terrain, enemy, loot, NPC and portal targets deterministically. `FrontierScene` uses it for both click commands and contextual cursor hints; blocked ground is forwarded to reachability resolution (Agent 03).
- `web/src/game/input/bindings.ts` maps browser `KeyboardEvent.code` and mouse buttons into actions. `gameBindings.ts` uses the same defaults for live input. Right-click and 1–6 activate skills, Q uses the potion, Shift holds position, middle-click forces movement and Space evades.
- `web/src/game/combat/typedDamage.ts` resolves physical and elemental damage, dodge/block and healing. The simulation runs on a fixed time step.


The core acceptance behaviors of Prompts 02–06 are now integrated. `HeldPointerMovement` throttles the held LMB command stream (110 ms / 12 px); camera-follow updates the world-space destination even if the mouse remains still. `playerMovement.ts` owns collision-aware pursuit and smooth speed ramp/braking, `playerAnimation.ts` projects the state to scene animation, and `effectStack.ts` owns effect refreshing. Root/stun stop player locomotion.

The scene displays chest/shrine and NPC/enemy/loot highlights. `WorldObject` IDs are resolved via the same context picker; activation, path distance and one-time rewards are authorized by simulation. `ControlsPanel` maps keyboard/mouse triggers via the existing immutable bindings API and stores only browser-local user preferences (not character progression). Supported cursor aims: SELF, TARGET_ENTITY, GROUND_POSITION, DIRECTION, AREA; current examples include Mage fireball/frost nova and Warrior/Rogue dashes.

The combat pipeline now also handles shadow bolts as authoritative delayed projectiles, physical/melee and poison attacks, shields from Paladin consecration and a wilderness shrine, elemental defense values, AoE skills, cooldowns and observable `damageResolved`/`projectileImpact` events.

## Enemy combat and navigation

`web/src/game/enemies/enemies.ts` defines three enemy archetypes: Wraith (ranged bolt and kiting), Skeleton Warrior (close sweep) and Corrupted Wolf (fast pursuit, telegraphed leap and poison). All three spawn **simultaneously** as the opening encounter pack. Story-specific wave and miniboss rules govern later encounters. Their actor states, effects, cooldowns and windups are independent, with unique IDs. Target selection is explicit and supports clicking a sprite or a Svelte target-list entry.

The game simulation owns attack decisions, locked danger zones and damage on fixed ticks. Phaser only draws warnings, enemy outlines and effects. Stuns interrupt the affected enemy's windup without affecting unrelated actors.

`web/src/game/world/navigation.ts` provides collision-aware movement and deterministic A* navigation. `web/src/game/world/generator.ts` builds a small wilderness layout from a **per-session seed**. The safe camp and encounter spawns remain accessible while randomized extra ruins use the same collision and graphical geometry. This is an initial procedural slice, not yet a full biome/tilemap generator.

## Persistence

`GameSnapshot` is an ephemeral renderer-facing projection. `SaveRepository` writes validated character v11 records and supports explicit migrations from web v8–v10. `WorldProgressRepository` keeps world v1 records per character, including the seed, discovery, checkpoints and durable one-shot facts. The bridge opens a fresh session at camp and uses the saved seed and eligible facts when a compatible record is present. `CharacterAutosaver` coalesces changes and serializes writes. Its page-hide flush is best-effort.

## First camp NPC and permanent quest progress

`web/src/game/quests/firstQuest.ts` defines the stable quest ID `ashes_at_gate`, progression validation, a three-kill objective and one-time reward. `web/src/game/world/npcs.ts` owns the warden's position and interaction range. Clicking Warden Vesna in Phaser or the Svelte quest-journal action sends the same typed `interactNpc` command; the simulation moves the hero into range and emits a dialogue event. The bilingual dialog pauses combat and exposes typed quest accept/turn-in actions. Only kills **after acceptance** count, and rewards cannot be claimed twice.

The allowlisted character record includes the validated Act I quest ledger. It retains the story outcomes and claimed-reward flags after reloading.

## Camp commerce

`web/src/game/trade/commerce.ts` defines deterministic merchant stock, prices, sell values and pure blacksmith upgrade operations. The player talks to Merchant Bram or Blacksmith Odan through the same typed NPC interaction commands and in-world positions as Warden Vesna. Purchases, sales and tempering pass through `GameSimulation` authorization: the correct nearby NPC, living hero, sufficient gold, inventory space, and a valid item/slot are all required. The Svelte panel displays status and sends typed actions while the world is paused. Vendors do not persist their stock, and no combat state is stored.

`Item.upgrades` (0–3) is a permanent part of purchased or dropped gear. A blacksmith upgrade adds armor or weapon damage and costs more after each temper. Gear and gold persist in the character record. Shop session state is transient.

## First dungeon and zone transitions

The `usePortal` command is the single authoritative path between the starting wilderness and the **Crypt of the Hollow Crown**. Phaser renders clickable stone gateways and the Svelte `DungeonPanel` offers the same action; the simulation automatically steers the hero within reach before travelling. `GameSnapshot.zone`, `dungeonStage` and `dungeonCleared` exist **only while the game is running**, never in `CharacterProgress`.

The seed-based crypt shares its room/corridor geometry across rendering, movement and collision. Its guardian encounter leads to a three-phase Hollow King fight with damage windows, hazards and bounded summons. The quest ledger records the relevant victory, unlocks Vesna’s final report and projects Act II eligibility after the report is complete.

## Hosting and CI

[`quality.yml`](../.github/workflows/quality.yml) validates PRs and eligible pushes. A verified push with published input changes or a manual dispatch publishes `web/dist/` to Pages. Documentation-only and test-only pushes do not deploy.

Vite serves the game and its assets at `/dark_fantasy_2d_arpg/`. The client runs without a server.
