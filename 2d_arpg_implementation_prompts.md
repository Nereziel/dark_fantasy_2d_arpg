# 2D Dark Fantasy ARPG — Sequential Implementation Prompts for Codex

Use these **63 prompts in order**. Each step must preserve a playable, testable browser game and support deployment to GitHub Pages.

This plan modernizes the **existing Aether & Ruin HTML5 Canvas prototype**. Reuse its functioning classes, quests, combat, inventory and world systems where practical. **Old save files do not need to be supported or imported.** The target is a top-down dark-fantasy ARPG with Diablo-like mouse movement, six classes, five acts, procedural locations and future multiplayer-readiness.

## Project licensing and third-party material

- All original Aether & Ruin code, graphics, animation, audio, narrative, game data, documentation, and CS/EN translations are licensed **GPL-3.0-only** as stated in the root `LICENSE` and `README.md`.
- Third-party libraries, fonts, and assets **retain their own licenses**; do not silently relicense, remove copyright notices, or include content of unknown provenance. Maintain `THIRD_PARTY_LICENSES.md` as dependencies and artwork change.
- When creating `web/package.json`, set `"license": "GPL-3.0-only"`. Record package-specific and asset-specific third-party notices separately; package metadata does not override dependency licenses.
- Preserve editable/source forms of original asset files where available, and satisfy GPLv3 corresponding-source obligations when distributing the game.
- Licensing-only changes to `LICENSE`, `THIRD_PARTY_LICENSES.md`, and `README.md` must not trigger a new GitHub Pages deployment unless deployed game content also changes.

## Required Technology Stack

This is the project's selected architecture. **Do not switch to Godot, React, Next.js, an SSR-only app or a monolithic HTML engine** without an explicit new decision.

| Layer | Technology | Responsibility |
| --- | --- | --- |
| UI | **Svelte 5** with runes | HUD, menus, inventory, equipment, talent trees, dialogue, merchants, settings |
| Game rendering | **Phaser 4** | Scenes, spritesheets, tilemaps, camera, animation, particles, visual effects and input adapter |
| Gameplay | **TypeScript** (strict) | Authoritative state, combat, entities, movement, AI, quests, item rules, deterministic generation |
| Tooling | **Vite**, `@sveltejs/vite-plugin-svelte` | Development server, hot reload, client-side SPA and static production bundle |
| UI state bridge | Typed commands/events and Svelte-facing read-only projections | Communication without tight coupling |
| Persistence | **IndexedDB** (saves), `localStorage` (preferences only) | Versioned saves for the current game format (no legacy importer) |
| Tests | **Vitest**, **Playwright**, `svelte-check` | Logic tests, browser tests, static checks |
| Deployment | **GitHub Actions → GitHub Pages** | Publish `dist/`, no runtime backend |
| Localization | **`svelte-i18n`**, `cs` and `en` | Runtime language switching, ICU messages, localized game UI and content |

Use compatible stable versions and a committed `package-lock.json`; verify installed Phaser 4 APIs and plugins rather than copying Phaser 3-specific code. Prefer Svelte component CSS or installed/build-time Tailwind, **not** the Tailwind CDN in production.

## Architecture Rules and Ownership

1. **Pure TypeScript simulation** (`src/game/core`, `entities`, `combat`, `systems`, `world`): Owns player HP, positions, cooldowns, damage, inventory, loot, NPC/quest state, RNG and saving. It must not import Phaser, Svelte or the DOM.
2. **Phaser adapter** (`src/game/phaser`): Owns `Phaser.Game`, scenes, sprite and tilemap rendering, camera, pointer world-coordinate conversion, animation, VFX and audio adapters. Phaser GameObjects are **views**, not authoritative game entities.
3. **Svelte UI** (`src/ui`): Owns menus, overlay modals, inventory display and HUD. Components observe read-only state projections and submit typed game commands. Never edit core game state or Phaser GameObjects directly.
4. **Typed bridge** (`src/game/bridge`): `GameCommand` → simulation → `GameEvent`/`GameSnapshot` → Phaser visuals and Svelte projections. Avoid `window.gameApp`, cross-layer globals and circular imports.
5. **Fixed-step simulation**: Keep rules and RNG deterministic; Phaser can interpolate visuals. Do not stream every sprite position into Svelte at 60 FPS; publish only meaningful UI updates.
6. **Centralized input**: Phaser handles world clicks and configurable keyboard actions. Interactive Svelte overlays must prevent world click-through, keyboard shortcuts while typing and unwanted attacks under menus.
7. **Data and assets**: Typed IDs and content definitions live in `src/data` / `src/shared`. Use image atlases, tilesets and licensed art in `public/assets`, or Vite-imported asset URLs. Do not hardcode leading-slash URLs that break the Pages subpath.
8. **No backend in this phase**: Pages supports a static SPA. Offline browser saves work locally; multiplayer/cloud sync requires a separate future server.
9. **i18n boundary**: All player-facing text resolves through `svelte-i18n` or a typed localization facade. Stable gameplay IDs, save DTOs, loot rolls and event payloads must never depend on translated display strings.

```text
World pointer/keys → Phaser Input Adapter ─┐
                                          ↓
Svelte UI actions ───────────────────→ Typed Command Bus
                                          ↓
                               Pure TypeScript Simulation
                                          ↓
                              Events + read-only snapshots
                                 ├──────────────┐
                                 ↓              ↓
                              Phaser views   Svelte stores
                                 ↓              ↓
                              World/FX        HUD/menus
```

## Localization Contract — Czech and English (Required)

Use **`svelte-i18n`** as the project-wide i18n library in the **Svelte 5 + Vite SPA**, starting with **Prompt 01**. Do not implement a parallel home-grown translation system or postpone internationalization until the full campaign is complete. The supported locale codes are **`cs`** (Czech) and **`en`** (English). Both locales must work on the static GitHub Pages build, with no translation API/backend.

**Required implementation:**

1. Create `web/src/i18n/index.ts` to initialize `svelte-i18n` (locale, fallback, dictionary registration), and `web/src/i18n/locales/cs.json` and `en.json`. Configure ICU formatting for parameters, plurals, numbers and dates; use the browser's `Intl` APIs and locale-specific formatting. Keep messages as translation keys rather than inline literals.
2. The game boots in the stored language preference, or falls back to the browser language (`cs` for `cs*`, `en` otherwise). If neither matches, use a documented default (English). Provide an obvious **Čeština / English** selector on the initial main menu and in Settings.
3. Changing the language **immediately updates Svelte UI without reloading the page**, remounting Phaser, restarting gameplay or changing the save. Persist only the selected locale in versioned preferences (`localStorage` is acceptable); language is **not** part of the character/world save. Set `document.documentElement.lang`, page title, menus, tooltips and accessible labels on switch.
4. Translate **all player-facing strings**, including character classes/descriptions, HP/resource labels, HUD, pause/menu buttons, inputs, errors, death/respawn screens, tooltips, item prefixes/suffixes, randomized item names, rarities, statistics, skill/talent names and descriptions, class-specific resources, NPC dialogue and dialogue choices, quest names/objectives/journal, map labels/waypoints, merchants, currencies, crafting, notifications, controls, settings, help and all five acts. Only intentional fantasy proper names may be left identical in both languages.
5. **Never translate gameplay identifiers**. Item templates, affix IDs, NPC IDs, ability IDs, quest IDs, resource codes, zone IDs, command/event types and serialized save fields remain stable language-neutral IDs. Authoritative TypeScript simulation sends IDs and interpolation values; an i18n-aware presenter formats localized text on demand.
6. Store dynamic content as structured definitions: e.g. `{ itemBaseId, prefixId, suffixId, rollValues }`; localize each segment and apply grammar-aware templates, **not** English-only word concatenation. For Czech handle gender, grammatical cases and plural categories where context requires; avoid awkward translated affix order. Use ICU plural/select messages instead of `count === 1` shortcuts.
7. Phaser world labels, damage text, NPC bubbles and quest markers must get their display strings through a small typed i18n adapter, not directly import Svelte stores in simulation or keep stale cached English labels. Update labels on locale change, without recreating the world or losing input state. Numeric damage itself remains language-independent.
8. Prevent missing translation keys and placeholder mismatches: add a **Vitest translation integrity suite** comparing `cs` and `en`, verifying non-empty messages, ICU parseability, required variables and basic Czech/English plural cases. Ensure Svelte's build/typecheck catches bad translation access where practical. Playwright must verify changing language mid-game updates visible UI and dialogue without a reload, then persists on browser refresh.
9. Define consistent keys/namespaces such as `menu.start`, `hud.health`, `item.rarity.legendary`, `skill.warrior.whirlwind.name`, `quest.act1.corruption.title` and `npc.blacksmith.greeting`. Document naming, placeholders, translation review and fallback behavior in `docs/LOCALIZATION.md`.
10. Translation file changes are **game build inputs**: once the new Svelte app becomes production, the Pages deploy path allowlist must cover `web/src/i18n/**` (already included by `web/src/**`) and any message catalogs moved outside `web/src`. Language catalog changes under `web/src/**` are now published game inputs and trigger the normal tests/build/Pages deploy.

**Example messages:**

```json
// en.json (illustrative fragment)
{
  "menu": { "continue": "Continue", "settings": "Settings" },
  "hud": { "health": "Health", "gold": "Gold: {count}" },
  "inventory": { "potions": "{count, plural, one {# potion} other {# potions}}" }
}
```

```json
// cs.json (illustrative fragment)
{
  "menu": { "continue": "Pokračovat", "settings": "Nastavení" },
  "hud": { "health": "Životy", "gold": "Zlato: {count}" },
  "inventory": { "potions": "{count, plural, one {# lektvar} few {# lektvary} other {# lektvarů}}" }
}
```

