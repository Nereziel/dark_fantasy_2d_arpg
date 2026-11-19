# Aether & Ruin — Sequential Prompt Status

Source of truth: [2d_arpg_implementation_prompts.md](../2d_arpg_implementation_prompts.md) (63 numbered implementation prompts).

We will now complete foundational prompts in numeric order, even though early vertical-slice prototypes already include features from later steps. A feature existing in prototype form is **not** evidence that its full prompt acceptance criteria passed.

| Prompt | Status | Remaining essentials |
| --- | --- | --- |
| 01 — Foundation | Functional baseline; additional architecture docs remain | Current Svelte 5, Phaser 4, Vite, TS, CI and cs/en are deployed; fill required documentation progressively |
| **02 — Player Entity and Character Core** | **Core module integrated** | Complete modular combat/animation/interaction ownership and remaining acceptance checks |
| 03 — Diablo-style mouse movement | **Partially integrated** | Nearest reachable click destinations work; held-button movement and repath throttling still missing |
| 04 — Mouse context resolver | **Partially integrated** | One click resolver and contextual cursor live; shrine, chests, hover highlights and interaction validation need expansion |
| 05 — Force move / hold position / skill aiming | **Partially integrated** | Middle-click force move, Shift hold, Space evade, targeted RMB; UI rebinding and extra slots are still future work |
| 06 — Central combat | **Partially integrated** | Typed attacks, player dodge/block, typed skill damage and healing live; magic resistances for incoming hits, shields, complete damage events and balance remain |
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
- Dodge and block are applied to incoming physical hits. Resistances for currently absent nonphysical enemy damage, shields and advanced mechanics are not yet fully integrated.
- Saves still contain only class, level, equipment, inventory, gold and quest progression. No duplicate derived stats, UI state or combat state are written into IndexedDB.
- Unit regression tests: `Stats.test.ts`, `PlayerModel.test.ts`; browser check of C and in-dialog locale switching: `startup.spec.ts`.

## Completed agent merge and runtime integration

All five parallel agent PRs were merged separately (#1, #5, #2, #3, #4). Their standalone modules were connected in the integration branch for PR #6. The new integration tests cover blocked destinations, hold position, evade cooldown, targeted skills and typed incoming damage; Playwright verifies keyboard integration. **A merged module is not by itself the complete acceptance criteria for the numbered prompt.** The remaining gaps in the table above are explicit.

**Compatibility:** Q/RMB remains the first implemented skill, 1 the second. Bindings for future potions and skill slots exist but are not activated. Character-only IndexedDB format v8 remains unchanged; evade cooldown, holding position, world seed, enemy state and damage remain ephemeral.

## Multi-agent contribution policy

Independent coding agents can work on **separate feature branches and pull requests**, each limited to a single numbered prompt or a non-overlapping subsystem. Avoid concurrent edits to `GameSimulation.ts`, the shared type contracts, the save DTO and locale catalogs without an integration owner; combine PRs only after typecheck, deterministic tests, browser smoke tests and Pages deployment checks succeed. The main branch remains the released integration point.
