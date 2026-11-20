# Agent 28 — Wave F / Prompt 23: World Chunking and Streaming

**PŘIDĚLENÁ ROLE: Agent 28.** Tento soubor je závazný implementační úkol. Žádné změny do `main`; výsledkem je **draft PR**. Zdroj původního zadání: `2d_arpg_implementation_prompts.md`, sekce **PROMPT 23 — World Chunking and Streaming**.

## Přesné a jediné povolené soubory

- `web/src/game/world/chunkStreaming.ts` — **nový** modul čisté deterministické chunk logiky.
- `web/tests/unit/Agent28ChunkStreaming.test.ts` — **nový** TDD test.

**NESMÍŠ** měnit ani založit žádný další soubor. Zvláště `GameSimulation.ts`, `FrontierScene.ts`, `App.svelte`, `core/types.ts`, `SaveRepository.ts`, `generator.ts`, `navigation.ts`, `wildernessRuntime.ts`, `wildernessTerrain.ts`, `wildernessFeatures.ts`, i18n, docs, assets, CI a závislosti jsou integrátor-only. **Žádné importy ze souborů budoucích Agentů 29/30**.

## Základ a vstupy

Přečti celé `AGENTS.md`, `docs/plan/agents/README.md`, `WAVE_F.md`, `INTEGRATION_F.md`, [WORKFLOW_CACHE.md](../WORKFLOW_CACHE.md) a původní Prompt 23, včetně stávajících implementací:
- `web/src/game/world/wildernessRuntime.ts`: `buildWilderness` / `WildernessRuntimeWorld`
- `web/src/game/world/wildernessTerrain.ts`: `WildernessTerrainResult`, `TerrainTile`, `TerrainRoad`
- `web/src/game/world/wildernessFeatures.ts`: `WildernessFeature`, stabilní landmark/POI IDs
- `web/src/game/world/generator.ts`: `WorldLayout`, `CAMP`, `CRYPT_GATE`
- `web/src/game/world/navigation.ts`: `WORLD_WIDTH=2200`, `WORLD_HEIGHT=1400`, `Obstacle`
- Současný `GameSimulation` a `FrontierScene` pouze **čti**, ať handoff odpovídá runtime.

Pracuj z **jednoho společného 40znakového BASE_SHA** určeného integrátorem až po merge plánovacího PR. V čistém lokálním root checkoutu (po fetch BASE_SHA):
```bash
bash scripts/agent-bootstrap.sh agent/28-prompt-23 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-28
cd ../worktrees/agent-28
```

## Co dodat v jediném produkčním modulu

1. **Stabilní chunk geometrie a identity**:
   - `CHUNK_SIZE=400` (případně jiná explicitně zdůvodněná konfigurovatelná velikost bez ztráty kompatibility s 80px tile size).
   - `ChunkCoord` / `ChunkId` / `ChunkBounds`: jedinečná `wilderness/<cx>/<cy>` identita nezávislá na pořadí výpočtu, jazyce, Phaser objektu a session frame.
   - Hrany polouzavřené `[min,max)`. Bod přesně na vnitřní hranici náleží **následujícímu** chunku; `x=2200` / `y=1400` je out-of-bounds. Okrajové chunky mají menší rozměr.
   - `chunkSeed(worldSeed, chunkId)` z validovaného uint32 se seed domain separation. Stejné vstupy dávají přesně stejný výsledek, bez `Math.random`/času.
2. **Read-only prostorový index nad existujícím světem**:
   - Doporučené API `createChunkIndex(world: Readonly<WildernessRuntimeWorld>)` + `validateChunkIndex(...)`. Přijmi jen validní seed/terrain/layout/features (bez mutace).
   - Návratový manifest obsahuje bounded jednotlivé `terrain tiles`, `road segments`, `obstacles`, `encounter positions`, `feature IDs` pro konkrétní chunk; pokud polygon/obstacle/road protíná více chunků, označ ho ve všech skutečně průnikových chunkech bez duplikace v témž chunku. **Neprováděj clip fyzické kolize**, zachovej původní world souřadnice.
   - Camp, NPC, crypt gate a story landmarky musí zůstat snadno dohledatelné; nepřenášej jejich owner-identity do chunk ID. Nepředpokládej prázdný svět nebo pevný počet obecných optional POI.
