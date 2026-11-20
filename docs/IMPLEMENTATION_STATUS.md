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
| **08 — Animation & game feel** | **Core acceptance implemented in PR #21; final CI/deploy pending** | All six classes share authoritative hit-frame timelines. Animated 4-frame original Phaser pixel atlases for all hero/enemy types cover idle/walk/run/attack/cast/channel/hit/block/dodge/death; VFX pooling, crit, trail, death and block hooks. Higher-quality hand-painted art and visual tuning can expand later. |
| **09 — Status effect framework** | **Core acceptance implemented in PR #21; final CI/deploy pending** | All 15 statuses share one reducer with source/stack/expiry/immunity/dispel, visual hooks, CS/EN timers, and ability/on-hit producers for full initial catalog. Legacy HUD projections do not tick separately. |
| **10–11 — Enemy AI and families** | **Core acceptance implemented in PR #21; final CI/deploy pending** | Nine pure AI policies, active tactical roles including ranged, charger, caster, healer/support, collision-aware navigation/leashing. All 14 family definitions spawn with data-driven abilities, independent cooldowns, pixel art/animations and localized names. Dedicated summoner-family encounter and more complex boss phases remain future content. |
| 12–17 — Progression and items | Partial; Wave C agents prepared, not dispatched | Six non-overlapping assignments (agents 16–21) in docs/plan/agents/WAVE_C.md; no claim that agent modules or runtime gates have been implemented. |
| 18–29 — Act I content | Early vertical-slice prototype | Keep town, quest, commerce and crypt as integration fixtures until core gates pass |
| 30–63 | Not audited | Follow sequential prompts only after earlier acceptance criteria are met |

## Prompt 07–11 remaining acceptance closeout (integration PR #21)

- **One hit clock:** `combatTimeline.ts` drives basic attacks and every skill from all six classes. Class casts consume their cost at commitment, then apply centralized damage/status only at the fixed tick; stun/freeze and movement cancel their pending impact. Session snapshots expose `classAction` purely for rendering and deterministic debug; saves remain character-only v8.
- **Pixel art, not placeholder-only circles:** deterministic, original GPL-3.0-only Canvas2D-generated Phaser texture atlases in `pixelSpriteAtlas.ts` provide 4 frames × 10 animations × six classes and all defined enemy species. `FrontierScene` renders per-actor animated sprite frames and retains its original invisible Graphics as camera-follow anchors/fallback for collision/interaction. Future hand-painted artwork may replace the authored procedural sprites without changing keys or rules.
- **Complete status hooks:** `statusVisuals.ts` has all 15 distinct presentation descriptors; `statusIntegration.ts` is the only adapter for the existing legacy effect UI. First two class skills plus Warrior abilities/monster attacks can produce the complete catalog. Underlying combat math does not depend on Phaser.
- **Evidence:** `Prompt0711Acceptance.test.ts`, `Prompt0711Completion.test.ts`, old quest/dungeon/loot/controls suites, `npm run check`, Vitest, Vite build, Playwright Chromium and legacy reference check. **Only label final verification passed after the newest PR #21 head's full CI and Pages deployment are green.**

**Scope boundary:** Prompt 08 provides functional original pixel spritesheets, not purchased art or elaborate frame-by-frame hand-drawn production animation. The nine AI role policies are supported at planner level; actual Act I families exercise the roles assigned by their data (no family is currently a summoner). Additional classes' skill trees, potion UI, bespoke monster phases and world content belong to later numbered prompts.

## Wave C: preparatory agent work only

[Wave C plan](plan/agents/WAVE_C.md) and [integration plan](plan/agents/INTEGRATION_C.md), plus individual agent prompts `16/TASK.md`–`21/TASK.md`, assign six exactly non-overlapping source/test pairs for Prompts 12–17. The six agents **have not been launched**. Start from a common green `main` SHA after PR #21 merge and follow TDD and integration gates.

## Prompt 02 implementation boundaries

- Class base values remain in `web/src/game/data/classes.ts`.
- Derivation and definitions of all five primary attributes and the requested derived stats are in `web/src/game/stats/deriveStats.ts`; `items.ts` re-exports the public `deriveStats` function for compatibility.
- Health/resource rules for character creation, gear-driven max-health changes and fixed-step class resource regeneration live in `web/src/game/entities/player.ts`.
- `GameSimulation.snapshot().stats` exposes the authoritative current values to the localized `web/src/ui/CharacterSheet.svelte` (C / Escape).
- Dodge, block, type-based resistances and transient shields are applied to actual incoming attacks; additional class/status/item stat modifiers will be added in later prompts.
- Saves still contain only class, level, equipment, inventory, gold and quest progression. No duplicate derived stats, UI state or combat state are written into IndexedDB.
- Unit regression tests: `Stats.test.ts`, `PlayerModel.test.ts`; browser check of C and in-dialog locale switching: `startup.spec.ts`.

## Completed agent merge and runtime integration

All five parallel agent PRs were merged separately (#1, #5, #2, #3, #4), then connected in PR #6. PR #7 completes the remaining core acceptance behaviors: held movement with throttling, interaction targets, configurable controls, cursor-based skill aiming, root/stun, healing/shields and projectile/resistance resolution. Unit and browser tests validate runtime behavior rather than merely imported modules. Remaining content expansion belongs to later prompts.

**Compatibility:** Q/RMB remains the first implemented skill, 1 the second. Future potion and skill slots 2–4 have configurable action bindings but no abilities until their implementation prompts. Browser-local input preferences are not part of character saves. Character-only IndexedDB format v8 remains unchanged; evade cooldown, shields, missiles, chest/shrine uses, input state, world seed, enemies and combat remain ephemeral.

## Multi-agent contribution policy

Independent coding agents can work on **separate feature branches and pull requests**, each limited to a single numbered prompt or a non-overlapping subsystem. Avoid concurrent edits to `GameSimulation.ts`, the shared type contracts, the save DTO and locale catalogs without an integration owner; combine PRs only after typecheck, deterministic tests, browser smoke tests and Pages deployment checks succeed. The main branch remains the released integration point.

## Prompt 07–11 integrator completion pass (PR #20)

This follow-up integration is **not a parallel agent contribution**: coordinator alone owns GameSimulation, types, renderer, i18n, runtime tests and merging. The initial Wave B PR #19 is already deployed; PR #20 consolidates the new mechanics without changing the character-only save DTO.

**Important acceptance boundary:** Passing the native browser build and deterministic tests confirms functional core behavior, not the availability of bespoke art. Procedural Phaser Graphics silhouettes and combat cues are legal, original-project fallback graphics. Dedicated independently licensed or GPL-compatible spritesheets/atlas sources and per-class animation art are not yet bundled, and Prompt 08 should not be marked fully complete until those assets are authored, animated and visually validated.

**Validation gate for this PR:** Node 22 installation, svelte-check, Vitest (including `Prompt0711Acceptance.test.ts`), production Vite build, Playwright Chromium, root legacy site test, then successful Pages deployment after squash merge. Early intermediate commits deliberately had failing legacy combat fixture tests due to new hit-frame timing; only the final head’s full green CI authorizes merge.

## Wave B integration checkpoint

The ten isolated Wave B modules (agents 06–15) were merged earlier. This coordinator integration connects them to runtime on the dedicated integration PR. Public save DTO v8 and the initial wilderness tutorial/crypt encounters are unchanged. New content cycles into wilderness waves 2–5. Only mark Prompts 07–11 complete after all original acceptance criteria, full deterministic tests, visual asset coverage and browser gameplay regression gates are met. Avoid claiming that the merged helper modules alone satisfy full prompts.