The JSON blocks above are illustrative fragments (comments are documentation only; actual `.json` catalogs must be valid JSON).

**Localization acceptance gate:** Boot, main menu, character creation, HUD, first inventory and first NPC/quest dialogue must already be bilingual during the initial vertical slice. Each subsequent content prompt delivers its Czech and English text **in the same task**, not in a final translation cleanup sprint.

## GitHub Pages Contract

- **Current decision (November 2026):** Publish the new **Svelte 5 / Phaser 4** app at the main GitHub Pages URL immediately, even before complete legacy feature parity. Keep old root HTML code only as a local reference; do not include it in the Pages artifact.
- `.github/workflows/pages.yml` runs `npm ci`, `npm run check`, `npm run test`, `npm run build` and Chromium E2E in `web/` before deploying **`web/dist/`**.
- Filter production pushes to only `web/index.html`, `web/src/**`, `web/public/**`, package/lock files, build configs/scripts and deploy workflow files. Edits limited to README, docs, implementation prompts and tests must **not** rebuild Pages.
- Use Vite `base: '/dark_fantasy_2d_arpg/'` for all assets, textures and translations at the project's GitHub Pages URL.
- `.github/workflows/quality.yml` handles PRs and test-only changes without deployment. Do not require a path-filtered Pages workflow as a mandatory PR check.
- Every published release must pass current unit, type, build, browser and asset path tests. Early releases may be incomplete, but incomplete features must be accurately documented and must not introduce failing tests.
- Use static hosting only; no Node.js server, runtime API keys or backend is required. Manual `workflow_dispatch` deployment remains supported.

## Migration Strategy for Existing Files

The repo already includes `dark_fantasy_2d_arpg_engine.html`, `visuals.js`, `visuals.css`, `index.html` and a Pages workflow. Treat these as a **reference implementation**, not dead code.

1. Run/reference the original browser game; list working gameplay features, known defects and important interactions.
2. Build Svelte/Phaser in **`web/`**, preserving the old root HTML for reference. Deploy a tested `web/dist/` to the main Pages URL as a public development release.
3. Extract typed content, simulation, stat/combat formulas, seeded RNG, command handling and save DTOs into testable TypeScript modules; preserve balance and IDs.
4. Migrate scenes, pixel sprites, movement/input and graphical effects incrementally into Phaser. Replace UI panels with Svelte, communicating only through the typed bridge.
5. Persist an explicit **character-progress DTO**, never a full `GameSnapshot` or current world/combat state. After load, generate a fresh game session with the hero at a safe starting point. Do not import/migrate old HTML or demo saves; reject incompatible versions gracefully.
6. Incrementally complete a parity slice: town → NPC quest → mouse movement → combat → loot → inventory → save → reload. Pages already deploys `web/dist/`; every additional release must pass quality gates. Keep root legacy HTML as an offline reference.

Never replace working systems with empty Phaser/Svelte placeholders just to satisfy file structure.

## Milestone Gates and Definition of Done

All 63 prompts remain sequential. The public new-engine build can be feature-incomplete, but milestones are **quality gates** for declaring features complete; never ship a build with failing tests:

| Gate | Prompts | Evidence required |
| --- | --- | --- |
| Baseline and scaffold | 01–05 | Legacy game still playable; staged `web/` build and typed input/game bridge; `svelte-i18n` initialized with `cs/en`, language selector, browser boot and click-through smoke tests |
| Core combat slice | 06–17 | Mouse movement, attacks, damage, status effects, loot and inventory work together; deterministic unit tests |
| Act I world slice | 18–29 | Reachable town/quest → wilderness → dungeon → boss → loot → return, in browser, with bilingual NPC dialogue, objectives, item names and map labels |
| Progression and classes | 30–44 | No duplicated item/skill rules; each class uses shared systems; representative builds tested |
| Persistence and UI | 45–48 | Only the current save format loads; valid new saves survive reload and incompatible saves fail gracefully; keyboard/UI interactions and mid-game `cs`↔`en` switching verified |
| Campaign and endgame | 49–56 | Region/act transitions and generated objectives are navigable, saveable, testable |
| Release readiness | 57–63 | Profiler evidence, deterministic seed suite, combat tests, full vertical-slice E2E, no console errors and successful Pages preview |

Every implemented feature needs: a clearly owned TypeScript state, a Phaser presentation adapter where needed, a Svelte UI projection where needed, validation/automated tests, documentation of changed public interfaces, and no unplanned regression of the legacy prototype.

**Simulation determinism**: pick a documented simulation tick rate, use accumulator/catch-up caps after tab suspension, never depend on render delta or `Math.random()` for authoritative rolls, and make replay/seed failures reproducible.

**Save safety**: version current save DTOs and content definitions; distinguish persistent IDs from Phaser sprite IDs, validate data, handle quota/private-mode/storage errors, and **reject old or incompatible save versions** without attempting migrations. A new game must always remain possible.

**Graphics production**: establish consistent camera/world units, tile sizes, sprite pivots, depth/occlusion layers, pixel-art filter/zoom, animation naming, texture atlases and art credits before scaling content. Include a visual regression/screenshot check for representative environments where practical.

**Mobile/accessibility**: the priority is a usable desktop mouse/keyboard experience; Svelte HUD should scale responsively. Mobile touch input may be a separate explicitly scoped milestone, never assumed to be covered by CSS breakpoints alone.

**Deployment optimization**: a docs-only or test-only commit may execute an appropriate quality check, but must not produce a Pages artifact or deployment. During migration, changes to unpublished `web/` code run staging CI only. When published, game/asset/config changes build and deploy exactly that published app.

**No artificial green checks**: if a feature is only a scaffold, mark it incomplete. Do not declare a prompt finished because TypeScript compiles while runtime gameplay, browser rendering or persistence still fails.

---

## Global Rules for Every Prompt

1. Inspect existing repository/code first; map existing features before implementing replacements.
2. Reuse existing systems whenever feasible; do not duplicate authoritative state.
3. Keep the **published new Svelte/Phaser game** runnable and tested after each prompt, and keep the legacy engine as an offline comparison. Do not deploy broken changes.
4. No unrelated rewrites or broad changes without need.
5. Prefer focused TypeScript modules, typed contracts and small Svelte components over god classes.
6. Gameplay/domain logic remains independent of Phaser, Svelte and browser DOM.
7. Prefer typed data definitions for items, skills, enemies, quests, loot and world generation.
8. Centralize formulas for combat, stats, XP, rarity, affixes and resistances.
9. Use deterministic RNG and stable IDs for simulation, saves and tests where practical.
10. Maintain future multiplayer readiness, but **do not implement multiplayer**.
11. Player/UI input emits commands; no UI-driven direct mutation of simulation entities.
12. Add unit and browser regression tests for changes and migrated features.
13. Update docs, save schemas and mappings when architecture/data formats change.
14. Keep dependencies locked and respect Pages base paths for all assets.
15. Prevent Svelte modal clicks from triggering Phaser world commands.
16. Avoid per-frame Svelte store updates for sprites and particles.
17. Run `npm run check`, applicable Vitest tests and `npm run build` on frontend changes.
18. Use Playwright smoke tests for critical UI, gameplay and deployment milestones, serving the production Vite bundle at the actual repository subpath.
19. Preserve relevant existing class/quest functionality; **legacy save compatibility is explicitly out of scope**.
19a. For every player-facing message added or edited in a prompt, provide Czech and English translations in the same change and test the runtime locale switch; never store translated strings as gameplay IDs or save fields.
20. At the end of each task report: created/modified files, architecture changes, gameplay changes, tests, Pages/deploy status, limitations and recommended next step.
21. Do not redeploy Pages when only README, prompts, docs or tests change. Rebuild after published `web/` game, asset, locale or build-input changes, with independent PR quality checks.
22. Never make a production deployment solely to validate a documentation change. Never skip a relevant staging/production test to make a release appear green.

Use a consistent **dark-fantasy pixel-art** direction with legible silhouettes, proper spritesheets, tilemap layers, atmospheric lighting, visible telegraphs and responsive HUD. Gameplay correctness takes priority over decorative effects.

---

# PROMPT 01 — Project Foundation and Architecture

Establish a scalable **Svelte 5 + Phaser 4 + TypeScript + Vite** foundation and keep migrating incrementally. The old HTML engine remains only as a repository reference, while `web/dist/` is the published game.

Initialize a strict TypeScript Vite SPA **in `web/`** (not over the live root `index.html`) with a Svelte root mounting/unmounting Phaser in `GameViewport.svelte`. Add Vitest, Playwright, `svelte-check`, a lockfile, GitHub Pages base path configuration and **`svelte-i18n` with `cs`/`en` catalogs from day one**.

Required project structure (the new frontend is permanently isolated under `web/`; create only files needed now):

