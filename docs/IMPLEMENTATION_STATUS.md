# Aether & Ruin — Sequential Prompt Status

Source of truth: [2d_arpg_implementation_prompts.md](../2d_arpg_implementation_prompts.md) (63 numbered implementation prompts).

We will now complete foundational prompts in numeric order, even though early vertical-slice prototypes already include features from later steps. A feature existing in prototype form is **not** evidence that its full prompt acceptance criteria passed.

| Prompt | Status | Remaining essentials |
| --- | --- | --- |
| 01 — Foundation | Functional baseline; additional architecture docs remain | Current Svelte 5, Phaser 4, Vite, TS, CI and cs/en are deployed; fill required documentation progressively |
| **02 — Player Entity and Character Core** | **Core complete** | Separate stats, health/resource, movement, effect stack, animation state, skill data, equipment and interactions are in use; visual asset animation can expand later |
| 03 — Diablo-style mouse movement | **Core complete** | Mouse-hold movement, camera-relative updates, path throttle, reachability, collision, root/stun and debug destination are implemented; advanced navmesh remains optional |
| 04 — Mouse context resolver | **Core complete** | Ground, enemy, NPC, loot, UI, portal/door, chest and shrine resolve through one picker; in-world target highlight and distance checks active |
| 05 — Force move / hold position / skill aiming | **Core complete** | Configurable bindings with browser-local UI, Shift stand-still, mouse force move, 5 target modes, aim via cursor. More active skill slots and potions belong to later prompts |
| 06 — Central combat | **Core complete** | Physical + elemental damage, AoE, authoritative enemy projectile, crit, dodge, armor/resists, block, shield, healing and observable combat events; more attack families and balance follow |
| **07 — Warrior skills** | **Core complete (PR #20)** | Seven playable abilities, Rage, cooldowns, cursor targeting, auto-approach, Shift hold and interruptible hit frames; permanent skill trees belong to later prompts. |
| **08 — Animation & game feel** | **Core complete (PR #21; acceptance CI green)** | All six classes share authoritative hit-frame timelines. Animated 4-frame original Phaser pixel atlases for all hero/enemy types cover idle/walk/run/attack/cast/channel/hit/block/dodge/death; VFX pooling, crit, trail, death and block hooks. Higher-quality hand-painted art and visual tuning can expand later. |
| **09 — Status effect framework** | **Core complete (PR #21; acceptance CI green)** | All 15 statuses share one reducer with source/stack/expiry/immunity/dispel, visual hooks, CS/EN timers, and ability/on-hit producers for full initial catalog. Legacy HUD projections do not tick separately. |
| **10–11 — Enemy AI and families** | **Core complete (PR #21; acceptance CI green)** | Nine pure AI policies, active tactical roles including ranged, charger, caster, healer/support, collision-aware navigation/leashing. All 14 family definitions spawn with data-driven abilities, independent cooldowns, pixel art/animations and localized names. Dedicated summoner-family encounter and more complex boss phases remain future content. |
| **12–17 — Progression, items and elites** | **Runtime integrated in PR #28 — full acceptance verification underway** | All six isolated agent PRs are merged. Runtime simulation, saves, UI, loot and elite combat are connected. Merge only after green check/test/build/Chromium/site; GitHub Pages deployment verified after merge. |
| 18–29 — Act I content | Early vertical-slice prototype | Keep town, quest, commerce and crypt as integration fixtures until core gates pass |
| 30–63 | Not audited | Follow sequential prompts only after earlier acceptance criteria are met |

## Prompt 07–11 remaining acceptance closeout (integration PR #21)

- **One hit clock:** `combatTimeline.ts` drives basic attacks and every skill from all six classes. Class casts consume their cost at commitment, then apply centralized damage/status only at the fixed tick; stun/freeze and movement cancel their pending impact. Session snapshots expose `classAction` purely for rendering and deterministic debug; saves remain character-only v8.
- **Pixel art, not placeholder-only circles:** deterministic, original GPL-3.0-only Canvas2D-generated Phaser texture atlases in `pixelSpriteAtlas.ts` provide 4 frames × 10 animations × six classes and all defined enemy species. `FrontierScene` renders per-actor animated sprite frames and retains its original invisible Graphics as camera-follow anchors/fallback for collision/interaction. Future hand-painted artwork may replace the authored procedural sprites without changing keys or rules.
- **Complete status hooks:** `statusVisuals.ts` has all 15 distinct presentation descriptors; `statusIntegration.ts` is the only adapter for the existing legacy effect UI. First two class skills plus Warrior abilities/monster attacks can produce the complete catalog. Underlying combat math does not depend on Phaser.
- **Evidence:** `Prompt0711Acceptance.test.ts`, `Prompt0711Completion.test.ts`, old quest/dungeon/loot/controls suites, `npm run check`, Vitest, Vite build, Playwright Chromium and legacy reference check. **Acceptance CI (Node 22, types, Vitest, build, Playwright Chromium and legacy reference) passed for the integrated code. GitHub Pages publication is verified separately after merge.**

**Scope boundary:** Prompt 08 provides functional original pixel spritesheets, not purchased art or elaborate frame-by-frame hand-drawn production animation. The nine AI role policies are supported at planner level; actual Act I families exercise the roles assigned by their data (no family is currently a summoner). Additional classes' skill trees, potion UI, bespoke monster phases and world content belong to later numbered prompts.

## Wave C integration status (Prompts 12–17)

The six agent-owned modules were reviewed and merged to `main` in **prompt order**:
**#22 (XP) → #27 (catalog) → #23 (affixes) → #26 (inventory) → #24 (loot) → #25 (elites)**.
Their isolated green CI was necessary but did not itself constitute working runtime functionality.
[Integration PR #28](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/28) is the coordinator-owned runtime integration.

| Prompt | Implemented runtime behavior | Regression evidence |
| --- | --- | --- |
| 12 XP and levels | `awardProgression` + activity rewards (kills, boss, quest, exploration, crypt); configurable curve with multi-level rewards, five primary stats, HP/resource/damage, skill and talent points; HUD and Character Sheet | `WaveCProgressionRuntime.test.ts`, existing quest and dungeon suites |
| 13 Item model | 23 shared catalog bases including 14 weapon types, all 12 equipment slots, one/two-hand and offhand; six rarities, socket metadata and legendary damage effects, level gates, stable instance IDs | `Agent17ItemCatalog.test.ts`, `WaveCRuntimeIntegration.test.ts`, `WaveCSystemRegressions.test.ts` |
| 14 Affixes | Seeded prefix/suffix rolls with tier/item-level/rarity constraints and compatible pools; all rolled stat bonuses feed `deriveStats`; localized grammatical CS/EN names without reroll | `Agent18AffixGeneration.test.ts`, `WaveCLocalization.test.ts` |
| 15 Inventory and equipment | Authoritative atomic equip/unequip/swap/sort/drop/flags, full-bag and two-hand safeguards, offhand dual wield, save of flags, read-only comparison projection, UI rarity filter | `Agent19EquipmentRules.test.ts`, `WaveCSystemRegressions.test.ts` |
| 16 Loot | Contextual table rolls weighted by species, region, level, rarity, elite/boss; boss guaranteed + random, colored labels and beams, click-to-pickup and full-bag behavior | `Agent20LootTables.test.ts`, `ItemsAndClasses.test.ts`, `WaveCRuntimeIntegration.test.ts` |
| 17 Elites | Seeded compatible 1–3-modifier rolls, stats/resistance/visuals, status on hit, shield, regen, aura/hazard, teleport, summons and one-shot death burst. Scheduled damage uses `dealPlayerDamage` | `Agent21EliteModifiers.test.ts`, `WaveCRuntimeIntegration.test.ts`, `WaveCSystemRegressions.test.ts` |

**Persistence:** New character-only **format v9** keeps existing bag/gear IDs, affix rolls, flags, XP, level and point balances. `migrateV8Character` explicitly imports legacy v8 characters with original ten equipment slots into the twelve-slot model, preserving all owned items. v5–v7 world snapshots remain unsupported. Transient enemies, loot, projectiles, auras, zones, seeds, combat timers and world effects are deliberately excluded from character saves.

**Release gate:** Dedicated CI must pass npm ci, svelte-check, Vitest, build, Chromium Playwright and root `tests/site.test.mjs` for the **last integration commit**. Merge PR #28 only after this gate, then verify a successful Pages deployment of the merged SHA. Optional content after Wave C includes socket gem insertion, talent spending trees, additional world events and additional dungeon areas; these are separate future prompts, not claims of current gameplay.

## Prompt 02 implementation boundaries

- Class base values remain in `web/src/game/data/classes.ts`.
- Derivation and definitions of all five primary attributes and the requested derived stats are in `web/src/game/stats/deriveStats.ts`; `items.ts` re-exports the public `deriveStats` function for compatibility.
- Health/resource rules for character creation, gear-driven max-health changes and fixed-step class resource regeneration live in `web/src/game/entities/player.ts`.
- `GameSimulation.snapshot().stats` exposes the authoritative current values to the localized `web/src/ui/CharacterSheet.svelte` (C / Escape).
- Dodge, block, type-based resistances and transient shields are applied to actual incoming attacks; additional class/status/item stat modifiers will be added in later prompts.
- Saves contain only persistent class, level, XP, point balances, equipment, inventory, item flags, gold, kills and quest progression. No duplicate derived stats, UI state or combat state are written into IndexedDB.
- Unit regression tests: `Stats.test.ts`, `PlayerModel.test.ts`; browser check of C and in-dialog locale switching: `startup.spec.ts`.

## Completed agent merge and runtime integration

All five parallel agent PRs were merged separately (#1, #5, #2, #3, #4), then connected in PR #6. PR #7 completes the remaining core acceptance behaviors: held movement with throttling, interaction targets, configurable controls, cursor-based skill aiming, root/stun, healing/shields and projectile/resistance resolution. Unit and browser tests validate runtime behavior rather than merely imported modules. Remaining content expansion belongs to later prompts.

**Compatibility:** Q/RMB remains the first implemented skill, 1 the second. Future potion and skill slots 2–4 have configurable action bindings but no abilities until their implementation prompts. Browser-local input preferences are not part of character saves. Character-only IndexedDB format v9 explicitly migrates v8; evade cooldown, shields, missiles, chest/shrine uses, input state, world seed, enemies and combat remain ephemeral.

## Multi-agent contribution policy

Independent coding agents can work on **separate feature branches and pull requests**, each limited to a single numbered prompt or a non-overlapping subsystem. Avoid concurrent edits to `GameSimulation.ts`, the shared type contracts, the save DTO and locale catalogs without an integration owner; combine PRs only after typecheck, deterministic tests, browser smoke tests and Pages deployment checks succeed. The main branch remains the released integration point.

## Prompt 07–11 integrator completion pass (PR #20)

This follow-up integration is **not a parallel agent contribution**: coordinator alone owns GameSimulation, types, renderer, i18n, runtime tests and merging. The initial Wave B PR #19 is already deployed; PR #20 consolidates the new mechanics without changing the character-only save DTO.

**Important acceptance boundary:** Passing the native browser build and deterministic tests confirms functional core behavior, not the availability of bespoke art. Procedural Phaser Graphics silhouettes and combat cues are legal, original-project fallback graphics. Dedicated independently licensed or GPL-compatible spritesheets/atlas sources and per-class animation art are not yet bundled, and Prompt 08 should not be marked fully complete until those assets are authored, animated and visually validated.

**Validation gate for this PR:** Node 22 installation, svelte-check, Vitest (including `Prompt0711Acceptance.test.ts`), production Vite build, Playwright Chromium, root legacy site test, then successful Pages deployment after squash merge. Early intermediate commits deliberately had failing legacy combat fixture tests due to new hit-frame timing; only the final head’s full green CI authorizes merge.

## Wave B integration checkpoint

The ten isolated Wave B modules (agents 06–15) were merged earlier. This coordinator integration connects them to runtime on the dedicated integration PR. Public save DTO v8 and the initial wilderness tutorial/crypt encounters are unchanged. New content cycles into wilderness waves 2–5. Only mark Prompts 07–11 complete after all original acceptance criteria, full deterministic tests, visual asset coverage and browser gameplay regression gates are met. Avoid claiming that the merged helper modules alone satisfy full prompts.
