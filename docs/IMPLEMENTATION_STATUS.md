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
| 07 — Warrior skills | Acceptance implementation in PR #20; final CI pending | All seven Warrior skills, RMB/Q, 1, 2–6 and click-to-attack share authoritative hit-frame timing. Rage/cooldowns, target approach, hold-position and interruption are tested. Mark Core complete only after final CI and in-browser validation. |
| 08 — Animation & game feel | Advanced procedural integration; atlas art still pending | Fixed-tick Warrior timing, casting/channeling projections, impact/death/hit flashes, visual knockback trails, crit feedback and pooled Phaser graphics. All-class animation atlases/spritesheets and delayed legacy non-Warrior attacks need dedicated production art and follow-up. |
| 09 — Status effect framework | Acceptance implementation in PR #20; final CI pending | All 15 definitions use one statusRuntime timer/stacking model. Legacy skill DoTs are routed to the canonical reducer, with compatibility-only HUD views, immunity, duration, periodic ticks, modifiers, dispel through healer and CS/EN UI. Remaining content needs additional producers of every effect. |
| 10–11 — Enemy AI and families | Acceptance implementation in PR #20; final CI pending | Pure AI policy with collision-aware LOS, pursuit, leash, patrol, caster/ranged/melee/charger/healer/support roles. All 14 monster data entries spawn in rotating packs; tactical special abilities, heal, buffs, debuffs and per-ability cooldowns are wired to live simulation. Dedicated authored spritesheets and complete variation for all nine AI roles remain a content/art task. |
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

## Prompt 07–11 integrator completion pass (PR #20)

This follow-up integration is **not a parallel agent contribution**: coordinator alone owns GameSimulation, types, renderer, i18n, runtime tests and merging. The initial Wave B PR #19 is already deployed; PR #20 consolidates the new mechanics without changing the character-only save DTO.

**Important acceptance boundary:** Passing the native browser build and deterministic tests confirms functional core behavior, not the availability of bespoke art. Procedural Phaser Graphics silhouettes and combat cues are legal, original-project fallback graphics. Dedicated independently licensed or GPL-compatible spritesheets/atlas sources and per-class animation art are not yet bundled, and Prompt 08 should not be marked fully complete until those assets are authored, animated and visually validated.

**Validation gate for this PR:** Node 22 installation, svelte-check, Vitest (including `Prompt0711Acceptance.test.ts`), production Vite build, Playwright Chromium, root legacy site test, then successful Pages deployment after squash merge. Early intermediate commits deliberately had failing legacy combat fixture tests due to new hit-frame timing; only the final head’s full green CI authorizes merge.

## Wave B integration checkpoint

The ten isolated Wave B modules (agents 06–15) were merged earlier. This coordinator integration connects them to runtime on the dedicated integration PR. Public save DTO v8 and the initial wilderness tutorial/crypt encounters are unchanged. New content cycles into wilderness waves 2–5. Only mark Prompts 07–11 complete after all original acceptance criteria, full deterministic tests, visual asset coverage and browser gameplay regression gates are met. Avoid claiming that the merged helper modules alone satisfy full prompts.