```text
/
├── index.html                        # Existing published legacy entrypoint (unchanged until cutover)
├── dark_fantasy_2d_arpg_engine.html  # Existing browser reference game
├── visuals.js / visuals.css          # Legacy art helpers
├── 2d_arpg_implementation_prompts.md
├── .github/
│   └── workflows/
│       ├── pages.yml                # Deploy CURRENT published site only
│       └── quality.yml              # PR / staging quality checks, no deploy
├── web/
│   ├── index.html                   # New Vite/Svelte SPA entrypoint
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── svelte.config.js
│   ├── vite.config.ts               # base: /dark_fantasy_2d_arpg/
│   ├── playwright.config.ts
│   ├── public/
│   │   └── assets/
│   │       ├── sprites/            # Character / enemy atlases
│   │       ├── tilesets/           # Terrain / dungeons
│   │       ├── effects/            # Particles / UI graphics
│   │       └── audio/
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.svelte
│   │   ├── game/
│   │   │   ├── core/               # Simulation tick / state / RNG
│   │   │   ├── entities/           # Player, enemies, bosses, NPCs
│   │   │   ├── combat/
│   │   │   ├── skills/
│   │   │   ├── talents/
│   │   │   ├── items/
│   │   │   ├── inventory/
│   │   │   ├── loot/
│   │   │   ├── quests/
│   │   │   ├── dialogue/
│   │   │   ├── world/
│   │   │   │   ├── generation/
│   │   │   │   ├── regions/
│   │   │   │   ├── dungeons/
│   │   │   │   ├── cities/
│   │   │   │   ├── navigation/
│   │   │   │   └── streaming/
│   │   │   ├── systems/
│   │   │   ├── bridge/             # Typed commands, events, snapshots
│   │   │   ├── phaser/
│   │   │   │   ├── config.ts
│   │   │   │   ├── scenes/
│   │   │   │   ├── input/
│   │   │   │   ├── rendering/
│   │   │   │   └── audio/
│   │   │   └── debug/
│   │   ├── ui/
│   │   │   ├── GameViewport.svelte
│   │   │   ├── hud/
│   │   │   ├── inventory/
│   │   │   ├── character/
│   │   │   ├── talents/
│   │   │   ├── dialogue/
│   │   │   ├── merchants/
│   │   │   ├── menus/
│   │   │   ├── map/
│   │   │   └── settings/
│   │   ├── stores/                 # Read-only Svelte projections
│   │   ├── i18n/                   # svelte-i18n initialization
│   │   │   ├── index.ts
│   │   │   └── locales/
│   │   │       ├── cs.json
│   │   │       └── en.json
│   │   ├── data/                   # Classes / items / skills / enemies
│   │   ├── persistence/            # IndexedDB and migrations
│   │   └── shared/                 # Cross-layer types / schemas
│   └── tests/
│       ├── unit/                    # Vitest
│       └── e2e/                     # Playwright
└── docs/
    ├── ARCHITECTURE.md
    ├── UI_GAME_BRIDGE.md
    ├── COMBAT.md
    ├── ITEMS.md
    ├── SKILLS.md
    ├── WORLD_GENERATION.md
    ├── SAVE_SYSTEM.md
    ├── LOCALIZATION.md
    └── DEPLOYMENT.md
```

Paths named `src/`, `public/`, `tests/` or `package.json` in later prompts are relative to **`web/`**, unless they explicitly refer to the legacy repository root. CI scripts run with working directory `web/`.

Establish application flow:

```text
Boot → Main Menu → Character Selection → Load World → Gameplay → Pause / Save / Exit
```

Responsibility contract:
- **Svelte** mounts the game canvas and owns menus/HUD, not the simulation or world render loop.
- **Phaser** manages scene and input lifecycle, camera, tilemaps, sprite views and rendering.
- **TypeScript simulation** owns rules and authoritative state; define `GameCommand`, `GameEvent`, `GameSnapshot` and `GameBridge` interfaces before expanding systems.
- Create one visible sample tile/sprite, one typed UI command and a read-only HUD value updated by a gameplay event.
- Add a visible Czech/English selector to the Svelte main menu; both language dictionaries must include all initial menu, HUD and error strings. Change locale live without resetting the Phaser scene or simulation, and persist preference independently from character saves.
- Destroy Phaser and unsubscribe bridge listeners when the Svelte viewport unmounts/hot reloads. No duplicated canvas, global singleton or direct Svelte→Phaser logic.
- Produce a legacy-module feature mapping; old HTML remains a repository reference only. Do not implement old-save import.

Acceptance criteria:

- From `web/`, `npm ci`, `npm run dev`, `npm run check`, `npm run test`, `npm run build` pass
- `web/dist/index.html` and assets resolve under GitHub Pages `/dark_fantasy_2d_arpg/`, and the live Pages workflow publishes exactly this bundle
- Svelte mounts and disposes a minimal Phaser scene without duplicate listeners/canvases
- typed UI command reaches the pure TypeScript simulation and visibly updates the HUD
- pure gameplay modules have no Phaser/Svelte imports
- Vitest unit and Playwright boot/scene smoke tests pass
- architecture, UI bridge, deployment and supported current save format are documented
- original HTML implementation remains runnable locally for comparison; it is not part of the Pages artifact
- documentation/test-only commits do not trigger Pages rebuilds; published Svelte/Phaser source changes are tested and deployed
- `svelte-i18n` renders Czech/English startup UI; changing language updates HUD/menu without a game restart, and locale persists across browser refresh
- Vitest checks initial translation key/placeholder parity and Playwright checks switching languages without gameplay reset

---

# PROMPT 02 — Player Entity and Character Core

Implement the reusable player character foundation.

The player should contain separate components/systems for:

- movement
- statistics
- health
- class resource
- combat
- skills
- equipment
- status effects
- animation
- interaction

Do not place all functionality into PlayerController.

Create a reusable stat model supporting at least:

Primary attributes:

- Strength
- Dexterity
- Intelligence
- Vitality
- Willpower

Derived statistics:

- maximum health
- health regeneration
- maximum class resource
- resource regeneration
- armor
- physical resistance
- fire resistance
- frost resistance
- lightning resistance
- poison resistance
- shadow resistance
- holy resistance
- attack speed
- movement speed
- critical hit chance
- critical hit damage
- dodge chance
- block chance
- cooldown reduction
- life steal
- magic find
- gold find

Use derived-stat calculation rather than permanently modifying cached numbers from many different systems.

Create a minimal placeholder Warrior as the first playable class.


### Implementation notes — Svelte / Phaser / TypeScript

Keep actor state and derived stats in pure TypeScript simulation; Phaser renders a player sprite view by ID, and Svelte presents read-only character-sheet projections. Port existing class formulas and test them.

Acceptance criteria:

- player can spawn
- player has health and stats
- stats can be inspected in debug output
- stats are not hardcoded directly into UI
- player systems are modular

---

# PROMPT 03 — Diablo-Style Mouse Movement

Implement **Diablo-style click-to-move controls**.

Do not use WASD as the default movement scheme.

Required behavior:

## Ground click

Left-click on walkable ground:

```text
click ground
→ determine world position
→ request movement command
→ pathfind
→ move player
→ stop at destination
```

Holding the left mouse button should continuously update movement toward the cursor without causing excessive path recalculation.

Use navigation/pathfinding to route around obstacles.

Clicking unreachable terrain should resolve to the nearest valid reachable location when possible.

Implement:

- movement acceleration/deceleration if appropriate
- configurable stopping distance
- obstacle avoidance
- movement interruption
- root/stun movement prevention
- path recalculation throttling
- destination visualization in debug mode

Create a clean command pipeline:

```text
Mouse
→ InputController
→ ContextResolver
→ MoveCommand
→ PlayerMovement
```

Do not access raw mouse input throughout gameplay scripts.


### Implementation notes — Svelte / Phaser / TypeScript

Use Phaser input and camera world-coordinate conversion (including zoom/DPR) to submit typed MoveCommands. Use authoritative navigation/collision data; throttle repathing and preserve existing mouse movement.

Acceptance criteria:

- player moves entirely using the mouse
- holding left-click produces smooth movement
- obstacles are avoided
- movement does not jitter
- UI clicks do not trigger world movement

---

# PROMPT 04 — Mouse Context Resolver and Interaction Model

Build a centralized mouse/context interaction system.

The system must determine what is under the cursor.

Supported categories:

```text
GROUND
ENEMY
NPC
LOOT
INTERACTABLE
UI
INVALID
```

Left-click behavior:

Ground:
- move

Enemy:
- move toward target if necessary
- perform primary attack

NPC:
- approach
- interact

Loot:
- approach
- pick up

Chest / shrine / door:
- approach
- interact

Create common interaction interfaces/components instead of writing unique click logic for every entity.

Add cursor feedback for:

- movement
- hostile target
- NPC interaction
- loot
- interactable object
- invalid location

Add target highlighting.


### Implementation notes — Svelte / Phaser / TypeScript

Phaser handles world context picking by stable entity IDs. Svelte overlays intercept input and never let clicks pass to movement/attack. Send typed interaction commands instead of calling GameObjects.

Acceptance criteria:

- clicking different world objects produces correct context-sensitive behavior
- UI consumes clicks before world interaction
- interaction distance is respected
- interaction logic is centralized

---

# PROMPT 05 — Force Move, Hold Position, and Skill Aiming

Expand the input system with standard ARPG control helpers.

Implement:

## Force Move

A configurable action that causes movement regardless of enemies beneath the cursor.

Suggested default:

- middle mouse button

Do not hardcode the final binding.

## Hold Position / Stand Still

Suggested default:

- Shift

While active:

- attack commands must not automatically move the player
- ranged attacks can fire while stationary
- melee attacks fail gracefully when target is out of range

## Skill aiming

Skills activated by hotkeys should aim using the mouse cursor.

Support targeting modes:

```text
SELF
TARGET_ENTITY
GROUND_POSITION
DIRECTION
AREA
```

Recommended input defaults:

```text
Left Mouse Button  = move / interact / primary attack
Right Mouse Button = secondary skill
1                   = skill slot 1
2                   = skill slot 2
3                   = skill slot 3
4                   = skill slot 4
Q                   = potion
Space               = evade
Shift               = hold position
I                   = inventory
C                   = character
S                   = skills
T                   = talents
M                   = map
J                   = quest journal
Esc                 = menu
```


### Implementation notes — Svelte / Phaser / TypeScript

Keep mouse/key mappings in a Phaser input adapter separate from simulation commands. Support Czech digit-row skill keys and suppress world shortcuts while UI text fields/modals are active.

Acceptance criteria:

- all bindings are configurable input actions
- keyboard skills aim using cursor position
- force move works in enemy crowds
- hold position prevents unwanted movement

