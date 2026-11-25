# Aether & Ruin — 2.5D Isometric ARPG Implementation Prompts (01–63)

These **63 numbered prompts** define the scope and acceptance criteria. Use the [roadmap](docs/ROADMAP.md) for current integration order and dependencies and the [implementation status](docs/IMPLEMENTATION_STATUS.md) to identify work already integrated. Preserve a playable, testable browser game at every step.

This plan modernizes the **existing Aether & Ruin HTML5 Canvas prototype**. Reuse its functioning classes, quests, combat, inventory and world systems where practical. **Preserve the supported web save formats and their migrations.** Importing saves from the original HTML prototype is outside this project scope. The target is a 2.5D isometric (2:1) dark-fantasy ARPG with Diablo-like mouse movement, six classes, a complete procedural Act I and future multiplayer-readiness. Five acts remain the long-term product scope, not permission to start Acts II–V.

## Binding architecture and integration contract — Roadmap v3 (2026-11-25)

These requirements apply to **all 63 prompts**, including earlier integrated features and future reference specifications. Where older text conflicts, this contract and the prompt-specific updates prevail. Prompt numbers identify capabilities, not execution order. Do not reimplement a completed capability simply because its original prompt is written in imperative form.

**Single source of sequencing:** [Roadmap #119](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/119) and its repository mirror [docs/ROADMAP.md](docs/ROADMAP.md). G0: finish existing PRs #250 → #252 → #253; G1: technical isometry (#210); G2: complete Act I region/content/session (#208) and living population (#207); G3: gameplay systems and balancing; G4: final art/audio/polish (#124); G5: complete player acceptance (#125). Do one active implementation package at a time, test-first, exact-head CI and merge before moving on. No Act II–V planning, content preparation, implementation or integration before explicit user approval of G5. Future prompts stay reference-only until their gate.

### Coordinate, rendering and input ownership

- Simulation, collision, pathfinding, world generation, combat ranges and persistence use **Cartesian world-space coordinates**. Isometry is a presentation transform only: at a chosen render origin, projected x = world x − world y and projected y = (world x + world y)/2 − visual elevation. Use the existing `isometricProjection.ts` contract, not another transform.
- Phaser 4 projects world geometry, actors, loot, NPCs, portals, effects and telegraphs through the shared projection. Camera screen → projected scene → inverse world plane; perform body/ground and opaque-depth picking before issuing the existing typed commands. The simulation authorizes range, line of sight, reachability and interaction; interactive auto-approach uses the same collision-aware navigation as movement.
- Depth derives from ground contact/footprint, not sprite height or screen y after elevation. Buildings have independently faded facade/roof groups; opaque picking uses the same silhouettes as visible art. Visual elevation/occlusion never creates a traversable floor or removes collision. Real multi-level geometry requires a separate approved navigation contract.
- Use eight visual facing directions, animation state and authoritative combat timelines. No damage or quest state in animation callbacks. Technical G1 may use functional procedural placeholder assets; final licensable cohesive art belongs to G4. Switch the default renderer only after G1 technical acceptance of existing playable content; retain classic as fallback through G5. No production cutover based on compilation alone.
- Fog of war is **map/minimap only**. Unobserved terrain, roads and POIs are hidden on both maps; the world scene has no discovery mask or exploration dimming. Natural lighting and occlusion are independent.

### Procedural Act I, population and persistence

- Stable semantic IDs and authored approximate settlement anchors; variable coherent terrain, forests, ridges/passes, routes, structures and POIs. At least three inhabited settlements and three distinct playable dungeons (story crypt, mine, cave), quests, services, shrines, waypoints and events. Main roads connect settlements; optional trails may end or omit POIs. All required targets must be walkable, not necessarily road-connected. One validated geometry contract for generation, collision, maps and both renderers.
- Domain-separated deterministic seeds for region, chunks, dungeon instances, encounters and loot; bounded retries and safe fallback. Preserve actual entrance/exit identity and story/optional dungeon separation. No renderer RNG may alter authoritative content.
- Replace ordinary global encounter waves with seeded groups and stable IDs in biomes, rooms and chunks (#207). Waves are allowed for explicit events and authored boss mechanics only. Use bounded active simulation population, preserve defeated/consumed state, and prevent reward or HP reset exploits on unload/reentry. Rendering culling is not simulation despawning.
- Character v11 remains durable (items, XP, level, gold, talents, quests/reward claims). World v1 is per-character and seed-scoped (discovery, checkpoints and validated world facts). **New launch/session chooses a new seed even for an existing hero**; save, death, portal, travel and same-session reload must not change it. Explicit same-seed restoration may restore compatible world facts; a fresh launch must not accidentally restore old discovery, encounter or waypoint state. No requirement to migrate historical positions. No schema bump without approval. Do not claim atomic cross-record persistence unless the transaction actually covers both records. Prompt 45 defines the target; implementation evidence is tracked separately.
- Final acceptance requires natural gameplay, actual input/interaction, multiple seeds, all six classes, CS/EN, desktop and physical Android/iOS, accessibility, performance and exact-head CI plus verified public Pages deployment. A fixture, green build or single story completion is not G5 approval.

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
| Persistence | **IndexedDB** (saves), `localStorage` (preferences only) | Versioned character and world records with supported web-format migrations |
| Tests | **Vitest**, **Playwright**, `svelte-check` | Logic tests, browser tests, static checks |
| Deployment | **GitHub Actions → GitHub Pages** | Publish `dist/`, no runtime backend |
| Localization | **`svelte-i18n`**, `cs` and `en` | Runtime language switching, ICU messages, localized game UI and content |

Use compatible stable versions and a committed `package-lock.json`; verify installed Phaser 4 APIs and plugins rather than copying Phaser 3-specific code. Prefer Svelte component CSS or installed/build-time Tailwind, **not** the Tailwind CDN in production.

## Architecture Rules and Ownership

1. **Pure TypeScript simulation** (under `web/src/game`): Owns player HP, positions, cooldowns, damage, inventory, loot, NPC/quest state and RNG. It exposes validated progression projections. Browser persistence adapters own IndexedDB. The simulation has no Phaser, Svelte or DOM dependency.
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

- [`quality.yml`](.github/workflows/quality.yml) handles PRs, eligible pushes to `main` and manual dispatch. It installs locked dependencies, validates types, runs Vitest, builds and runs Chromium against the production bundle.
- The `deploy` job publishes `web/dist/` after successful verification of a push with published build-input changes or a manual dispatch. Docs-only and test-only changes do not publish. Treat a green verification job and an actual successful Pages deployment as separate evidence.
- Serve the static Svelte/Phaser app at Vite base `/dark_fantasy_2d_arpg/`. The published build needs no runtime backend or API keys. The root HTML prototype remains an offline reference.

## Migration Strategy for Existing Files

The repo already includes `dark_fantasy_2d_arpg_engine.html`, `visuals.js`, `visuals.css`, `index.html` and a Pages workflow. Treat these as a **reference implementation**, not dead code.

1. Run/reference the original browser game; list working gameplay features, known defects and important interactions.
2. Build Svelte/Phaser in **`web/`**, preserving the old root HTML for reference. Deploy a tested `web/dist/` to the main Pages URL as a public development release.
3. Extract typed content, simulation, stat/combat formulas, seeded RNG, command handling and save DTOs into testable TypeScript modules; preserve balance and IDs.
4. Migrate scenes, pixel sprites, movement/input and graphical effects incrementally into Phaser. Replace UI panels with Svelte, communicating only through the typed bridge.
5. Persist explicit character and world-progress DTOs, never a full `GameSnapshot`. Distinguish new launch (new seed, durable character retained) from explicit same-session/same-seed restore (eligible world facts only). Preserve supported web-format migrations described in Prompt 45.
6. Incrementally complete a parity slice: town → NPC quest → mouse movement → combat → loot → inventory → save → reload. Pages already deploys `web/dist/`; every additional release must pass quality gates. Keep root legacy HTML as an offline reference.

Never replace working systems with empty Phaser/Svelte placeholders just to satisfy file structure.

## Milestone Gates and Definition of Done

Milestones below are historical capability groups, not active scheduling gates. For current sequencing and acceptance use Roadmap v3 G0–G5 above.

| Gate | Prompts | Evidence required |
| --- | --- | --- |
| Baseline and scaffold | 01–05 | Legacy game still playable; staged `web/` build and typed input/game bridge; `svelte-i18n` initialized with `cs/en`, language selector, browser boot and click-through smoke tests |
| Core combat slice | 06–17 | Mouse movement, attacks, damage, status effects, loot and inventory work together; deterministic unit tests |
| Act I world slice | 18–29 | Reachable town/quest → wilderness → dungeon → boss → loot → return, in browser, with bilingual NPC dialogue, objectives, item names and map labels |
| Progression and classes | 30–44 | No duplicated item/skill rules; each class uses shared systems; representative builds tested |
| Persistence and UI | 45–48 | Current and supported migrated saves retain progression after reload. Unsupported records fail gracefully. Keyboard/UI interactions and mid-game `cs`↔`en` switching are verified. |
| Campaign and endgame (blocked beyond Act I) | 49–56 | Reference only for Acts II–V/endgame until G5 user approval; 53/55 may be scoped to Act I in G3 |
| Release readiness | 57–63 | Profiler evidence, deterministic seed suite, combat tests, full vertical-slice E2E, no console errors and successful Pages preview |

Every implemented feature needs: a clearly owned TypeScript state, a Phaser presentation adapter where needed, a Svelte UI projection where needed, validation/automated tests, documentation of changed public interfaces, and no unplanned regression of the legacy prototype.

**Simulation determinism**: pick a documented simulation tick rate, use accumulator/catch-up caps after tab suspension, never depend on render delta or `Math.random()` for authoritative rolls, and make replay/seed failures reproducible.

**Save safety**: version current save DTOs and content definitions; distinguish persistent IDs from Phaser sprite IDs, validate data, handle quota/private-mode/storage errors, and **migrate explicitly supported web formats** and reject invalid or unsupported records. A new game must always remain possible.

**Graphics production**: establish consistent camera/world units, tile sizes, sprite pivots, depth/occlusion layers, pixel-art filter/zoom, animation naming, texture atlases and art credits before scaling content. Include a visual regression/screenshot check for representative environments where practical.

**Mobile/accessibility**: the priority is a usable desktop mouse/keyboard experience; Svelte HUD should scale responsively. Touch controls and accessible modal interactions have their own acceptance checks. Use automated viewport coverage and record separate results for physical Android/iOS and a screen reader.

**Deployment optimization**: a docs-only or test-only commit may execute an appropriate quality check, but must not produce a Pages artifact or deployment. A verified push with game, asset or build-input changes deploys the published app.

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
19. Preserve existing class and quest behavior, including supported web save migrations. The original HTML prototype has a separate save format.
19a. For every player-facing message added or edited in a prompt, provide Czech and English translations in the same change and test the runtime locale switch; never store translated strings as gameplay IDs or save fields.
20. At the end of each task report: created/modified files, architecture changes, gameplay changes, tests, Pages/deploy status, limitations and recommended next step.
21. Do not redeploy Pages when only README, prompts, docs or tests change. Rebuild after published `web/` game, asset, locale or build-input changes, with independent PR quality checks.
22. Never make a production deployment solely to validate a documentation change. Never skip a relevant staging/production test to make a release appear green.

Use a consistent **dark-fantasy pixel-art** direction with legible silhouettes, proper spritesheets, tilemap layers, atmospheric lighting, visible telegraphs and responsive HUD. Gameplay correctness takes priority over decorative effects.

---

<a name="prompt-01"></a>
# PROMPT 01 — Project Foundation and Architecture

**Roadmap v3 contract:** Audit the existing web implementation; do not scaffold a second engine. Reuse GameSimulation, GameBridge, FrontierScene and the opt-in IsometricPreviewScene. Technical G1 validates the latter before default cutover.

Establish a scalable **Svelte 5 + Phaser 4 + TypeScript + Vite** foundation and keep migrating incrementally. The old HTML engine remains only as a repository reference, while `web/dist/` is the published game.

Initialize a strict TypeScript Vite SPA **in `web/`** (not over the live root `index.html`) with a Svelte root mounting/unmounting Phaser in `GameViewport.svelte`. Add Vitest, Playwright, `svelte-check`, a lockfile, GitHub Pages base path configuration and **`svelte-i18n` with `cs`/`en` catalogs from day one**.

Required project structure (the new frontend is permanently isolated under `web/`; create only files needed now):

```text
/
├── index.html                        # Offline HTML reference entrypoint
├── dark_fantasy_2d_arpg_engine.html  # Existing browser reference game
├── visuals.js / visuals.css          # Legacy art helpers
├── 2d_arpg_implementation_prompts.md
├── .github/
│   └── workflows/
│       └── quality.yml              # Verify PR/push and deploy eligible builds
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

<a name="prompt-02"></a>
# PROMPT 02 — Player Entity and Character Core

**Roadmap v3 contract:** Player position, speed, radius, stats and resources remain world-space; sprite facing and screen elevation are renderer-only.

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

<a name="prompt-03"></a>
# PROMPT 03 — Diablo-Style Mouse Movement

**Roadmap v3 contract:** Convert camera/DPR/zoom-adjusted pointer coordinates through inverse isometric projection; the same authoritative navigation handles ground clicks, held movement and interactive approach. Test both mouse and touch.

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

<a name="prompt-04"></a>
# PROMPT 04 — Mouse Context Resolver and Interaction Model

**Roadmap v3 contract:** Use shared typed context/picking; select projected actor bodies and ground targets with opaque occluder depth, then authorize range and LOS in simulation. Cover NPC, loot, doors, chests and all dungeon portals.

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

<a name="prompt-05"></a>
# PROMPT 05 — Force Move, Hold Position, and Skill Aiming

**Roadmap v3 contract:** All aim types carry world-space point/entity/direction values. Isometric input, held movement and modifiers use existing bindings and respect modal capture; test mouse, keyboard, touch and AltGr.

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

<a name="prompt-06"></a>
# PROMPT 06 — Combat Foundation

**Roadmap v3 contract:** Damage, ranges, LOS, projectiles and hit areas use Cartesian world-space; project the authoritative shapes for isometric warnings.

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

<a name="prompt-07"></a>
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

<a name="prompt-08"></a>
# PROMPT 08 — Animation and Combat Feel

**Roadmap v3 contract:** G1: functional eight-direction atlas and combat timeline parity, projected shadows, effects and hit feedback; G4: final authored assets. Use footpoint depth and independent occlusion without changing attack timing.

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

<a name="prompt-09"></a>
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

<a name="prompt-10"></a>
# PROMPT 10 — Enemy Framework and AI

**Roadmap v3 contract:** G2/#207 replaces ordinary global packs/waves with deterministic spatial groups, stable IDs, budgeted activation and persistent visit facts. Existing wave systems are transitional except explicit events and boss mechanics.

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

<a name="prompt-11"></a>
# PROMPT 11 — Monster Families

**Roadmap v3 contract:** Populate actual biomes/dungeon rooms from typed family catalogs; reuse monster actions and stable encounter IDs, not fixed global pack indices.

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

<a name="prompt-12"></a>
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

<a name="prompt-13"></a>
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

<a name="prompt-14"></a>
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

<a name="prompt-15"></a>
# PROMPT 15 — Inventory and Equipment

**Roadmap v3 contract:** Use #123 as the sole inventory task: inspect-only first click/tap, explicit equip/unequip and drag/move, compatible target hints, 2H/offhand and rings, stash, same item identity, accessible CS/EN errors.

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

<a name="prompt-16"></a>
# PROMPT 16 — Loot Drops

**Roadmap v3 contract:** Seeded loot is simulation-owned. Ground loot has world positions; projected picking and filters never mutate drop identity or RNG. One-shot encounter/treasure rewards are seed-scoped.

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

<a name="prompt-17"></a>
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

<a name="prompt-18"></a>
# PROMPT 18 — First Persistent Town

**Roadmap v3 contract:** G2/#208: at least three inhabited settlements (hub and two villages) with stable identities/approximate anchors but variable layout and paths. Render shared structure footprints and NPC manifests; protect safe zones and ensure reachable service approaches.

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

<a name="prompt-19"></a>
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

<a name="prompt-20"></a>
# PROMPT 20 — Dialogue and Quest Foundation

**Roadmap v3 contract:** NPC and quest IDs are semantic, independent of generated positions. Require real NPC interaction range/LOS and character-scoped one-time quest claims across new seeds.

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

<a name="prompt-21"></a>
# PROMPT 21 — Act I Quest Chain

**Roadmap v3 contract:** Keep the existing nine-story-quest chain and local side quests; optional mine/cave must not advance story crypt milestones. Unlock eligibility is not permission to build Act II before G5.

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

<a name="prompt-22"></a>
# PROMPT 22 — Procedural Wilderness Generation

**Roadmap v3 contract:** Use #208 regional terrain and settlement/road manifests. Plan coherent terrain and navigable corridors before road routes; main trade roads connect settlements, optional trails may terminate or leave POIs off-road. Guarantee walkable required targets, not a road to every object. Validate fresh seeds and bounded fallbacks.

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

<a name="prompt-23"></a>
# PROMPT 23 — World Chunking and Streaming

**Roadmap v3 contract:** Separate simulation lifecycle (#207) from camera-driven isometric render culling/texture cache (G1/#210). Stable chunk IDs and facts survive unloading within a seed; no enemy HP or reward reset exploit. Profile mobile memory and release textures on rebuild/shutdown.

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

<a name="prompt-24"></a>
# PROMPT 24 — Map, Minimap, and Fog of War

**Roadmap v3 contract:** Fog only on large map and minimap. Known regions remain revealed within the same seed; fresh launch resets discovery. Clip roads, landmarks, portals and quest hints to discovered cells. No scene fog/dimming or leak of unknown POIs.

Implement:

- minimap
- world map
- fog of war on map and minimap only
- discovered areas
- landmarks
- quest markers
- dungeon entrances
- towns
- waypoints

Map discovery persists only within the active seed and compatible same-seed restoration; a new launch starts a new undiscovered world.

Do not reveal unexplored procedural locations automatically.


### Implementation notes — Svelte / Phaser / TypeScript

Exploration/fog state belongs to simulation/persistence. Phaser maps coordinates; Svelte displays map/minimap overlay without duplicating discovery logic.

Acceptance criteria:

- unexplored map starts hidden
- exploring reveals terrain
- known towns remain visible
- map state persists within the same seed; a fresh launch resets discovery

---

<a name="prompt-25"></a>
# PROMPT 25 — Procedural Dungeon Generator

**Roadmap v3 contract:** Generate independent interiors for story crypt, mine and cave from region seed + dungeon identity. Shared validated room/door geometry; distinct spawns, layouts, rewards and exact return entrance. Never route optional bosses into story quest state.

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

<a name="prompt-26"></a>
# PROMPT 26 — First Dungeon Theme

**Roadmap v3 contract:** Keep story crypt identity; mine/cave use their own materials, decorations, enemies, treasure and telegraphed hazards. Shared isometric floor/wall silhouettes and collision; decoration is not a functional prop unless authorized by simulation. G4 final art follows content.

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

<a name="prompt-27"></a>
# PROMPT 27 — Mini Boss Framework

**Roadmap v3 contract:** Assign seeded miniboss identity to actual regions/POIs; defeat facts and one-shot rewards must not reset when chunks unload. Project attacks and health independently of gameplay.

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

<a name="prompt-28"></a>
# PROMPT 28 — Boss Framework and First Act Boss

**Roadmap v3 contract:** Story Hollow King remains distinct from optional dungeon bosses. World-space windups, reachable movement and LOS; telegraphs projected through the shared renderer. Unique mechanics and balance only in their active roadmap gate.

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

<a name="prompt-29"></a>
# PROMPT 29 — Death and Respawn

**Roadmap v3 contract:** Respawn preserves active session seed, relevant discovery and consumed/defeated facts; avoid granting duplicate quest or same-seed rewards. No positional migration requirement.

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

<a name="prompt-30"></a>
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

<a name="prompt-31"></a>
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

<a name="prompt-32"></a>
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

<a name="prompt-33"></a>
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

<a name="prompt-34"></a>
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

<a name="prompt-35"></a>
# PROMPT 35 — Player Stash

**Roadmap v3 contract:** Stash is durable character state, not region seed state; explicit move/equip/drop transactions preserve item identity.

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

<a name="prompt-36"></a>
# PROMPT 36 — Fast Travel and Waypoints

**Roadmap v3 contract:** Use discovered/activated waypoints with stable IDs and authoritative destination validation. New launch resets world activation; travel within a session does not regenerate the region.

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

<a name="prompt-37"></a>
# PROMPT 37 — World Events

**Roadmap v3 contract:** Events are explicit seeded local encounters; bounded event waves are valid, but not global default population. Stable one-shot facts across same-seed reentry and appropriate reset on fresh launch.

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

<a name="prompt-38"></a>
# PROMPT 38 — Shrines and Environmental Interactions

**Roadmap v3 contract:** Place shrines and actionable objects in actual valid terrain/rooms; use manifest IDs, range/LOS and collision-aware approach. Claims committed before rewards; project warnings/props without renderer ownership.

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

<a name="prompt-39"></a>
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

<a name="prompt-40"></a>
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

<a name="prompt-41"></a>
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

<a name="prompt-42"></a>
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

<a name="prompt-43"></a>
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

<a name="prompt-44"></a>
# PROMPT 44 — Class Selection and Character Creation

**Roadmap v3 contract:** Selecting an existing character for a new launch preserves character progression but generates a fresh region seed; selecting/creating a character must not leak another character's world facts.

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

<a name="prompt-45"></a>
# PROMPT 45 — Save/Load System

**Roadmap v3 contract:** G2 defines the launch/session distinction below. This is the target contract, not a claim that the current bridge already implements it.

Maintain versioned IndexedDB saves for multiple characters. Keep durable hero and world progression independently scoped to the selected character.

- **Character v11:** class, level, XP, points, inventory/equipment, stash, gold, materials, skill/talent progression, and durable quest and campaign milestones. Preserve stable inventory instance IDs and completed reward flags.
- **World v1:** seed, map discovery, waypoint/checkpoint activation and allowlisted world facts, such as consumed props and defeated persistent encounters. Validate the character ID, seed and referenced content before restoring.
- **Browser preferences:** locale, bindings, accessibility and audio settings have browser-local storage and do not enter either record.

New launch or selecting a character to begin a new session starts at the safe hub with full health and a newly chosen world seed, retaining character v11 progression and durable reward claims. An explicit compatible same-seed restore within the active session regenerates geometry and restores only validated world v1 facts. Saving, respawning, travel and portal transitions never reroll the seed. Current position, active fights, enemy health, dropped ground loot, general combat cooldowns and active temporary effects are session data; no historical position migration is required. Explicit durable consumable bookkeeping uses existing validated character fields.

Use stable IDs, validated IndexedDB writes and explicit migrations from Svelte/Phaser character formats v8–v10. Character/world records are separate; do not claim atomicity across them unless implemented and tested in a shared transaction. Handle unsupported versions, damaged records and browser storage failures gracefully. Keep the original HTML saves outside the web migration path.

Acceptance criteria:

- Save/Load preserves the selected hero, gear identities and quest outcomes after closing and reopening. A fresh launch chooses a new seed and resets world-specific discovery, encounters, waypoints and claims; character quest rewards remain one-shot.
- Two characters can be switched and reloaded without sharing map discovery, items or quest rewards.
- Supported web-format migrations are tested with equipment and already-claimed rewards. Invalid and unsupported records produce recoverable behavior.
- Explicit same-seed restore keeps the seed and eligible world facts; a fresh launch starts combat clean with a new seed. Neither path duplicates durable character rewards; validate cross-character and mismatched-seed rejection.

---

<a name="prompt-46"></a>
# PROMPT 46 — Full HUD and Main Gameplay UI

**Roadmap v3 contract:** Use existing Svelte projections and modal stack; no duplicate HUD/gameplay rules. G1 checks technical interaction parity; G3/G5 checks full HUD/inventory/touch/accessibility, with #123 owning inventory.

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

- Keep key actions reachable at 390, 560, 740, 900 and 1440 px in browser tests. Check small touch portrait and landscape on physical devices before G5 sign-off.
- Test keyboard focus entry/return, accessible names and prevention of world click-through or game hotkeys while interacting with a modal.
- Verify the same item and skill identities in HUD, inventory and tooltips after panel changes and live CS/EN switching. The simulation remains authoritative for equip, loot and skill actions.

---

<a name="prompt-47"></a>
# PROMPT 47 — Settings, Accessibility, and Input Rebinding

**Roadmap v3 contract:** Preferences are browser-local; renderer/view selection does not alter simulation or save. Test isometric mouse/touch/keyboard bindings, modifier chords, UI capture and focus.

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

- Settings and bindings persist across refresh, and HUD hints reflect remapping immediately.
- Verify left-handed mouse remapping, held-position release, input conflicts and Czech keyboard behavior using physical key codes. Track modifier/browser edge cases in [#153](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/153).
- Record keyboard-only, screen-reader and device checks separately from automated viewport coverage.

---

<a name="prompt-48"></a>
# PROMPT 48 — Audio Framework

**Roadmap v3 contract:** G4 final audio; authoritative game events feed one audio adapter regardless of renderer. Avoid double-playing events, handle browser autoplay and mobile lifecycle.

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

- Master and category controls persist and affect their own audio buses. Combat, boss, loot, NPC and environment cues use centralized typed event routing.
- Audio unlocks on user interaction. Muting, hidden tabs, unavailable audio and missing optional assets leave gameplay functional.
- The integrated procedural cues establish runtime coverage. Assess production sound and music separately with credited assets or project-authored sources.

---

<a name="prompt-49"></a>
# PROMPT 49 — Act II Region

**Roadmap v3 contract:** BLOCKED until explicit G5 approval; no Act II planning, data preparation, code or PR. Future region must reuse the accepted isometric/seed/quest contracts.

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

- Use Vesna’s completed report as the authoritative unlock. Before completion, the new route is unavailable. After completion, normal play and Save/Load preserve access, with Act I quest outcomes and rewards intact.
- Integrate the first playable route in stages as described in the [roadmap](docs/ROADMAP.md). The full prompt requires a playable region, complete local quest chain, dungeon encounter and Mother of Decay.
- Add a biome mechanic with readable cues and player counterplay. Reuse typed region, quest, enemy and loot systems.
- Cover a fixed regression seed and generated routes to required objectives, dungeon entry and return. Verify generated layout reproducibility and useful failures with the failing seed.
- Verify a natural Act I → Act II handoff and stable quest and item identities across Save/Load, with corresponding CS/EN strings.

---

<a name="prompt-50"></a>
# PROMPT 50 — Act III Region

**Roadmap v3 contract:** BLOCKED until explicit G5 approval and Act II acceptance. Reuse the shared isometric world pipeline.

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

<a name="prompt-51"></a>
# PROMPT 51 — Act IV Region

**Roadmap v3 contract:** BLOCKED until explicit G5 approval and Act III acceptance. Reuse the shared isometric world pipeline.

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

<a name="prompt-52"></a>
# PROMPT 52 — Act V and Campaign Finale

**Roadmap v3 contract:** BLOCKED until explicit G5 approval and Act IV acceptance. Reuse the shared isometric world pipeline.

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

<a name="prompt-53"></a>
# PROMPT 53 — Difficulty Modes and Controlled Scaling

**Roadmap v3 contract:** G3 after #207 population; reassess draft #206 against actual Act I encounters, no runtime merge based on old global waves. No Act II balancing.

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

<a name="prompt-54"></a>
# PROMPT 54 — Reputation and Factions

**Roadmap v3 contract:** Deferred beyond Act I approval; reference only.

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

<a name="prompt-55"></a>
# PROMPT 55 — Advanced Legendary Items

**Roadmap v3 contract:** G3 only for necessary Act I item/build diversity; broader campaign/endgame effects deferred. Audit existing item systems first.

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

<a name="prompt-56"></a>
# PROMPT 56 — Endgame Foundation

**Roadmap v3 contract:** BLOCKED until explicit G5 approval and completed campaign; reference only.

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

<a name="prompt-57"></a>
# PROMPT 57 — Performance Pass

**Roadmap v3 contract:** G1 technical baseline and G4/G5 final performance: measure isometric render/culling, texture memory, active enemy budget, navigation, particles and Svelte updates on desktop/mobile. Never skip authoritative combat or change RNG due to visibility.

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

<a name="prompt-58"></a>
# PROMPT 58 — Procedural Generation Validation Suite

**Roadmap v3 contract:** G2 rerun strict 1,000-distinct-seed wilderness/dungeon validation (#113) plus boundary and historical regressions after topology/population changes; verify both graph and actual geometry, all settlements, off-road required targets, exact returns, safe spawns and discovery. Report all failing seeds without weakening gates.

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

<a name="prompt-59"></a>
# PROMPT 59 — Combat and Item Test Suite

**Roadmap v3 contract:** G3/G5: deterministic combat/item regression including seed-scoped rewards, persistent character claims, full-inventory ground fallback, optional bosses and projected interaction parity. Do not replace natural E2E with fixture-only tests.

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

<a name="prompt-60"></a>
# PROMPT 60 — Developer Console and Debug Tools

**Roadmap v3 contract:** Only if required by active gate; dev-only, no production debug commands or hidden bridge bypass. Debug fixtures do not count as acceptance.

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

<a name="prompt-61"></a>
# PROMPT 61 — Multiplayer-Readiness Architecture Review

**Roadmap v3 contract:** Deferred review until after Act I approval and stable campaign scope; no netcode or speculative architectural rewrite.

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

<a name="prompt-62"></a>
# PROMPT 62 — Final Vertical Slice Verification

**Roadmap v3 contract:** Deferred release-wide verification; earlier G5/#125 requires a full natural Act I in default isometry, multiple seeds, all six classes, physical devices and public build. Distinguish same-seed restoration from fresh-launch reset.

Perform the release-wide vertical-slice verification after campaign integration. G5 uses the [Act I acceptance gate](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/125) earlier and exercises the full story through Vesna. This prompt also checks progression, economy, crafting, travel and the release build.

Run this sequence from a fresh character with ordinary player-facing controls:

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
27. Confirm the same item identities, character progression and durable quest rewards after reload. For a new launch require a fresh seed and reset session map/waypoints/world facts; separately test explicit same-seed restoration of compatible facts and seed stability during travel/death/save.

Fix all blocking issues discovered.

Do not add unrelated new features during this verification pass.

### Implementation notes — Svelte / Phaser / TypeScript

Run Playwright in **both `cs` and `en`** for core game flow. Switch languages with a scene and dialogue open; verify no reload/game state loss, language persists on refresh, and menus, item tooltips, quests, combat text and errors remain translated.

Run Playwright against the built Vite bundle on `/dark_fantasy_2d_arpg/`: verify click-through prevention, movement, combat, loot, inventory, save/reload, assets, console errors and resize. Compare with legacy game until parity.


---

<a name="prompt-63"></a>
# PROMPT 63 — Full Game Systems Audit

**Roadmap v3 contract:** Deferred final release audit after campaign; G5 is a separate Act I gate. Audit coordinate ownership, seed/session boundary, stable IDs, resource cleanup, map-only fog and renderer independence.

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

The finished application must be a **2.5D isometric Svelte 5 + Phaser 4 + TypeScript + Vite static SPA**, housed in `web/`, with independent deterministic simulation, a typed UI/game bridge, **full Czech/English localization via `svelte-i18n`**, versioned IndexedDB saves, static assets under the GitHub Pages repository path and passing Vitest/Playwright tests. Its release workflow deploys `web/dist/` only for changes to published game/build inputs; documentation-only commits do not redeploy.

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
- complete Act I before explicit approval; five Acts as the long-term scope
- persistent towns
- procedural wilderness
- procedural dungeons
- world events
- quests
- dialogue
- map/minimap
- fog of war on map and minimap only
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

Integration order (Roadmap v3):

```text
G0 stabilize existing PRs
→ G1 technical isometry
→ G2 complete procedural Act I and population
→ G3 gameplay systems and balance
→ G4 final art/audio/polish
→ G5 natural player acceptance and user approval
```
Gameplay correctness and clean architecture apply at every gate.

Do not sacrifice maintainability for rapid content generation.

Build and verify each layer before expanding the next one.
