# INTEGRATION_G — Hlavní integrátor, Wave G (Prompty 26–28)

**Status: připravený integrační runbook, NIKOLI dokončená implementace.** Původní zadání: `2d_arpg_implementation_prompts.md` Prompty **26 Corrupted Crypt, 27 Mini Boss Framework, 28 The Hollow King**. Worksets a testy [WAVE_G.md](WAVE_G.md), [31](31/TASK.md), [32](32/TASK.md), [33](33/TASK.md).

## 0. Preconditions a baseline

- [ ] Aktuální `main` má sloučené runtime PR Wave F **#51 / #52 / #53** a dokumentační #54, `git status --porcelain` je prázdné. Poslední known core `main` je `5db5179fdb2e293471a2286d84778e9e5d104fee`, ale dispatch HEAD MUSÍ být nový SHA po merge právě tohoto plánovacího PR.
- [ ] Před aktivací agentů zkontroluj existenci všech 6 vyhrazených cest (neexistují), konflikt open PR, vyžadovaný `verify` check a skutečný stav Pages. Nezaměň zelené CI pull requestu za post-merge `main` deploy.
- [ ] Urči jediné `BASE_SHA=$(git rev-parse main)` (40 znaků) po plánovacím merge. Sdílej identický BASE_SHA agentům 31–33, každý vlastní branch/worktree; max. tři paralelní agenty. `scripts/agent-bootstrap.sh` + `WORKFLOW_CACHE.md`.
- [ ] Archivovat fakta o Wave F, nepředstírat její kompletní acceptance: offscreen AI/loot streaming/perf, reálné optional POI interakce, full no-debug Act I+crypt browser run. Tyto chybějící body navazují na aktuální obsah; obzvlášť boss duel bez debug je **blokující release gate G**, nikoli pouze budoucí poznámka.

## 1. Agentní code-review a merge (31 → 32 → 33)

Pro každý PR:
- [ ] `git diff --name-only BASE_SHA...agent/N` přesně 2 nové povolené soubory. Žádné runtime/save/UI/quest/tile-generic/locale/asset/dependency změny.
- [ ] Doložený RED→GREEN: `scripts/verify.sh targeted ...` + `scripts/verify.sh agent`; GitHub `verify` GREEN pro **přesný HEAD commit**, bez sloučení rozpracované cizí agentní větve.
- [ ] Static review: validace unknown/NaN/Infinity, bounded loops/max objects, deterministický seed/event ID, JSON-roundtrip, immutable ownership, žádné true authority přes presentation-only action plan, nonblocking routes, stable localization keys.
- [ ] Agent31: materiál pro `DungeonRoomType` a `DungeonFeature`, ne 2. dungeon generator; prop/trap collisions neporuší entrance→boss→exit; real hidden room hints.
- [ ] Agent32: 4 skutečně rozdílné miniboss definice, konkrétní `morrow_gravebound` quest alias, robustní state machine/telegraphs a jednorázový guaranteed reward proposal. Nevytváří nové EnemyType v agentním PR.
- [ ] Agent33: 3 fáze, bounded add/hazard state a windup/recovery, immutable death transition, event hook `crypt_lord_fallen` kompatibilní s existujícím Act I. Explicitní fallback a failure handling.
- [ ] Pokud kterákoli API signatura není kompatibilní, integrátor řeší vlastní adaptéry po agentních merge, nikoli nepovolené změny agentního diffu. Sequence merge 31 → 32 → 33, žádné hromadné cherry-picky a žádné tlačení do main bez HEAD CI.

## 2. Runtime PR-G1 — tematická krypta (Prompt 26)

**Integrační ownership:** `web/src/game/world/dungeonRuntime.ts`, `web/src/game/phaser/FrontierScene.ts`, `web/src/game/core/GameSimulation.ts`, `core/types.ts` podle nutnosti, existující/new gameplay tests; případný CSS/i18n/asset manifest pouze integrátor. Agent31 pure module nesmí obsahovat Phaser nebo herní side effects.

- [ ] Načíst `buildCryptWorld(seed).dungeon`; `createCryptTheme(dungeon)` nebo jiný výstup Agent31. Jedna canonical seed instance pro collision i visuals. Room tiles, tomb props, chests, breakables, traps a secret visuals z theme manifestu.
- [ ] Zajistit realistické vrstvy (podlaha, stěny, vysoké náhrobky, světla, atmosférický fog) a snímat grafiku s Phaser; nekreslit falešné neprochozí podlahy. U originálního pixel artu/audio respektovat GPL-3.0 + externí licence; pokud assety chybí, explicitně přiznat původní programatický fallback a nesplněný art gate.
- [ ] Z `GameSimulation` obsloužit **interact/destroy** eventy a cooldowny, trap trigger s damage/status přes autoritativní combat API, safe telegraph, anti-double-reward, one-shot `used IDs` jen v session; nepřidávat dungeon world snapshot do character save.
- [ ] Každý dungeon typ room/feature odlišný, secret room není blocking mandatory, encounter odpovídá undead roster; žádná náhodná magie při mountu Graphics. CS/EN pro room hint/props, prostorový debug a bez-UI smoke tests.
- [ ] Testy více seedů (0,1,2,42,0xffffffff + fuzz), fallback, path from CRYPT_EXIT to guard + boss + portal, exact-once chest/trap, session reset a graphics cleanup. Playwright vstup/výstup bez cheats.

## 3. Runtime PR-G2 — minibossové (Prompt 27)

**Integrační ownership:** `GameSimulation.ts`, `core/types.ts`, `FrontierScene.ts`, UI lokalizace, relevantní quest/world feature mappings, integrační unit+Playwright testy. Agent32 nesmí editovat žádné z těchto souborů.