---

# PROMPT 06 — Combat Foundation

Implement the centralized real-time combat system.

Support:

- melee attacks
- ranged attacks
- projectiles
- spells
- area damage
- critical hits
- armor
- resistances
- dodge
- block
- healing
- shields

Use a centralized damage pipeline:

```text
attack source
→ skill/weapon base damage
→ attacker modifiers
→ damage type modifiers
→ critical calculation
→ defender armor/resistance
→ defensive effects
→ final damage
→ health
```

Supported damage types:

- Physical
- Fire
- Frost
- Lightning
- Poison
- Holy
- Shadow
- Arcane

Create reusable hit/damage payloads.

Do not allow individual skills to invent independent damage formulas.


### Implementation notes — Svelte / Phaser / TypeScript

Compute combat in pure TypeScript with seeded tests. Phaser/Svelte consume hit events, but never decide damage or hit success.

Acceptance criteria:

- player can damage enemies
- enemies can damage player
- damage type/resistance works
- critical hits work
- damage logic is centralized
- combat events can be observed by UI without UI controlling combat

---

# PROMPT 07 — Warrior Basic Combat

Implement the Warrior as the first complete combat class.

Class resource:

**Rage**

Implement:

- basic melee attack
- Cleave
- Charge
- Ground Slam
- War Cry
- Whirlwind
- Execute

Each skill must define data such as:

- cooldown
- resource cost
- damage scaling
- range
- targeting type
- tags
- animation reference
- status effects
- whether auto-approach is permitted

Suggested skill tags:

```text
MELEE
PHYSICAL
AREA
MOVEMENT
CHANNELING
BUFF
```

Integrate with Diablo-style controls:

- click enemy outside range → approach → attack
- right-click skill → use cursor target
- keyboard skill → use cursor target
- hold position → never auto-approach


### Implementation notes — Svelte / Phaser / TypeScript

Use typed skill definitions and simulation-owned costs/cooldowns; Phaser plays cast effects and Svelte displays cooldown/resource projections.

Acceptance criteria:

- Warrior has a playable combat loop
- skill cooldowns work
- Rage works
- skills use centralized combat formulas
- target approach behavior feels correct

---

# PROMPT 08 — Animation and Combat Feel

Add the animation framework and improve game feel.

Player animation states:

- idle
- walk
- run
- attack
- cast
- channel
- hit
- block
- dodge
- death

Synchronize damage with actual hit frames rather than immediately dealing damage when input begins.

Support:

- attack wind-up
- hit frame
- recovery
- controlled animation cancellation
- movement locking where appropriate

Add:

- impact particles
- hit flashes
- weapon trails
- strong-hit screen shake
- knockback feedback
- critical hit feedback
- death animation hooks

Keep visual effects readable.


### Implementation notes — Svelte / Phaser / TypeScript

Use Phaser atlases/spritesheets, animation keys, trails, particles and hit flashes. Keep authoritative damage timing in simulation events, not a render frame; ensure legible pixel scale and pooling.

Acceptance criteria:

- attacks visually align with hit timing
- strong attacks feel different from basic attacks
- animation system remains separate from damage calculations

---

# PROMPT 09 — Status Effect Framework

Implement a reusable status-effect system.

Support:

- Burning
- Chilled
- Frozen
- Poisoned
- Bleeding
- Stunned
- Slowed
- Rooted
- Silenced
- Cursed
- Vulnerable
- Fortified
- Shielded
- Regeneration
- Haste

Each effect should support:

- source
- duration
- magnitude
- tick interval
- stacking rules
- maximum stacks
- refresh behavior
- dispel category
- immunity
- visual hook

Effects must be data-driven.


### Implementation notes — Svelte / Phaser / TypeScript

Keep status effect timers, stacking and modifiers in simulation. Phaser displays effects and Svelte renders buff/debuff timers via projections.

Acceptance criteria:

- effects can be applied by skills
- timed effects expire correctly
- DoT effects tick correctly
- stacking behavior is deterministic
- UI can query current effects

---

# PROMPT 10 — Enemy Framework and AI

Create the reusable enemy framework.

Implement AI archetypes:

- melee aggressor
- ranged attacker
- defensive enemy
- healer
- summoner
- ambusher
- charger
- caster
- support enemy

AI must support:

- idle
- patrol
- aggro
- chase
- attack
- reposition
- flee where appropriate
- return to origin
- death

Create configurable:

- aggro range
- attack range
- movement speed
- preferred distance
- cooldown behavior
- target selection

Do not make every enemy use identical AI.


### Implementation notes — Svelte / Phaser / TypeScript

Run deterministic AI and navigation in TypeScript systems. Phaser GameObjects are visual proxies, not enemy truth.

Acceptance criteria:

- at least three enemy archetypes behave differently
- AI respects navigation
- enemies react correctly to player death
- enemy configuration is data-driven

---

# PROMPT 11 — Monster Families

Add initial monster families for Act I.

Implement reusable definitions for:

Undead:
- Skeleton
- Skeleton Archer
- Skeleton Mage
- Ghoul
- Zombie

Beasts:
- Wolf
- Spider
- Corrupted Boar

Bandits:
- Bandit Fighter
- Bandit Archer
- Bandit Rogue

Cultists:
- Fanatic
- Cult Mage
- Cult Healer

Each family should have tactical differences.

Do not create fifteen identical enemies with different sprites.


### Implementation notes — Svelte / Phaser / TypeScript

Monster-family definitions reference Phaser sprite/animation asset keys but retain pure typed gameplay stats and behaviors.

Acceptance criteria:

- monster definitions share reusable components
- ranged and melee enemies behave differently
- healers/support enemies affect encounters
- spawn system can instantiate enemies from data

---

# PROMPT 12 — XP, Levels, and Character Progression

Implement player progression.

Players gain XP from:

- enemies
- quests
- bosses
- exploration
- dungeons
- world events

Create configurable XP curves.

Leveling grants:

- stat growth
- skill points
- talent points
- access to higher-level equipment

Avoid placing the XP formula directly in Player.

Create progression definitions/resources.


### Implementation notes — Svelte / Phaser / TypeScript

Keep XP and level rules in pure TypeScript; notify Svelte HUD and Phaser level-up effects through events.

Acceptance criteria:

- XP can be gained
- player levels up
- rewards are deterministic
- progression persists in save data later

---

# PROMPT 13 — Item Data Model

Create the equipment/item foundation.

Equipment slots:

- Helmet
- Chest
- Gloves
- Boots
- Belt
- Amulet
- Ring 1
- Ring 2
- Main Hand
- Off Hand
- optional Relic/Charm

Weapon types:

- Sword
- Greatsword
- Axe
- Greataxe
- Mace
- Hammer
- Dagger
- Bow
- Crossbow
- Staff
- Wand
- Spellbook
- Shield

Item rarity:

1. Common
2. Uncommon
3. Rare
4. Epic
5. Legendary
6. Mythic

Create data definitions for:

- base item
- item level
- required level
- rarity
- affixes
- sockets
- legendary powers
- sell value


### Implementation notes — Svelte / Phaser / TypeScript

Localization requirement: all item base names, types, rarities, affixes and modifiers use stable IDs plus `cs`/`en` translation keys. Czech item grammar must not assume English prefix order.

Use typed item templates, stable instance IDs and validated save schemas. Never use icon names as authoritative item identities.

Acceptance criteria:

- items are defined outside inventory UI
- items can be instantiated from definitions
- item instances can contain generated affixes
- item data is serializable

---

# PROMPT 14 — Affixes and Random Item Generation

Implement procedural item generation.

Create:

- prefix pool
- suffix pool
- rarity rules
- affix tiers
- item-level restrictions
- class-relevant weighting where appropriate

Example affixes:

- Strength
- Dexterity
- Intelligence
- Vitality
- critical chance
- critical damage
- attack speed
- movement speed
- fire damage
- physical damage
- resistances
- maximum health
- resource regeneration
- cooldown reduction
- skill rank
- summon damage
- poison damage

Rarity should influence:

- number of affixes
- affix tier
- chance of special effects

Use controlled RNG.


### Implementation notes — Svelte / Phaser / TypeScript

Localization requirement: procedural names are assembled from typed segments with locale-specific formatting for Czech and English; changing language updates existing item display names without rerolling item properties.

Use seeded TypeScript RNG and test loot/affix generators headlessly with Vitest.

Acceptance criteria:

- generated items are reproducible with a known seed when requested
- invalid affix combinations are prevented
- rarity meaningfully changes item quality
- item generation has automated/debug tests

---

# PROMPT 15 — Inventory and Equipment

Implement inventory and equipment systems.

Support:

- item storage
- equipment slots
- equipping
- unequipping
- swapping
- dropping
- sorting
- filtering
- locking/favoriting
- comparison tooltips

Equipping an item should update character derived statistics through the stat system.

Do not allow UI to directly modify stats.

Flow:

```text
UI equip request
→ Inventory/Equipment command
→ EquipmentSystem
→ CharacterStats recompute
→ UI receives updated state
```


### Implementation notes — Svelte / Phaser / TypeScript

Build inventory/equipment as Svelte components. Drag/drop and buttons send equip/move commands; simulation validates operations and publishes item-state snapshots.

Acceptance criteria:

- items can be equipped
- character stats change correctly
- invalid equipment is rejected
- UI shows before/after comparison

---

# PROMPT 16 — Loot Drops

Implement loot generation and world drops.

Loot quality depends on:

- monster level
- elite status
- boss status
- region
- difficulty
- player level
- magic find

Implement weighted loot tables.

World loot should support:

- ground labels
- rarity visuals
- click-to-pickup
- auto-approach
- pickup radius
- inventory-full handling

Boss loot tables should support curated guaranteed drops plus random drops.


