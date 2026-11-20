# Wave G — Corrupted Crypt, minibossové a Hollow King (Prompty 26–28)

**Stav: HERNÍ JÁDRO WAVY G INTEGROVÁNO DO MAIN (20. 11. 2026); úplná acceptance stále otevřená.**
**3 souběžní agenti (31–33), izolované worktree, společný BASE_SHA až po merge tohoto plánovacího PR, pouze draft PR a přesně dva soubory na agenta.**

Zdroj: [originální Prompty 26–28](../../../2d_arpg_implementation_prompts.md), koordinační [README](README.md), [INTEGRATION_G.md](INTEGRATION_G.md) a agentní [TASK.md](31/TASK.md). Repo: `Nereziel/dark_fantasy_2d_arpg`.

## Technický baseline a zásadní omezení

- Wave F má integrované herní jádro. Agent 30 vytvořil čistý `proceduralDungeon.ts`, runtime `buildCryptWorld(seed)` v `dungeonRuntime.ts` je už zapojen do `GameSimulation` a `FrontierScene`. Legacy `generateCrypt` se zachovává pro kompatibilitu. `CRYPT_EXIT`, `CRYPT_GATE`, a stage 0 tři strážci → stage 1 `crypt_lord` + dva strážci fungují; poslední zelené CI Wave F: 607 jednotkových a 14 Chromium testů. NEMĚŇTE agenty Wave F.
- Akt I: `ashes_at_gate` → osm příběhových questů včetně `morrow_gravebound`, `crypt_descent`, `crypt_lord_fallen`, `vesnas_report`; dokončení `crypt_lord_fallen` je v `GameSimulation.defeatEnemy` vázáno na `crypt_lord`. V nové scéně se boss bude hráči představovat jako **The Hollow King**, ale integrátor zachová **runtime enemy type/id a původní quest event** dokud explicitně nemigruje kompatibilní data.
- `CharacterProgress` a `SaveRepository` = character-only v11, migrace v8/v9/v10; map/fact stav má **samostatný seed-scoped** `world:first-character` IndexedDB záznam. Žádný agent nesmí měnit perzistenci, quest odměny ani zapisovat world snapshot. Fast travel je až Prompt 36.
- Z Wave E/F zbývá: automatizovaný celý Akt I a boss bez snapshot fixture, interakce optional wilderness treasure/event POI, offscreen enemy/loot AI/Graphics resource budget a reálný performance profiling, main Pages release verifikace. **Wave G to nesmí nepozorovaně skrýt; integrátor je řeší v oddělených gate PR.**
- `WORLD_WIDTH=2200`, `WORLD_HEIGHT=1400`, `ACTOR_RADIUS=18`; herní navigace stojí na `canOccupy/findPath`, typed eventech a pevné simulaci 60 Hz. Neimportujte Phaser/Svelte/DOM do pure modulů.

## Samostatné write-sety — žádné kolize

| Agent | Prompt | JEDINÝ produkční soubor | JEDINÝ test | Zadání |
| --- | --- | --- | --- | --- |
| **31** | **26 — First Dungeon Theme / Corrupted Crypt** | `web/src/game/world/cryptTheme.ts` | `web/tests/unit/Agent31CryptTheme.test.ts` | [31/TASK.md](31/TASK.md) |
| **32** | **27 — Mini Boss Framework** | `web/src/game/enemies/miniBossRules.ts` | `web/tests/unit/Agent32MiniBossRules.test.ts` | [32/TASK.md](32/TASK.md) |
| **33** | **28 — Boss Framework / The Hollow King** | `web/src/game/bosses/hollowKingPhases.ts` | `web/tests/unit/Agent33HollowKingPhases.test.ts` | [33/TASK.md](33/TASK.md) |

Všech šest cílových souborů bylo při přípravě ověřeno jako **neexistující na výchozím main**. Před dispatch znovu ověřit, že nejsou přidány jiným PR. Agent 33 smí vytvořit adresář `bosses/` pouze prostřednictvím svého přiděleného souboru. **Žádný cross-import Agent31↔32↔33.** Veškeré shared API adaptéry patří výlučně integrátorovi.

## Agent 31 — Corrupted Crypt theme manifest

