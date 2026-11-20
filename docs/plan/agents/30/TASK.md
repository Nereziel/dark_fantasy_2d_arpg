# Agent 30 — Wave F / Prompt 25: Procedural Dungeon Generator

**PŘIDĚLENÁ ROLE: Agent 30.** Pure data/API a TDD bez připojení ke hře. Originální zadání: `2d_arpg_implementation_prompts.md`, **PROMPT 25 — Procedural Dungeon Generator**. `generateCrypt` zůstává zachovaný, dokud integrátor bezpečně nenapojí nový generátor.

## Jediné dva soubory, které smíš vytvořit či měnit

- `web/src/game/world/proceduralDungeon.ts`
- `web/tests/unit/Agent30ProceduralDungeon.test.ts`

Žádné změny v `GameSimulation.ts`, `FrontierScene.ts`, `generator.ts`, `core/types.ts`, `SaveRepository.ts`, `navigation.ts`, `App.svelte`, `world/wilderness*.ts`, i18n, docs, assets, dependencies či testech jiných agentů. **Neimportuj nové Agent28 `chunkStreaming.ts` ani Agent29 `mapDiscovery.ts`.**

## Před začátkem

Přečti `AGENTS.md`, [README agentů](../README.md), [WAVE_F.md](../WAVE_F.md), [INTEGRATION_F.md](../INTEGRATION_F.md), [WORKFLOW_CACHE.md](../WORKFLOW_CACHE.md), původní Prompt 25 a existující moduly:
- `web/src/game/world/generator.ts`: `WorldLayout`, `generateCrypt`, `CRYPT_EXIT={x:310,y:705}`, `CRYPT_GATE={x:689,y:397}`, `CRYPT_BOSS_POSITIONS`.
- `web/src/game/world/navigation.ts`: `WORLD_WIDTH=2200`, `WORLD_HEIGHT=1400`, `ACTOR_RADIUS`, `Obstacle`, `canOccupy`, `findPath`.
- `web/src/game/enemies/enemies.ts` / `GameSimulation.ts`: krypta má guard pack → boss pack, `crypt_lord` a save/quest kontrakty; pouze čti.
- `web/tests/unit/Dungeon.test.ts` a Wave E quest tests. Žádné skryté rozbití existujícího boss encounteru.

Převezmi jeden společný **40-char BASE_SHA** určený integrátorem po merge plánovacího PR; nezačínej proti historickému main.

```bash
bash scripts/agent-bootstrap.sh agent/30-prompt-25 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-30
cd ../worktrees/agent-30
```

## Implementace čistého datového generátoru

1. **Seedovaný dungeon room/door graf**:
   - `DungeonSeed` strict uint32 0..0xffffffff (žádné tiché `>>>0` u neplatných vstupů), deterministická lokální PRNG, bez `Math.random/Date.now`. Stabilní `roomId`, `doorId`, `tileId` pro seed.
   - Typované místnosti požadované Promptem 25: **entrance, corridor, combat, elite, event, treasure, trap, secret, boss**. Každá má geometrické hranice a definované místo vstupu/výstupu a případné props/encounter/loot hook IDs. Na validních seedech musí být naplněn základní set (entrance, corridor, combat, elite, event, treasure, trap, boss); secret je volitelná, nesmí zablokovat povinné cíle. Nerecyklovat IDs odlišných objektů.
   - Dveře explicitně spojují existující sousední místnosti v obou směrech, každé spojení má fyzicky dosažitelné portály; žádné osamocené povinné místnosti, průnik uzavřených stěn a magické teleporty mezi geometricky nespojenými místnostmi.
2. **Jednotná geometrie pro AI/pathfinding/render**:
   - Návrh výstupu `ProceduralDungeonResult`: `seed`, `rooms`, `doors`, `tiles`, `obstacles`, `playerSpawn`, `exitPosition`, `encounterSpawns`, `bossSpawn`, `validation` + volitelný `WorldLayout` adapter field. Vše serializovatelné plain TS data.
   - Rozumná konzistence se stávajícím `CRYPT_EXIT` a `CRYPT_BOSS_POSITIONS`, případné nutné posuny jen v dokumentovaném plánu pro integrátora. Nech `CRYPT_GATE` na světové straně beze změny.
   - Všechny povinné cesty entrance→mandatory rooms→boss→exit validuj **BFS přes room/door graf i reálným `canOccupy/findPath`** nad finálními kolizními stěnami pro `ACTOR_RADIUS`. Zajišťuj průchozí zádveří, střed chodby i dostatečný clearance pro hráče/bosse/guardy.
   - Hráč ani enemy spawn nesmí být uvnitř zdi, za zamčenou nepřístupnou secret room, mimo bounds nebo v sobě navzájem. Rozvrhni safe first step a finální boss arénu.