### Implementation notes — Svelte / Phaser / TypeScript

Phaser renders loot sprites, rarity beams and pickups from simulation events; loot interaction still uses typed distance/ownership rules.

Acceptance criteria:

- normal enemies drop basic loot
- elite monsters provide improved loot
- bosses provide clearly better rewards
- pickup works through mouse interaction system

---

# PROMPT 17 — Elite Monsters and Modifiers

Implement elite enemies.

Create reusable modifiers such as:

- Extra Health
- Increased Damage
- Fast
- Fire Aura
- Frost Attacks
- Poison Attacks
- Teleporting
- Shielded
- Regenerating
- Summoner
- Explodes on Death
- Hazardous Ground

Elites may combine compatible modifiers.

Add visual identification and better loot.


### Implementation notes — Svelte / Phaser / TypeScript

Elite modifiers are TypeScript gameplay effects; Phaser displays their auras/telegraphs, while Svelte shows modifier details in target HUD.

Acceptance criteria:

- modifiers are composable
- incompatible combinations can be excluded
- elites are clearly distinguishable
- elite loot is improved

---

# PROMPT 18 — First Persistent Town

Create the first permanent town.

The town must always exist regardless of procedural world seed.

Include:

- blacksmith
- weapon/armor merchant
- potion vendor
- quest NPC
- healer
- stash
- waypoint
- several decorative civilians

Town should be a safe zone.

Implement reusable NPC interaction through mouse controls:

```text
click NPC
→ walk into interaction range
→ stop
→ open interaction/dialogue
```


### Implementation notes — Svelte / Phaser / TypeScript

Implement town as Phaser-rendered region backed by persistent TypeScript world data. NPC dialogue, merchant and stash windows are Svelte overlays.

Acceptance criteria:

- town is persistent
- NPCs can be interacted with
- combat is disabled or controlled inside safe zone
- waypoint can later connect to fast travel

---

# PROMPT 19 — Gold Economy and Merchants

Implement gold as the primary currency.

Gold sources:

- enemies
- treasure
- quests
- selling equipment
- dungeon rewards

Gold sinks:

- purchases
- repairs
- crafting
- enchanting
- respec
- upgrading

Implement merchants with:

- buy
- sell
- inventory
- prices
- refresh rules
- item categories

Avoid exponential inflation.

Create centralized pricing/economy formulas.


### Implementation notes — Svelte / Phaser / TypeScript

Localization requirement: vendor dialogue, prices, trade errors, currencies and purchase confirmations exist in `cs` and `en`; numeric amounts use locale formatting.

Merchant UI is Svelte; prices, gold deductions, inventory rules and transactions are validated in TypeScript simulation.

Acceptance criteria:

- player can earn gold
- player can buy and sell
- prices are data-driven
- invalid transactions are rejected

---

# PROMPT 20 — Dialogue and Quest Foundation

Implement a reusable dialogue and quest system.

Dialogue should support:

- branching dialogue
- quest availability conditions
- completed quest conditions
- campaign progression
- optional dialogue
- NPC state

Quest system should support:

- quest ID
- title
- description
- objectives
- prerequisite quests
- objective counters
- rewards
- quest state
- completion
- failure where applicable

Quest categories:

- main
- side
- bounty
- exploration
- dungeon
- boss
- collection
- investigation

Do not embed quest logic directly inside NPC scripts.


### Implementation notes — Svelte / Phaser / TypeScript

Localization requirement: quest IDs, NPC IDs and conditions remain language-neutral; every NPC utterance, dialogue option, quest title/objective/reward text has keys and complete `cs` + `en` catalogs. The open dialogue UI updates on locale switch without restarting the quest.

Define quests/dialogue in typed data; Svelte renders choices/journal and dispatches commands, while simulation owns progress and rewards.

Acceptance criteria:

- NPC can offer quest
- player can accept quest
- objective updates
- quest can complete
- reward is granted

---

# PROMPT 21 — Act I Quest Chain

Create the first playable quest chain.

Suggested flow:

1. player begins in town
2. talks to quest giver
3. investigates nearby corruption
4. fights corrupted beasts
5. discovers an abandoned graveyard
6. defeats a named mini boss
7. finds evidence leading to a dungeon
8. enters dungeon
9. defeats dungeon boss
10. returns to town
11. receives reward
12. unlocks next progression step

Include meaningful narrative context instead of only numeric kill objectives.


### Implementation notes — Svelte / Phaser / TypeScript

Localization acceptance: Act I main quests, objectives, NPC dialogue, journal entries and reward messages are readable and coherent in both Czech and English.

Keep existing quest IDs, progress and rewards stable during migration. Svelte quest tracker consumes derived snapshots and tests cover completion.

Acceptance criteria:

- complete beginning-to-end quest chain
- quest markers work
- objectives persist
- rewards work
- player can complete chain without debug tools

---

# PROMPT 22 — Procedural Wilderness Generation

Implement the first procedurally generated wilderness region.

Use a deterministic world seed.

Generation pipeline:

```text
seed
→ region bounds
→ terrain
→ walkable areas
→ obstacles
→ roads
→ persistent landmarks
→ random POIs
→ monster zones
→ treasure
→ events
→ dungeon entrances
→ validation
```

The first biome should resemble a dark corrupted frontier/forest.

Important locations such as the starting town should remain persistent.

Create generation validation:

- town reachable
- critical quest destinations reachable
- dungeon entrance reachable
- player spawn valid
- no required NPC inside collision

Regenerate invalid sections.


### Implementation notes — Svelte / Phaser / TypeScript

Generate deterministic terrain/navigation/POI data in TypeScript. Phaser renders tilemaps and layered sprites; drawing directly on Canvas must not be the authoritative world representation.

Acceptance criteria:

- different seeds produce different wilderness layouts
- same seed reproduces same important generated layout
- town remains stable
- navigation remains valid

---

# PROMPT 23 — World Chunking and Streaming

Prepare the open world for larger maps.

Divide the procedural world into chunks.

Implement:

- nearby chunk loading
- distant chunk unloading
- persistent chunk identifiers
- chunk content seeds
- persistence of important world state

Persist examples:

- opened chest
- completed event
- killed unique enemy
- discovered landmark
- activated waypoint

Avoid loading the entire world simultaneously.


### Implementation notes — Svelte / Phaser / TypeScript

Simulation owns chunk IDs/seeds/persistence, Phaser streams tilemap layers and releases resources. Budget loading and verify chunk return state and Pages asset paths.

Acceptance criteria:

- player can cross chunk boundaries without obvious breaks
- unloaded chunks release unnecessary entities/resources
- returning to a chunk restores important persistent state

---

# PROMPT 24 — Map, Minimap, and Fog of War

Implement:

- minimap
- world map
- fog of war
- discovered areas
- landmarks
- quest markers
- dungeon entrances
- towns
- waypoints

Map discovery must persist.

Do not reveal unexplored procedural locations automatically.


### Implementation notes — Svelte / Phaser / TypeScript

Exploration/fog state belongs to simulation/persistence. Phaser maps coordinates; Svelte displays map/minimap overlay without duplicating discovery logic.

Acceptance criteria:

- unexplored map starts hidden
- exploring reveals terrain
- known towns remain visible
- map state persists

---

# PROMPT 25 — Procedural Dungeon Generator

Implement procedurally generated dungeons using modular rooms.

Room types:

- entrance
- corridor
- combat room
- elite room
- event room
- treasure room
- trap room
- secret room
- boss room

Generation must guarantee:

- reachable boss
- reachable exit
- no inaccessible objective
- valid enemy spawning
- valid player spawn
- no overlapping impossible room connections

Use dungeon seeds.

Add automated/debug connectivity validation.


### Implementation notes — Svelte / Phaser / TypeScript

Dungeon generator outputs a seeded room/door graph and tile IDs as pure data; Phaser renders it, and Vitest checks accessibility headlessly.

Acceptance criteria:

- multiple seeds produce different valid layouts
- boss room is always reachable
- generation failure triggers retry or safe fallback

---

# PROMPT 26 — First Dungeon Theme

Create the first complete dungeon theme:

**Corrupted Crypt**

Add:

- modular room visuals
- tomb props
- breakable containers
- traps
- undead enemies
- ambient audio hooks
- treasure rooms
- secret-room support

Do not change the general dungeon generator just to hardcode this theme.

Theme-specific data should plug into reusable generation logic.


### Implementation notes — Svelte / Phaser / TypeScript

Build the crypt with Phaser tilemaps, layered props, sprite atlases and atmospheric FX; preserve visible collision and readable boss warnings.

Acceptance criteria:

- crypt feels visually and mechanically distinct
- dungeon can be generated repeatedly
- encounters use appropriate enemies

---

# PROMPT 27 — Mini Boss Framework

Create reusable mini-boss infrastructure.

Mini bosses should support:

- unique name
- multiple abilities
- larger health pool
- phases where appropriate
- improved AI
- guaranteed reward rules
- intro/arena hooks

Implement Act I examples:

- Bandit Captain
- Graveyard Warden
- Brood Mother
- Corrupted Knight


### Implementation notes — Svelte / Phaser / TypeScript

Boss states and hit checks live in TypeScript; Phaser animates phases/telegraphs and Svelte displays projected boss information.

Acceptance criteria:

- mini bosses are mechanically more complex than normal enemies
- rewards are better
- quest system can reference a specific mini boss

---

# PROMPT 28 — Boss Framework and First Act Boss

Implement reusable boss encounter architecture.

Boss features:

- boss health UI
- phases
- ability rotations
- telegraphed attacks
- arena boundaries
- adds/summons
- environmental hazards
- death event
- boss loot table

Create Act I boss:

**The Hollow King**

Design at least three mechanically distinct phases.