- Vstup: `Readonly<ProceduralDungeonResult>` z aktuálního generátoru, validace `validateProceduralDungeon`; výstup čistá deterministická **theme projection** se stabilními ID, per-room environment layers, tomb/urn/coffin/torch props, breakable containers, traps, treasure room, secret-room hooks, ambient sound cue IDs, undead encounter hints.
- Rozlišovat `entrance/corridor/combat/elite/event/treasure/trap/secret/boss` s jednotnou paletou/katalogem. Kvůli možnému chybějícímu art/audio assetu používat jen typované **asset/cue keys a volitelný grafický fallback**; neprohlašovat assety za skutečně dodané. Renderer/integration TODO jasně popsat.
- Gameplay props/traps/containers jsou **plány/hooky**, nikoli samovolné loot/health mutation. Breakable a one-shot eventy musí mít stabilní instance IDs, aby integrátor mohl použít autoritativní state. Prop footprint/radius/position validovat proti překážkám a routám; nic nesmí zablokovat vchod, boss guard ani exit. Volitelné secret room nesmí být povinná pro dokončení.
- Determinismus, bounded počty, ochrana proti záměně seed, invalid-input fail-closed, stejné API pro procedural fallback.

## Agent 32 — reusable miniboss framework

- Typovaný catalog čtyř exemplářů: **Bandit Captain, Graveyard Warden (Morrow), Brood Mother, Corrupted Knight**; unikátní stable IDs a `nameKey`, vysoké ale rozumné HP, distinct attack patterns/ability rotations, boss telegraph/intro/arena hooks a minimálně jedna změna chování podle HP.
- Čistý `createMiniBossState / stepMiniBoss / planMiniBossDeath` (nebo ekvivalent). Posílat event/action *plán*, ne modifikovat hru. Ověřit event IDs, boundaries, immunity/cooldown/damage budget, jeden death/guaranteed reward **proposal** při přechodu alive→dead, idempotentní replay. Quest hook konkrétního bossa (Morrow již vlastní `morrow_gravebound` a `act1.grave_warden`).
- Nesmí měnit `ENEMY_DEFINITIONS`, `EnemyType`, `GameSimulation`, `lootTables`, quest registry ani i18n. Integrátor teprve spawnne bossy a napojí reward/quest.

## Agent 33 — Hollow King three-phase boss machine

- Reusable pure, deterministic boss planner s `idle/telegraph/execute/recovery/dead` a **nejméně 3 mechanicky odlišnými fázemi** na explicitních HP thresholds, nikdy regrese fáze, žádný duplicate death/reward event.
- P1 rytmický telegraphovaný melee sweep, P2 summon/arena-control, P3 hazard + rychlé ability rotation (konkrétní balance zodpovídá agent). Zvlášť modelovat telegraph duration, target/area geometries, bounded active hazards/adds, reset/cancel, damage windows. Input musí být validované serializovatelné TS struktury, step s bounded dt, bez `Date.now/Math.random`.
- Output **typed actions** pro simulaci a `boss health/phase/warning` read-only projection pro Phaser/Svelte, death hook mapovaný integrátorem na **stávající `crypt_lord` / `crypt_lord_fallen`**, guaranteed loot *plan* bez přímé odměny. Žádné duplikování dosavadních `bossGuaranteedLoot` pro nekonečné gold/XP.
- Agent nezasahuje do `cryptTheme`, `miniBossRules`, `types.ts` ani `GameSimulation`.

## Dispatch / RED → GREEN → draft PR

1. Integrátor sloučí **jen tuto plánovací větev** po jejím GREEN CI do `main`. Až pak načte `git rev-parse main` a určí **společný 40-char BASE_SHA**. Historický `5db5179...` je pouze plánovací základ, nikoli automaticky dispatch SHA.
2. Každý agent si přečte `AGENTS.md`, `README.md`, `WAVE_G.md`, `INTEGRATION_G.md`, `WORKFLOW_CACHE.md`, vlastní `TASK.md`, originální prompt a existující API. `bash scripts/agent-bootstrap.sh agent/NN-prompt-XX <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-NN`.
3. Test-first RED → GREEN; `bash scripts/verify.sh targeted tests/unit/AgentNN*.test.ts`; potom `bash scripts/verify.sh agent` (Svelte/TS check, kompletní unit, build). Přesný 2-file diff proti BASE_SHA, žádné další změny/dependencies, otevřít **draft PR**, zapsat CI SHA, test matrix, exportované typy, handoff a známá omezení. **Nikdy neprovádět merge**.
4. Integrátor kontroluje HEAD CI všech tří, postupně merge **31 → 32 → 33**, pak samostatnými runtime PR zapojí environment/traps/props; miniboss state+quest; Hollow King fight/UI/death/loot. Každé integrační PR musí projít `bash scripts/verify.sh full` / GitHub CI before merge.
5. Nelze označit Prompt 26–28 za plně hotový pouze po merge izolovaných pravidel. Důkaz musí zahrnovat skutečný no-debug browser duel, originální art/atmosféru nebo poctivě označené placeholdery, zaručenou cestu/exit, jednorázové odměny, CS/EN a save reload. Viz [INTEGRATION_G.md](INTEGRATION_G.md).