3. **Seed variace a failure policy**:
   - Stejný seed → byte-for-byte stejná struktura, různé seedy → průkazně různá uspořádání/tiles/room props. Varianta nemůže být jen jiná dekorativní barva.
   - Generování musí být bounded (jasný `MAX_ATTEMPTS`, `MAX_ROOMS`, `MAX_TILE_COUNT`), bez unbounded DFS, seed collision resampling, skryté rekurze ani nested map gigantismu. Řízený `{ok:false,error}` nebo dokumentovaný `RangeError` pro malformed input a explicitní deterministický bezpečný fallback **jen pro platný seed**.
   - Každý fallback musí sám projít stejnou validací jako normální výsledek, musí mít dosažitelného bossa/východ/encounter, a nesmí přijít s chybějícími IDs. Pokud fallback nedává garantované cesty, vrať failure; nepropouštěj broken dungeon jako success.
4. **Nezasahuj do runtime**: nevytvářej Phaser tilemap, AI, spawny ani chest reward v tomto modulu. Existující `generateCrypt` a `crypt_lord` zůstanou beze změn. Předej integrátorovi konkrétní mapování výstupních dat na `WorldLayout`, grafiku a interakce.

## Přejímací TDD testy (povinné)

- Seedy `0,1,2,42,0xffffffff` + desítky dalších deterministických seedů: stejný seed identicky opakovaně, různé seed varianty, kontrola validátorem.
- Zadaný set typů místností, jedinečné room/door/feature IDs, obousměrně korektní adjacency, neprotínající neprůchodné geometrie, `secret` není podmínkou hlavního průchodu.
- Grafová dosažitelnost entrance/exit/boss a všech mandatory event/combat/treasure/trap room; fyzická průchodnost z player spawn k bossovi, exit a encounter spawnům reálným `findPath` / `canOccupy` se stejnými obstacles.
- Seed fallback a bounded attempts. Vyzkoušet validní seed a záměrně nedostatek prostoru/překážkové konfigurace — **žádné softlocky ani nekonečné výpočty**.
- `-1, NaN, Infinity, 1.5, 0x100000000`, extrémní bounds, frakční dims, duplicate room IDs, missing door target, blocked boss, unreachable exit, secret-only path, overlapping walls, invalid spawn. Vše fails closed, nevykreslitelné ani necommitnuté jako validní.
- Input immutability, JSON round-trip, žádný browser/global mutable state, žádné vzájemné importy, žádné změny stávající krypty/Act I eventů.
- Handoff: záznam `WorldLayout` kompatibility, případné nové fields pro integrátora, potřebný crypt painter adapter a quest/boss spawn integration.

## TDD + draft PR

1. RED testy a commit, GREEN kód a commit. Nepřepisuj staré testy ani engine, aby prošly.
2. Proveď:

```bash
bash scripts/verify.sh targeted tests/unit/Agent30ProceduralDungeon.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
```

3. Otevři jen **draft PR** do `main`: `Agent 30 — Wave F / Prompt 25 — Procedural Dungeon`. V popisu BASE_SHA, přesný seznam dvou změněných souborů, výsledky RED/GREEN, check/full unit/build, CI pro HEAD, exported contract, fallback a integrační handoff.
4. **Nikdy nemerguj do `main`**, nedeployuj, neimportuj rozpracované moduly Agentů 28/29. Chybějící společné API = zdokumentuj blocker integrátorovi.

## Prompt připravený ke zkopírování

> Jsi Agent 30 projektu Aether & Ruin, Wave F, Prompt 25 — Procedural Dungeon Generator. Přečti celé `docs/plan/agents/30/TASK.md`, `WAVE_F.md`, `INTEGRATION_F.md`, `AGENTS.md` a původní Prompt 25. Ze společného BASE_SHA založ `agent/30-prompt-25` v izolovaném worktree. RED→GREEN TDD implementuj deterministický room/door/tile dungeon generátor s entrance, corridor, combat, elite, event, treasure, trap, secret a boss lokacemi; zaruč přístup k bossovi, východu, encounterům a bezpečný spawn grafovou i fyzickou validací, stabilní ID, bounded retries a validovaný fallback. Měň jen `web/src/game/world/proceduralDungeon.ts` a `web/tests/unit/Agent30ProceduralDungeon.test.ts`. Nezasahuj do `generateCrypt`, GameSimulation, Phaseru, UI, save, ani modulů Agentů 28/29. Proveď targeted a agent testy, otevři pouze draft PR s přesným dvousouborovým diffem a handoffem. Nikdy nemerguj.