Boss difficulty should come from mechanics rather than extreme HP.


### Implementation notes — Svelte / Phaser / TypeScript

Use a testable pure boss phase machine; Phaser presents attack tells and Svelte renders boss HP/phase from typed events.

Acceptance criteria:

- encounter can be completed without debug tools
- phase transitions work
- telegraphs are readable
- boss death updates quests/world state
- boss drops high-quality loot

---

# PROMPT 29 — Death and Respawn

Implement player death.

On death:

- movement stops
- abilities cancel
- temporary effects are handled correctly
- death animation plays
- interaction stops
- respawn UI appears

Respawn at:

- nearest activated checkpoint
- or town waypoint

Optionally apply configurable durability loss.

Do not remove major permanent progression on standard difficulty.


### Implementation notes — Svelte / Phaser / TypeScript

Death/respawn overlay belongs to Svelte; respawn is a simulation command and Phaser handles transitions.

Acceptance criteria:

- death cannot leave player stuck
- combat state resets
- player respawns correctly
- repeated death is safe

---

# PROMPT 30 — Talent Tree Foundation

Implement a reusable talent tree framework.

Talents can:

- increase stats
- modify skills
- unlock passive mechanics
- alter resources
- trigger conditional effects

Support:

- prerequisites
- talent ranks
- branches
- unlock levels
- respec

Create Warrior branches:

## Berserker
- Rage generation
- attack speed
- crit
- aggressive bonuses

## Guardian
- armor
- block
- shields
- survivability

## Warlord
- war cries
- crowd control
- tactical buffs


### Implementation notes — Svelte / Phaser / TypeScript

Use Svelte talent-tree UI. Spending/respec is a typed command validated by simulation, never a Svelte store mutation.

Acceptance criteria:

- player can spend talent points
- prerequisites work
- talent effects update character correctly
- respec is possible through a gold cost

---

# PROMPT 31 — Skill Modification System

Expand skills so talents and items can alter behavior.

Examples:

Fireball:
- extra projectiles
- explosion radius
- burning ground
- piercing

Whirlwind:
- pull enemies
- movement speed increase
- bleed
- larger radius

Raise Skeleton:
- extra skeleton
- exploding skeleton
- armored skeleton

Do not implement modifications with giant skill-specific if/else chains.

Use composable modifiers or well-defined extension hooks.


### Implementation notes — Svelte / Phaser / TypeScript

Skills and modifiers are typed gameplay calculations; Phaser selects effects by IDs and Svelte tooltips project final values.

Acceptance criteria:

- at least one Warrior skill can be materially transformed
- modification is visible in gameplay
- architecture supports future class skills

---

# PROMPT 32 — Crafting, Salvaging, and Materials

Implement crafting foundation.

Support:

- salvage equipment
- materials
- item upgrade
- affix reroll
- enchanting
- socketing

Example materials:

- Iron
- Steel
- Arcane Dust
- Soul Fragment
- Demon Essence
- Ancient Crystal

Create crafting recipes as data.


### Implementation notes — Svelte / Phaser / TypeScript

Use Svelte crafting/salvage dialogs backed by pure TypeScript transaction/crafting rules and deterministic tests.

Acceptance criteria:

- items can be salvaged
- materials are stored
- crafting costs are validated
- crafted upgrades modify item data safely

---

# PROMPT 33 — Gems and Runes

Implement equipment sockets.

Socket effects can depend on item category.

Examples:

Weapon:
- damage bonus

Armor:
- resistance

Jewelry:
- resource regeneration

Support gem tiers and upgrading lower-tier gems into higher tiers.


### Implementation notes — Svelte / Phaser / TypeScript

Store gems/runes/sockets in validated item data. Svelte sends socket commands and simulation recalculates stats.

Acceptance criteria:

- items can have sockets
- gems can be inserted/removed according to rules
- stats update correctly
- socket data persists

---

# PROMPT 34 — Potions and Consumables

Implement consumables.

Support:

- healing potion
- class-resource potion if desired
- resistance potion
- temporary buff potion

Prevent unlimited instant potion spam.

Use configurable:

- charges
- cooldowns
- refill rules

Integrate potion hotkey:

`Q`


### Implementation notes — Svelte / Phaser / TypeScript

Consumables and cooldown restrictions belong to simulation; Svelte shows bar/counts and Phaser plays effects.

Acceptance criteria:

- potion works during combat
- cooldown/charges display in UI
- consumable state saves correctly where appropriate

---

# PROMPT 35 — Player Stash

Create a town stash.

Features:

- persistent storage
- multiple tabs
- item movement between inventory and stash
- sorting
- filtering

Architect it so account-wide/shared storage could be added later for multiplayer or multiple characters.

Do not implement network storage yet.


### Implementation notes — Svelte / Phaser / TypeScript

Svelte stash UI uses stable item IDs, transfer commands and versioned IndexedDB saves.

Acceptance criteria:

- stash persists
- item identity remains stable
- moving items cannot duplicate or delete them

---

# PROMPT 36 — Fast Travel and Waypoints

Implement waypoints.

Rules:

- waypoint must be discovered/activated
- activated waypoints appear on world map
- player may fast-travel between unlocked destinations
- travel should preserve world/save state

Add the starting-town waypoint and at least one wilderness waypoint.


### Implementation notes — Svelte / Phaser / TypeScript

Svelte shows waypoint selection. Simulation verifies travel/discovery, Phaser moves the camera or transitions scenes.

Acceptance criteria:

- undiscovered destinations cannot be used
- fast travel works
- destination state is valid after travel

---

# PROMPT 37 — World Events

Implement random world events.

Examples:

- Bandit Ambush
- Demon Incursion
- Caravan Defense
- Cursed Shrine
- Elite Hunt
- Rescue Event
- Ritual Interruption
- Treasure Ambush

Events should use region/event tables.

Rewards:

- XP
- gold
- materials
- loot


### Implementation notes — Svelte / Phaser / TypeScript

World event outcomes are simulation-owned; Phaser renders events and Svelte projects objectives and rewards.

Acceptance criteria:

- events spawn under controlled conditions
- event state is tracked
- completed events reward player
- events do not overwrite critical quest locations

---

# PROMPT 38 — Shrines and Environmental Interactions

Add interactable environment systems.

Objects:

- chests
- doors
- locked doors
- levers
- shrines
- traps
- breakable barrels
- crates
- hidden walls
- lore objects

Shrine effects can include:

- damage
- armor
- speed
- regeneration
- resource generation
- loot bonus

Some shrines may trigger combat encounters.

All interactions must work through the central click interaction system.


### Implementation notes — Svelte / Phaser / TypeScript

Phaser renders shrines/interactables and TypeScript processes activation, buffs, loot and persistence.

Acceptance criteria:

- interactables share reusable interface
- player auto-approaches correctly
- consumed/opened state can persist

---

# PROMPT 39 — Paladin Class

Add the Paladin using existing class infrastructure.

Resource:

**Faith**

Implement skills:

- Holy Strike
- Consecration
- Divine Shield
- Judgment
- Healing Light
- Holy Aura
- Smite

Possible builds:

- holy warrior
- guardian
- aura build
- holy caster

Create Paladin-specific talent branches and class-relevant item affixes.

Do not duplicate Warrior systems.


### Implementation notes — Svelte / Phaser / TypeScript

Port Paladin gameplay as typed class data; Phaser renders Paladin atlases/VFX and Svelte projects the resource bar.

Acceptance criteria:

- class selection supports Paladin
- Faith works
- Paladin plays differently from Warrior
- talents and items integrate with existing systems

---

# PROMPT 40 — Mage Class

Add the Mage.

Resource:

**Mana**

Elements:

- Fire
- Frost
- Lightning
- Arcane

Skills:

- Fireball
- Frost Nova
- Chain Lightning
- Meteor
- Teleport
- Arcane Barrier
- Blizzard

Support:

- ground targeting
- projectile targeting
- self buffs
- movement skill
- elemental status effects

Possible builds:

- fire
- frost
- lightning
- arcane


### Implementation notes — Svelte / Phaser / TypeScript

Keep Mage spell mechanics in simulation; Phaser renders projectiles and elemental VFX, Svelte displays cooldowns.

Acceptance criteria:

- mouse cursor determines spell direction/ground position
- elements interact correctly with status effects
- Mage has distinct item/talent support

---

# PROMPT 41 — Necromancer Class

Add the Necromancer.

Resource:

**Essence**

Skills:

- Raise Skeleton
- Corpse Explosion
- Bone Spear
- Blood Drain
- Curse
- Summon Golem
- Death Nova

Implement reusable summon ownership.

Summons should have:

- stable owner
- target behavior
- lifetime where applicable
- stat scaling
- cleanup on scene/world transition

Possible builds:

- skeleton army
- corpse explosion
- bone caster
- blood
- poison


### Implementation notes — Svelte / Phaser / TypeScript

Necromancer summons are simulation entities with stable IDs and ownership. Phaser renders them; Svelte projects summon counts.

Acceptance criteria:

- summoned entities function reliably
- corpse mechanics are reusable
- future multiplayer ownership remains possible

---

# PROMPT 42 — Rogue Class

Add the Rogue.

Resource:

**Energy**

Weapons:

- Daggers
- Bows
- Crossbows

Skills:

- Backstab
- Dash
- Poison Blade
- Multishot
- Shadow Step
- Trap
- Fan of Knives

Possible builds:

- assassin
- poison
- ranged
- traps

Focus on:

- positioning
- crits
- mobility
- target selection
- traps


### Implementation notes — Svelte / Phaser / TypeScript

Rogue dodge/stealth results must be simulation-authoritative; Phaser handles animations and Svelte displays effects.

Acceptance criteria:

- melee and ranged Rogue builds are possible
- mouse targeting works naturally
- mobility skills interact correctly with navigation/combat

