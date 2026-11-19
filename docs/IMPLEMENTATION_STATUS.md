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
| 07 — Warrior skills | Prototype | Full Warrior kit, cooldowns and animation timing |
| 08 — Animation & game feel | Not complete | Visual animation state machine, timed hit frames and hit reactions |
| 09 — Status effect framework | Prototype | Generic stacking, expiry, resistance and dispel framework |
| 10–11 — Enemy AI and families | Prototype | Reusable AI behaviors, more families and actual differentiated combat roles |
| 12–17 — Progression and items | Partial | Per-prompt acceptance gates rather than broader content additions |
| 18–29 — Act I content | Early vertical-slice prototype | Keep town, quest, commerce and crypt as integration fixtures until core gates pass |
| 30–63 | Not audited | Follow sequential prompts only after earlier acceptance criteria are met |

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
