# Aether & Ruin — Sequential Prompt Status

Source of truth: [2d_arpg_implementation_prompts.md](../2d_arpg_implementation_prompts.md) (63 numbered implementation prompts).

We will now complete foundational prompts in numeric order, even though early vertical-slice prototypes already include features from later steps. A feature existing in prototype form is **not** evidence that its full prompt acceptance criteria passed.

| Prompt | Status | Remaining essentials |
| --- | --- | --- |
| 01 — Foundation | Functional baseline; additional architecture docs remain | Current Svelte 5, Phaser 4, Vite, TS, CI and cs/en are deployed; fill required documentation progressively |
| **02 — Player Entity and Character Core** | **In progress — derived-stat and player health/resource extraction implemented** | Complete modular combat/animation/interaction ownership and any remaining acceptance checks |
| 03 — Diablo-style mouse movement | Prototype | Held-button movement, nearest reachable destination, repath throttling and smoother transitions |
| 04 — Mouse context resolver | Prototype | Centralized input picking and hover feedback for all categories |
| 05 — Force move / hold position / skill aiming | Not complete | Configurable bindings, force move, stand-still and cursor-based skill targeting |
| 06 — Central combat | Prototype | Damage types, resistances, dodge, block, shields and a unified damage pipeline |
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
- Secondary stats without a corresponding damage pipeline mechanic are explicitly described as informational until Prompt 06.
- Saves still contain only class, level, equipment, inventory, gold and quest progression. No duplicate derived stats, UI state or combat state are written into IndexedDB.
- Unit regression tests: `Stats.test.ts`, `PlayerModel.test.ts`; browser check of C and in-dialog locale switching: `startup.spec.ts`.

## Multi-agent contribution policy

Independent coding agents can work on **separate feature branches and pull requests**, each limited to a single numbered prompt or a non-overlapping subsystem. Avoid concurrent edits to `GameSimulation.ts`, the shared type contracts, the save DTO and locale catalogs without an integration owner; combine PRs only after typecheck, deterministic tests, browser smoke tests and Pages deployment checks succeed. The main branch remains the released integration point.