**STOP:** nevalidní seed, neprochozí dungeon, ztracené `ashes_at_gate` / Act I questy, duplicitní boss death/reward, přílišný number of add actors bez kontrol, skryté POI odhalení, změna character-only save v11, vypnuté testy nebo fast travel před Promptem 36.


## Skutečný integrační výsledek — 20. 11. 2026

Všichni tři agenti implementovali přesně své **2 povolené soubory** na společném `BASE_SHA ed91d615c4e84d33c78832ceeb251d6e8434c605`, RED→GREEN TDD a GREEN HEAD CI, integrátor je sloučil 31→32→33:

- **Agent 31** [PR #56](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/56): Corrupted Crypt manifest `cryptTheme.ts` a testy.
- **Agent 32** [PR #57](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/57): 4 reusable minibossové, pure ability/state/reward plans.
- **Agent 33** [PR #58](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/58): Hollow King machine, tři odlišné fáze, warning/hazard/summon/death plans.

Integrátor pak postupně otevřel, otestoval a sloučil samostatné runtime PR:

| PR | Funkční připojení | Testování |
| --- | --- | --- |
| [#59](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/59) | `dungeonRuntime` + `FrontierScene`: seeded Corrupted Crypt renderer, urny, náhrobky, dekorace, místnosti, osvětlení, značky pastí, fallback Phaser Graphics | GREEN HEAD CI |
| [#60](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/60) | Herní `interactCrypt`, klikatelné kontejnery, jednorázový gold, telegraph→damage pasti, seed-scoped `cryptUsedPropIds/cryptTriggeredTrapIds` a validace persistence | GREEN HEAD CI |
| [#61](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/61) | Čtyři minibossové: Morrow + Bandit Captain, Brood Mother, Corrupted Knight; skutečné schopnosti, varování, omezené spawny, fase, jednorázové odměny, CS/EN | GREEN HEAD CI po opravě ochrany CAMP a TS union |
| [#62](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/62) | Seedově korektní Hollow King boss-room arena adapter pro původní `crypt_lord-4` | GREEN HEAD CI |
| [#63](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/63) | Reálná třífázová simulace Hollow Kinga, telegrafované damage windows, bounded skeleton adds, shadow hazards, HP/phase/warning HUD, CS/EN; původní `crypt_lord_slain`/Act I quest a loot bez zdvojení | GREEN HEAD CI [run 44787241680](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44787241680), merge `ab8aa0ca345ab71fa2aafd02885cfc207daaee88` |

Poslední runtime HEAD `407adea00fb69b86a420e88797b5f1bf64571b0c`: **72/72 Vitest test files a 696/696 unit tests**, **14/14 Chromium Playwright**, `svelte-check` **0 errors / 0 warnings**, produkční build a legacy HTML reference **PASS**. Test fáze 3 původně mylně očekával prázdný warning, přestože čistý plánovač správně vydal nové phase-3 warning po zrušení starého; upraven pouze tento chybný test, následná plná CI zelená.

**Acceptance otevřená:** Neexistuje prokázaný kompletní bezdebugový browser průchod od vytvoření postavy přes celý Akt I, skutečné poražení všech tří Hollow King fází a návrat k Vesně. Tematické bespoke atlas/ambient audio assety ještě nejsou dodané (Phaser fallback), kompletní secret-room aktivace/poklady do inventáře nejsou plně ověřené, vyvážení mini-boss fight všech tříd vyžaduje herní test. Wave E/F dluh: optional wilderness treasure/event, offscreen AI/loot stream resource profiling, nezávislá verifikace Pages deployment konkrétního main SHA. **Status = CORE INTEGRATED, nikoli 100 % COMPLETE**; waypoint fast travel patří až Prompt 36. Další číselný Prompt 29 = Death and Respawn.