---

# PROMPT 43 — Warlock Class

Add the Warlock.

Resource:

**Soul Power**

Skills:

- Shadow Bolt
- Life Drain
- Demon Summoning
- Soul Burn
- Corruption
- Fear
- Hellfire

Possible builds:

- demon summoner
- shadow caster
- DoT
- life drain

Reuse summon framework created for Necromancer.


### Implementation notes — Svelte / Phaser / TypeScript

Warlock curses/resources live in shared status/skill systems; Phaser shows VFX and Svelte projects counters.

Acceptance criteria:

- Warlock has distinct resource/gameplay
- DoT and curses use shared status framework
- demon summons reuse generic summon infrastructure

---

# PROMPT 44 — Class Selection and Character Creation

Create character creation.

Allow selection of:

- Warrior
- Paladin
- Mage
- Necromancer
- Rogue
- Warlock

Store:

- character ID
- class
- level
- XP
- progression
- world seed association

Do not make a separate save implementation per class.


### Implementation notes — Svelte / Phaser / TypeScript

Localization requirement: names, summaries, strengths and starting equipment descriptions of all six classes are translated to `cs`/`en` for the character selection menu.

Create accessible CharacterSelect.svelte from typed class definitions. Use Phaser or atlas preview for art only; character creation emits a typed command.

Acceptance criteria:

- all six classes can create/load
- class-specific resources and starting equipment load correctly

---

# PROMPT 45 — Save/Load System

Implement a versioned save system.

Save:

- character class
- level
- XP
- stats/progression
- inventory
- equipment
- stash
- gold
- materials
- skills
- talents
- quest state
- world seed
- discovered map
- waypoints
- world persistent states
- dungeon seeds/state
- NPC state
- campaign progress

Use schema/save versioning.

Do not add legacy importers or migrations for old game builds; document current-format invalidation behavior instead.

Never serialize fragile scene/node references as primary identity.

Use stable IDs.


### Implementation notes — Svelte / Phaser / TypeScript

Language preference is a **UI/browser setting**, not part of the character/world save. Locale-independent entity/item/quest IDs remain stable when switching `cs`/`en`. Legacy save imports are not required.

Use versioned IndexedDB **character-only** saves with atomic writes, validation and graceful rejection of incompatible versions. Save class, level, XP, gold, inventory/equipment, and (once implemented) quest flags, learned skills and talents. **Never save current enemy positions/health, active fights, dropped ground loot, cooldowns, temporary buffs/debuffs, world instance, or player map coordinates.** On load start a new fresh world instance and place the hero at a safe hub/spawn point with full health; quest and character progression survives. Do not import old HTML or demo saves. Never serialize Phaser/Svelte objects. Test character-only round trips, rejected old versions and new-session world reset.

Acceptance criteria:

- new game can be saved
- the game can be closed and reopened into a **fresh world/session**
- the hero's permanent progression restores correctly; combat, ground drops, cooldowns and enemy state do not
- corrupted/invalid save fails gracefully
- version field exists

---

# PROMPT 46 — Full HUD and Main Gameplay UI

Build production-oriented gameplay UI.

HUD:

- health
- class resource
- XP
- level
- skill bar
- potion
- buffs/debuffs
- minimap
- quest tracker

Menus:

- inventory
- equipment
- character statistics
- skills
- talent tree
- quest journal
- map
- crafting
- settings

Combat UI:

- enemy health
- boss health
- elite modifiers
- damage numbers
- crit feedback
- cooldown indicators

UI must observe gameplay state, not own it.


### Implementation notes — Svelte / Phaser / TypeScript

Localization requirement: all HUD and menu strings, tooltips, combat notifications, class resources and numbers flow through `svelte-i18n` or a typed adapter. Re-render visible translations on locale switch but do not touch simulation state or remount Phaser.

Write Svelte 5 HUD/menus as small components observing read-only selectors. Commands go through GameBridge. Avoid per-frame global UI updates and block click-through to Phaser.

Acceptance criteria:

- UI supports mouse interaction correctly
- UI blocks world click-through
- all major gameplay information is readable

---

# PROMPT 47 — Settings, Accessibility, and Input Rebinding

Implement settings.

Support:

- master volume
- music volume
- effects volume
- UI volume
- fullscreen/windowed
- resolution
- VSync
- UI scale
- screen shake intensity/on/off
- floating combat text
- input rebinding

Ensure all Diablo-style mouse actions can be rebound.

Do not assume left-handed/right-handed input layout permanently.


### Implementation notes — Svelte / Phaser / TypeScript

Provide a clearly labeled language setting `Jazyk / Language` with `Čeština` and `English`; switching via `svelte-i18n` updates UI, accessible labels, document `lang` and Phaser text overlays live. Persist preference independently; honor browser locale only on first visit.

Svelte owns settings and saved preferences; Phaser applies resolution scale, audio and effects. Browser VSync is not guaranteed configurable; fullscreen requires user gesture. Preserve Czech keyboard bindings.

Acceptance criteria:

- settings persist
- keybindings persist
- changing input mapping does not require code changes

---

# PROMPT 48 — Audio Framework

Implement audio architecture.

Categories/buses:

- Master
- Music
- Ambience
- Combat
- Monsters
- Spells
- UI

Add event hooks for:

- attacks
- hits
- spells
- loot
- NPC interactions
- bosses
- environment

Do not hardcode audio playback throughout unrelated systems.


### Implementation notes — Svelte / Phaser / TypeScript

Use Phaser audio or a Web Audio adapter. Svelte changes preferences, and browser audio is unlocked after a user gesture.

Acceptance criteria:

- categories have separate volume
- gameplay events can trigger audio centrally
- missing sound asset does not break gameplay

---

# PROMPT 49 — Act II Region

Add Act II:

**The Rotting Marshes**

Environment:

- swamps
- flooded ruins
- poisonous caves
- witch settlements

Enemies:

- swamp beasts
- plague zombies
- witches
- poisonous creatures
- insects

Mini bosses:

- Mire Hag
- Plague Brute
- Rotting Hydra

Boss:

**The Mother of Decay**

Create new biome-generation data, monster tables, dungeon themes, quests, and loot tendencies.

Reuse existing systems.


### Implementation notes — Svelte / Phaser / TypeScript

Ship Act II region names, quest/NPC dialogue, map markers, enemy and item UI descriptions in Czech and English in the same content change.

Act II is typed region/biome content rendered through shared Phaser tilemap and scene infrastructure.

Acceptance criteria:

- Act II is a progression from Act I
- it introduces new mechanics rather than only higher numbers
- content is data-driven

---

# PROMPT 50 — Act III Region

Add Act III:

**Ashen Highlands**

Environment:

- mountains
- volcanic regions
- mines
- ruined fortresses

Enemies:

- demons
- corrupted miners
- fire creatures
- armored beasts

Mini bosses:

- Forge Guardian
- Ash Demon
- Fallen Champion

Boss:

**The Infernal Smith**

Introduce fire hazards and new dungeon themes.


### Implementation notes — Svelte / Phaser / TypeScript

Ship complete Czech/English region and Act III quest content; no English-only placeholder strings in released UI.

Act III reuses the same TypeScript rules and Phaser region/scene adapters, not a separate game engine.

Acceptance criteria:

- new biome uses existing world-generation framework
- enemies introduce new tactical behaviors
- Act III progression and quest chain are complete

---

# PROMPT 51 — Act IV Region

Add Act IV:

**The Dead Kingdom**

Environment:

- abandoned cities
- necropolises
- haunted castles
- crypt networks

Enemies:

- skeleton armies
- ghosts
- necromancers
- vampires
- death knights

Mini bosses:

- Bone Colossus
- Vampire Lord
- Death Knight Commander

Boss:

**The Lich Sovereign**


### Implementation notes — Svelte / Phaser / TypeScript

Ship complete Czech/English Act IV location, NPC, quest and boss-facing text; verify UI and Phaser world labels switch in place.

Act IV visual effects use Phaser while environmental combat/hazard outcomes stay testable in TypeScript.

Acceptance criteria:

- region has distinct tone and mechanics
- end-of-act boss has multiple phases
- new loot and enemy mechanics integrate cleanly

---

# PROMPT 52 — Act V and Campaign Finale

Add Act V:

**The Shattered Realm**

Environment:

- corrupted reality
- floating ruins
- demonic fortresses
- unstable magical zones

Enemies:

- advanced demons
- corrupted celestial beings
- arcane creatures
- dimensional horrors

Create an original final antagonist tied to the world's corruption.

The final act should test advanced player builds.

Create:

- final quest chain
- mini bosses
- final dungeon
- multi-phase final boss
- campaign completion state


### Implementation notes — Svelte / Phaser / TypeScript

Ship full Czech/English localization for Act V and ending messages. Audit all campaign text for missing translations before declaring campaign complete.

Act V reuses shared Svelte UI, Phaser scenes and game systems; check all new assets in static Pages build.

Acceptance criteria:

- campaign can be completed from start to finish
- final boss uses multiple existing gameplay systems
- completion state persists

---

# PROMPT 53 — Difficulty Modes and Controlled Scaling

Implement difficulty modes.

Difficulty can affect:

- enemy health
- damage
- aggression
- elite frequency
- encounter composition
- loot quality
- XP
- gold

Avoid simply multiplying enemy HP.

Implement controlled regional level scaling.

The player should still feel stronger when returning to old areas.

Use region level ranges rather than permanently matching every enemy exactly to player level.


### Implementation notes — Svelte / Phaser / TypeScript

Difficulty multipliers are TypeScript simulation rules; Svelte selects mode and Phaser adjusts presentation only.

Acceptance criteria:

- difficulty changes combat meaningfully
- old regions remain easier later
- rewards correspond to increased challenge