- [ ] Připojit Agent32 minimachine na ticky **jen** pro aktivní unikátní minibosse; jejich spawn z validních world feature / encounter zón, nikoli nově každý render, případně kompozice se stávajícím `EnemyUnit` a unikátní ID. `morrow_gravebound` musí zůstat kompatibilní s uloženými questy i s Agent28 `uniqueEnemyDefeated` world fact.
- [ ] Bandit Captain, Graveyard Warden, Brood Mother, Corrupted Knight mají distinct ability + telegraph + arena/intro, vyšší HP, bounded summons a mechanické rozdíly. Udržet AI pathing/collision a telegraph čitelný v Phaseru.
- [ ] Reward vždy prokazatelně přes existující `rollLootTable/bossGuaranteedLoot` nebo integrátorské atomické plánování; odměna se udělí na authoritative death transition jednou. Stávající `defeatEnemy` gold/XP/drop a `questDialogue` reward plan nesmí být proveden duplicitně.
- [ ] Save/load a zone transfer: enemy state je transient; quest ledger zůstává persistent; unikátní boss nemůže respawnovat po vlastní porážce v rámci stejného world instance. Žádné neomezované adds ani token duplication.
- [ ] TDD: health phases, valid HP boundaries, duplicate death replay, recover from malformed snapshot, spectator/no-attack state, 4 encounter identities, locale keys, browser fight of Morrow bez fixture cheat.

## 4. Runtime PR-G3 — The Hollow King (Prompt 28)

**Integrační ownership:** `GameSimulation.ts`, `core/types.ts`, `FrontierScene.ts`, `App.svelte` / samostatný boss HUD, `lootTables.ts` jen pro skutečně potřebné reward plan napojení, `cs.json/en.json`, integrační testy. Nedělat před zeleným G1/G2.

- [ ] Nahradit pouze existující stage-1 `crypt_lord` **mechanikou + prezentací** Hollow King; zachovat Actor ID `crypt_lord-4`, EnemyType `crypt_lord`, starý `dungeonStage`, `crypt_lord_fallen` event a `vesnas_report` návaznost. Pokud je potřeba migrace, udělat ji výhradně integátorsky, s v8/v9/v10/v11 regresí.
- [ ] Pure Agent33 tick-phase machine přijímá aktuální HP/position/target/time a vrací validované action plans: 3 rozdílné fáze, přesný start/end telegraphu, AOE, bounded summon/hazard a death. Simulace provádí skutečný damage/path/cast a vlastní jedinou authoritative combat state.
- [ ] Phaser maluje warning kruhy/kužely s přiměřeným předstihem, transparentně rozlišené bezpečné zóny; Svelte zobrazuje boss HP a číslo fáze z typed state. Cues nezavádí fake nezablokovatelný damage. Intro/arena locks nikdy nezamknou portál nebo softlock do výstupu.
- [ ] Boss HP není extrémní; boss musí být dohratelný všemi aktuálně dostupnými třídami a mechanika (ne HP inflation) tvoří obtížnost. Guaranteed high-quality loot navázat na jedinou death event; po dokončení aktuálně existující `dungeonCleared` + Act I `crypt_lord_fallen` + Vesna report/Act II flag.
- [ ] Plný nedebugový Playwright smoke: start → `crypt_descent` → 3 guardian kills → stage1 boss → všechny 3 fáze → defeat/dungeonClear → návrat do town → `vesnas_report`; test bez `restore(...)` fixture a bez přímého nastavování HP/gold/status, schopný běžet stabilně v CI. Telemetry pro healing/escape/duration, CS/EN a seed matrix.

## 5. Global validation / release / remaining debt

- [ ] `bash scripts/verify.sh full` v izolovaném integračním worktree, (npm check + full unit + production build + Chromium + legacy site). V každém runtime PR striktní changed-file report, test výsledky, CI run URL. Merge jednotlivě až po GREEN.
- [ ] Post-merge main HEAD `verify` pro přesný runtime SHA, potom Pages deployment pro stejný SHA. GitHub PR `deploy` skipped je očekávané a nepředstavuje proof of deployed artifact. Na docs-only merge není redeploy nutný.
- [ ] Otestovat načítání legacy character v8/v9/v10 i current v11; seed-scoped world facts bez nevalidního rehydratu, mysticky odhalených POI nebo udělených dvou boss odměn.
- [ ] F debt trackovat odděleně: unmount offscreen enemy AI / loot / props, performance memory + frame histogram over world traversal; genuine optional world treasure and event interactions and včasná evidence do closeout. Pokud není splněno, Wave F zůstává CORE INTEGRATED, ne 100% DONE.
- [ ] Výsledky a merge SHA doplnit do `docs/IMPLEMENTATION_STATUS.md`, `WAVE_G.md` a tohoto souboru; až po skutečném runtime acceptance označit Prompty 26–28 jako COMPLETE.
- [ ] STOP při selhání `verify`, broken boss geometry, nedostupném exitu, nevysvětlené změně balance, duplicitních gold/XP/quest reward, regression `GameSimulation.restore`, save mismatch, hidden secret spoiler, temp entity leakage nebo chybějící kontrolní test na boss deaths.

### Handoff formulář každého agenta (v textu draft PR)

Uvést `BASE_SHA`, branch, přesně dva soubory, exported API+typy, deterministic seeds/edge matrix, RED→GREEN evidence, targeted+agent test výsledky, HEAD CI URL a přímé integrátorské volací instrukce; vždy popsat, co **NENÍ** napojeno a patří runtime PR. Nepoužívat dokumentační PR jako náhražku testované implementace.