3. **Deterministický streaming delta plán**:
   - Doporučené API `planVisibleChunks(index, playerPosition, activeIds, options)`, vrací seřazené `load[]` a `unload[]` a očekávané `nextActive`, **bez side effectů**.
   - Blízké chunky načíst, vzdálené uvolnit. Load/unload hystereze, budget per update, stabilní tie-break (distance, cx, cy), nikdy unload chunku hráče, žádné duplikáty ani opakované vytváření loaded chunku.
   - Obsluhuj invalid/pending input: negative, decimal, `NaN/Infinity`, mimo mapu, duplicitní/stale active IDs, nedostatečný budget, hranice světa, reset/zónový přechod. Vždy explicitní failure / bezpečně validovaný výsledek, nikdy nekonečná smyčka.
4. **Idempotentní world facts**:
   - Doporučené `WorldFact` typy: `chestOpened`, `eventCompleted`, `uniqueEnemyDefeated`, `landmarkDiscovered`, `waypointActivated`; namespace `worldInstanceId` + stabilní `chunkId` / `entityId`, volitelně stable Act I feature ID.
   - Funkce `applyWorldFact(state, fact)` vrací immutable další stav / changed boolean; replay stejné occurrence/fact ID nemá žádný další efekt. Validuj délky řetězců, duplikáty, forged IDs, velikost ledgeru. **Bez udělování loot/gold/XP**.
   - State přežívá simulované uvolnění a znovunačtení chunku ve stejné session. **Nedělej IndexedDB/character save v11**, nepředstírej, že seed-scoped chest přežije jiné fresh-seed sezení. Trvalá politika patří integrátorovi.
5. **Validace a bezpečný export**: typově jasné immutable struktury a čisté funkce, žádné importy Phaser/Svelte/DOM/new agent files. Připravenost pro runtime integrátora, který vyrobí skutečné Graphics/AI podle aktivních chunků.

## TDD přejímka (minimálně)

- Seed matrix `0,1,2,42,0xffffffff`: determinismus, různá seeded content seed, konzistence indexu, serializace.
- Geometrie `2200×1400`, `400` hranice, `2199.9/1399.9`, `2200`, negativní, necelé/numericky vadné vstupy. Žádné tile gaps/overlaps, každý tile patří přesně do chunku podle definované politiky.
- Road/obstacle přes 2+ chunky a cross-boundary POI vyhledání; žádná ztráta camp, crypt nebo mandatory features. Při indexaci žádná mutace existujícího `buildWilderness` výsledku.
- Load/unload plán, přechod přes hranu, hystereze a bounded budget, stable pořadí, žádný unload current cell, opakovaný volací cyklus.
- Otevřená truhla/událost/unikátní enemy/discovery/aktivace waypointu = přesně jeden změnový zápis, replay idempotentní, unload/reload state zachován, namespace izolace.
- Invalid seed, layout, ID, repeated IDs, corrupted ledger, oversized vstupy fail safely. Nic se nesmí autorizovat v čisté knihovně.

## Postup a handoff

1. Napřed commit **RED** selhávajících testů výše. Pak implementuj minimální **GREEN**, doplň regresní hrany, refactor, otestuj. Commity jen dvou povolených souborů.
2. Spusť:
```bash
bash scripts/verify.sh targeted tests/unit/Agent28ChunkStreaming.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
```
3. Otevři **draft PR**, target `main`, title `Agent 28 — Wave F / Prompt 23 — Chunk Streaming`. V popisu uveď `BASE_SHA`, exact two-file diff, exported API a typy, TDD RED→GREEN, testy a CI, chování invalid input, omezení, runtime handoff.
4. **Nikdy nemerguj ani nedeployuj**; pokud potřebuješ shared interface nebo perzistenci, napiš explicitně požadavek do PR, neměň cizí soubor.

## Prompt připravený ke zkopírování

> Jsi Agent 28 projektu Aether & Ruin, Wave F, Prompt 23 (World Chunking and Streaming). Přečti `docs/plan/agents/28/TASK.md`, `WAVE_F.md`, `INTEGRATION_F.md`, `AGENTS.md`, původní Prompt 23 a relevantní zdrojové soubory. Ze společného BASE_SHA integrátora založ `agent/28-prompt-23` a izolovaný worktree. RED→GREEN TDD vytvoř deterministický prostorový chunk index, stable IDs/seed, bezpečný budgetovaný load/unload plán s hysterezí a validovaný idempotentní ledger změn světa, který přežije unload/reload chunku. Měň výhradně `web/src/game/world/chunkStreaming.ts` a `web/tests/unit/Agent28ChunkStreaming.test.ts`. Žádný Phaser/runtime/save/nové moduly ostatních agentů, žádné rychlé cestování. Spusť targeted a agent testy. Otevři pouze draft PR s dvousouborovým diffem a integračním handoffem, nikdy nemerguj do main.