---

# PROMPT 54 — Reputation and Factions

Implement optional faction reputation.

Reputation may unlock:

- quests
- merchants
- discounts
- recipes
- items
- dialogue

Keep faction logic data-driven.

Do not tightly couple it to the main campaign.


### Implementation notes — Svelte / Phaser / TypeScript

Faction/reputation logic stays in gameplay data with Svelte projections for relevant UI.

Acceptance criteria:

- reputation changes persist
- vendors/dialogue can query faction state
- system can be expanded with new factions

---

# PROMPT 55 — Advanced Legendary Items

Expand legendary loot.

Legendary items should often change gameplay mechanics rather than only provide larger numbers.

Examples:

- Whirlwind pulls enemies inward
- Fireball splits after impact
- Skeletons explode on death
- Charge leaves burning ground
- Poison spreads on critical hit
- Holy Strike creates a temporary aura

Create legendary-effect framework reusable across classes.


### Implementation notes — Svelte / Phaser / TypeScript

Implement legendary item triggers in the shared TypeScript combat/item systems, not custom scene/UI hooks.

Acceptance criteria:

- legendary effects are modular
- multiple legendary powers can exist without giant conditional code
- effects interact correctly with skills/talents

---

# PROMPT 56 — Endgame Foundation

Create a minimal extensible endgame foundation.

Do not build an enormous endgame yet.

Prepare systems for:

- higher difficulty dungeons
- dungeon modifiers
- world tiers
- boss farming
- challenge maps
- legendary farming
- post-campaign progression

Implement one prototype repeatable challenge dungeon with configurable modifiers.


### Implementation notes — Svelte / Phaser / TypeScript

Endgame generation remains deterministic and render-independent; Phaser presents regions and Svelte shows progress/results.

Acceptance criteria:

- campaign completion unlocks endgame prototype
- system reuses dungeon/loot architecture
- no major architecture rewrite is required

---

# PROMPT 57 — Performance Pass

Profile and optimize.

Focus on:

- enemy counts
- projectiles
- particles
- dropped loot
- navigation
- procedural generation
- chunk streaming
- AI updates
- UI updates

Use:

- object pooling where valuable
- spatial queries
- collision layers/masks
- AI update throttling
- chunk unloading
- off-screen deactivation

Do not prematurely optimize trivial code.

Measure before/after where possible.


### Implementation notes — Svelte / Phaser / TypeScript

Profile Phaser tilemap layers, texture memory, pools, culling and particles; profile Svelte subscription frequency. Test Vite production build at desktop/mobile viewports and tune DPR/FPS.

Acceptance criteria:

- performance bottlenecks are documented
- major bottlenecks are improved
- optimizations do not break deterministic gameplay

---

# PROMPT 58 — Procedural Generation Validation Suite

Build automated/debug validation for procedural content.

Test many generated seeds.

Validate:

- player spawn
- town reachability
- waypoint reachability
- quest destination reachability
- dungeon entrance reachability
- dungeon boss reachability
- navigation
- no critical object inside collision
- no disconnected dungeon critical path

Produce useful error output with seed information.


### Implementation notes — Svelte / Phaser / TypeScript

Run seed validation in Node/Vitest without Phaser or Svelte; record failing seed and input parameters.

Acceptance criteria:

- generation tests can run across many seeds
- failures report exact seed/context
- invalid generation fails safely

---

# PROMPT 59 — Combat and Item Test Suite

Add automated tests/debug validation for:

- damage formulas
- critical hits
- armor
- resistance
- blocking
- status effects
- XP
- level progression
- affix generation
- item rarity
- loot tables
- legendary modifiers
- talents

Test edge cases.


### Implementation notes — Svelte / Phaser / TypeScript

Use Vitest for combat/item edge cases and typed bridge contracts; keep Playwright for browser integration.

Acceptance criteria:

- core mathematical systems are covered
- failures are reproducible
- random tests use explicit seeds

---

# PROMPT 60 — Developer Console and Debug Tools

Create development-only debug tools.

Commands/actions:

- add XP
- add gold
- set level
- spawn enemy
- spawn elite
- spawn boss
- generate item
- generate rarity
- teleport
- activate waypoint
- reveal map
- god mode
- regenerate dungeon
- regenerate region
- inspect target
- inspect player stats
- print current RNG seeds

Debug tools must be disabled or inaccessible in release mode.


### Implementation notes — Svelte / Phaser / TypeScript

Use development-only Svelte debug panel and Phaser overlays gated by Vite environment flags; no production cheat controls.

Acceptance criteria:

- common gameplay systems can be tested quickly
- debug commands use normal gameplay APIs where possible

---

# PROMPT 61 — Multiplayer-Readiness Architecture Review

Do **not** implement multiplayer.

Review the complete codebase for future co-op compatibility.

Check:

- stable entity IDs
- deterministic world generation
- controlled RNG
- separation of input and gameplay
- separation of UI and game state
- explicit ownership of summons/projectiles
- centralized combat authority points
- serializable state
- minimal use of hidden global mutable state

Refactor only where current architecture would make future networking prohibitively difficult.

Design the future flow around the possibility of:

```text
client input
→ gameplay command
→ authoritative simulation
→ replicated state
```

Document findings in:

```text
docs/MULTIPLAYER_READINESS.md
```


### Implementation notes — Svelte / Phaser / TypeScript

Review command/snapshot isolation, serializable state and lack of Phaser/Svelte dependencies in simulation; document future server authority without implementing networking.

Acceptance criteria:

- no multiplayer code is required
- major blockers are documented/fixed
- current single-player game still behaves identically

---

# PROMPT 62 — Final Vertical Slice Verification

Perform a full gameplay verification.

The game must support this sequence without debug commands:

1. Start game.
2. Create Warrior.
3. Spawn in starting town.
4. Talk to quest NPC.
5. Accept quest.
6. Leave town using mouse movement.
7. Explore procedural wilderness.
8. Fight several enemy types.
9. Gain XP.
10. Level up.
11. Receive loot.
12. Equip an item.
13. Spend a talent point.
14. Discover dungeon.
15. Enter dungeon.
16. Defeat mini boss.
17. Defeat dungeon boss.
18. Receive boss loot.
19. Return to town.
20. Sell unwanted items.
21. Craft or upgrade one item.
22. Complete quest.
23. Activate waypoint.
24. Save.
25. Exit game.
26. Reload game.
27. Confirm character/world progression restored correctly.

Fix all blocking issues discovered.

Do not add unrelated new features during this verification pass.

### Implementation notes — Svelte / Phaser / TypeScript

Run Playwright in **both `cs` and `en`** for core game flow. Switch languages with a scene and dialogue open; verify no reload/game state loss, language persists on refresh, and menus, item tooltips, quests, combat text and errors remain translated.

Run Playwright against the built Vite bundle on `/dark_fantasy_2d_arpg/`: verify click-through prevention, movement, combat, loot, inventory, save/reload, assets, console errors and resize. Compare with legacy game until parity.


---

# PROMPT 63 — Full Game Systems Audit

Perform a final architecture and quality audit.

Inspect:

- class architecture
- combat
- skills
- talents
- status effects
- items
- loot
- crafting
- quests
- dialogue
- procedural generation
- dungeons
- bosses
- world streaming
- saving
- UI
- input
- performance
- future multiplayer readiness

Look specifically for:

- duplicated logic
- god classes
- hardcoded content
- unsafe global state
- circular dependencies
- inconsistent IDs
- duplicated formulas
- fragile save behavior
- unnecessary per-frame processing

Refactor only clear architectural problems.

Update documentation to match the final code.

At the end, produce a concise architecture summary and list the highest-value future improvements.

### Implementation notes — Svelte / Phaser / TypeScript

Audit `svelte-i18n` key parity, ICU plurals/placeholders, untranslated strings, Czech declension in generated item names, Phaser text refreshes, locale preference persistence and lack of localized strings in serialized game state.

Audit Svelte component ownership, Phaser scene cleanup, simulation independence, typed bridge, IndexedDB migrations, Vite base URLs, GitHub Pages workflow and Vitest/Playwright coverage.


---

# Final Target

The finished application must be a **Svelte 5 + Phaser 4 + TypeScript + Vite static SPA**, housed in `web/`, with independent deterministic simulation, a typed UI/game bridge, **full Czech/English localization via `svelte-i18n`**, versioned IndexedDB saves, static assets under the GitHub Pages repository path and passing Vitest/Playwright tests. Its release workflow deploys `web/dist/` only for changes to published game/build inputs; documentation-only commits do not redeploy.

The completed project should provide:

- Diablo-style mouse movement and targeting
- real-time ARPG combat
- Warrior
- Paladin
- Mage
- Necromancer
- Rogue
- Warlock
- class-specific resources
- skill systems
- talent trees
- meaningful build diversity
- item rarity
- randomized affixes
- legendary effects
- equipment
- inventory
- stash
- gold economy
- merchants
- crafting
- gems/runes
- potions
- status effects
- enemy AI
- monster families
- elite enemies
- mini bosses
- act bosses
- five Acts
- persistent towns
- procedural wilderness
- procedural dungeons
- world events
- quests
- dialogue
- map/minimap
- fog of war
- fast travel
- death/respawn
- difficulty modes
- save/load
- scalable UI
- complete Czech and English localization (menus, HUD, NPC dialogue, all quests, items, skills and campaign)
- in-game language switching without reloading
- settings/input rebinding
- debugging tools
- performance-conscious world streaming
- future multiplayer-ready architecture

Priority order:

```text
gameplay correctness
→ clean architecture
→ responsive controls
→ combat feel
→ progression
→ procedural replayability
→ content
→ polish
```

Do not sacrifice maintainability for rapid content generation.

Build and verify each layer before expanding the next one.
