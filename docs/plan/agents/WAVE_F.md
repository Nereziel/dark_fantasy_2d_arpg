# Wave F — Streaming světa, mapa a procedurální dungeon (Prompty 23–25)

**Stav: PŘIPRAVENO K DISPATCHI; implementace agentů ani runtime zatím nezačala.**
**Maximálně tři souběžní agenti 28–30, jeden společný BASE_SHA, vlastní worktree a pouze draft PR.**

Repozitář: [Nereziel/dark_fantasy_2d_arpg](https://github.com/Nereziel/dark_fantasy_2d_arpg). Původní zadání: [Prompt 23](../../../2d_arpg_implementation_prompts.md), **World Chunking and Streaming**; [Prompt 24](../../../2d_arpg_implementation_prompts.md), **Map, Minimap, and Fog of War**; [Prompt 25](../../../2d_arpg_implementation_prompts.md), **Procedural Dungeon Generator**. Integrační postup: [INTEGRATION_F.md](INTEGRATION_F.md).

## Výchozí technický stav a záměr

- Wave E má sloučené jádro: agentní PR #42/#41/#43, runtime #44/#45, dokumentační closeout #46. Majitel hry potvrdil manuální průchod Aktem I. Automatický kompletní no-debug E2E Act I a skutečné interakce volitelných pokladů/událostí zatím nebyly potvrzeny — **nenahrazovat jejich acceptance** plánem Wave F.
- Autoritativní současný pipeline je `buildWilderness(seed)` v `web/src/game/world/wildernessRuntime.ts` → `WildernessTerrainResult` / `WorldLayout` / `WildernessFeature[]`; `GameSimulation.ts` řídí pohyb, entity, questy; `FrontierScene.ts` kreslí svět. Svět má nyní `WORLD_WIDTH=2200`, `WORLD_HEIGHT=1400`. Dungeon dosud používá `generateCrypt(seed)`, `CRYPT_EXIT` a `CRYPT_BOSS_POSITIONS` v `generator.ts`.
- `CharacterProgress` a `SaveRepository.ts` používají **character-only save v11** s migracemi **v8/v9/v10**. Hra po načtení postavy spouští nové sezení se znovu generovaným světem. Agent nesmí změnit tento kontrakt ani skrytě zavést druhý trvalý snapshot. Postup mapy a dlouhodobé world facts připojí integrátor s výslovně navrženou politikou životnosti a testy.
- **Waypoint/fast travel patří Promptu 36**. V této vlně lze zobrazit známý bod na mapě nebo připravit jeho stabilní identitu; žádné cestování.

## Přesné nepřekrývající se write-sety

| Agent | Originální prompt | JEDINÝ produkční soubor | JEDINÝ testovací soubor | Handoff |
| --- | --- | --- | --- | --- |
| [28](28/TASK.md) | **23 — World Chunking and Streaming** | `web/src/game/world/chunkStreaming.ts` | `web/tests/unit/Agent28ChunkStreaming.test.ts` | Čistý prostorový index, deterministické chunk ID/seed, load/unload delta plán a idempotentní world-fact ledger |
| [29](29/TASK.md) | **24 — Map, Minimap, and Fog of War** | `web/src/game/world/mapDiscovery.ts` | `web/tests/unit/Agent29MapDiscovery.test.ts` | Čistý fog/exploration reducer a datové podklady pro mapu a minimapu, bez předčasného odhalení POI |
| [30](30/TASK.md) | **25 — Procedural Dungeon Generator** | `web/src/game/world/proceduralDungeon.ts` | `web/tests/unit/Agent30ProceduralDungeon.test.ts` | Deterministický modulární room/door graf, validace průchodnosti a bezpečný fallback |

**Všech šest uvedených cest bylo při přípravě plánu ověřeno jako neexistující v `main`.** Integrátor je musí znovu ověřit na dispatch-time HEAD. Žádný sdílený produkční či testovací soubor; žádné vzájemné importy z nových modulů Agentů 28/29/30. Povolené jsou pouze existující veřejné kontrakty na společném BASE_SHA.

## Kontrakty rozhraní

### Agent 28 — chunk streaming, bez nového world authority

- Doporučený `CHUNK_SIZE=400` světových jednotek pro současnou mřížku 2200 × 1400: rozměr chunku 400 × 400 kromě okrajových sloupců/řádků; absolutně stabilní klíče `wilderness/<cx>/<cy>`, správná polouzavřená hranice, žádné `undefined` ani duplikáty na mezích. API může být pojmenováno odlišně, pokud je plně typované a popsané v PR.
- Vstup jsou **readonly data existujícího `WildernessRuntimeWorld` / `WildernessTerrainResult` / `WorldLayout` / `WildernessFeature[]`**, nikoliv runtime objekty Phaseru. Výstup přehled `ChunkManifest` s globálními souřadnicemi a relevantními tile/road/obstacle/feature ID. Překážky a silnice protínající více chunků nesmějí být ztraceny ani přemístěny.
- Load/unload plán podle polohy hráče, okolí a hystereze, stabilní pořadí, maximální budget za update, bezpečnost při hranicích, přechodu zóny a opakovaném zavolání. Tvoř pouze **plán**, ne načítání herních objektů. Aktuální chunk hráče se nesmí uvolnit.
- `WorldFactLedger` či ekvivalent pro otevřenou truhlu, dokončenou událost, poraženého unikátního nepřítele, objevené místo a aktivovaný waypoint: ověřované identifikátory, **idempotentní immutable reducer**, oddělený world/session namespace a stabilní serializovatelný tvar. Agent nic neukládá do IndexedDB, nic nepřiznává jako odměnu. Historie přežije unload/reload v **jednom sezení**; dlouhodobé uložení rozhodne integrátor.

### Agent 29 — fog of war, bez znalosti nového chunk modulu

- Pracuj nad existujícími `WORLD_WIDTH/HEIGHT`, `Point`, `CAMP` a volitelně readonly `WildernessFeature`, `WildernessTerrainResult`, `ACT_I_MILESTONES`. **Neimportuj `chunkStreaming.ts`** ani jiné nové moduly.
- Stabilní fog cells/objevená místa (`MAP_CELL_SIZE=80` je vhodný návrh), odhalování po reálné pozici/postupném pohybu, validace mezí a neplatných hodnot, bez odkrytí celé divočiny při startu. Město je známý orientační bod, **ne celý okolní region automaticky prozkoumaný**.
- Projekce pro mapu a minimapu: vlastní pozice, viditelné objevené oblasti, známé město, objevený dungeon/landmark, quest marker bez prozrazení **neobjevených náhodných POI**, waypoint pouze ve stavu objeveno/aktivováno. Žádné ovládání cestování.
- Čistý `MapDiscoveryState` + `reveal` / `validate` / `project` tvar se stabilní serializací. Agent nerozhoduje o změnách character-save formátu. Integrátor spojí se snapshotem, UI, lokalizací a perzistencí.

### Agent 30 — modular dungeon generator, bez vazby na agenty 28/29

- Seedovaný plán propojených místností/chodeb/dveří a tile/geometry IDs. Typy: **entrance, corridor, combat, elite, event, treasure, trap, secret, boss**. Dveře a spojení jako explicitní graf, ne pouze vizuální blízkost.
- Stabilní room/door ID, validované bounds a nepřekrývající se neprůchodné oblasti, kontrola topologické **i geometrické** dostupnosti hlavní cesty včetně entrance, boss, exit a encounter spawnů. Secret room může být volitelná a je dosažitelná po své definované podmínce; nesmí blokovat mandatory trasu.
- Neplatné seed/layout parametry skončí explicitním řízeným failure, konečný počet retry a bezpečný ručně ověřitelný fallback; žádná nekonečná generace ani přepis stávající krypty.
- Data umožní integrátorovi vytvořit adaptér na existující `generateCrypt`, `CRYPT_EXIT`, encounter pack, boss souboj a Phaser mapu; **agent sám nepřipojuje runtime**, nepřepisuje crypt gate/boss, save ani stávající testy.

## Globální pravidla pro souběh

1. Po sloučení tohoto plánovacího PR do `main` integrátor znovu zkontroluje jeho aktuální HEAD a zaznamená **jedno 40znakové BASE_SHA pro všechny tři agenty**. SHA z plánovacího PR není automaticky dispatch SHA.
2. Agenti **nesmějí** měnit `GameSimulation.ts`, `core/types.ts`, `FrontierScene.ts`, `App.svelte`, `SaveRepository.ts`, `generator.ts`, `navigation.ts`, `wildernessTerrain.ts`, `wildernessFeatures.ts`, i18n, docs, package/lockfile, CI ani assety. Potřebné rozšíření kontraktů se zapíše do PR handoffu.
3. Každý agent používá pouze vlastní branch/worktree (doporučeno `agent/28-prompt-23`, `agent/29-prompt-24`, `agent/30-prompt-25`), `scripts/agent-bootstrap.sh` a cache pokyny z [WORKFLOW_CACHE.md](WORKFLOW_CACHE.md). Nesdílet `node_modules`, jen npm download cache.
4. **RED→GREEN TDD**: nejdříve cílené selhávající testy, potom implementace; `bash scripts/verify.sh targeted tests/unit/AgentNN...test.ts` → `bash scripts/verify.sh agent` (`npm run check`, všechny unit testy, build). CI je autoritativní pro přesný PR head; agent uvede PASS/FAIL/NOT RUN.
5. Všechny externí a nevalidní vstupy: `NaN`, `Infinity`, záporné/frakční/přetečené souřadnice/seed, forged/duplicate IDs, extrémní pole/počty a chybné grafy otestovat. Žádné `Math.random()` / `Date.now()` v čistém generátoru; seed uint32 `0..0xffffffff`, bez silent wrapping. Žádné importy webového DOM/Phaser/Svelte do čisté logiky.
6. Zachovat původní questy, `warden_vesna`, stálé město/spawn, dungeon gate, položky a ekonomiku; nové mapové funkce nesmějí odhalit neprozkoumané náhodné POI. Nové vlastní zdroje GPL-3.0-only, externí materiály pouze s ověřenou licencí.
7. Výstup každého agenta: **pouze draft PR do `main`**, diff přesně dva uvedené soubory, test report, konkrétní exportované API a integrační handoff. **Agent nikdy nemerguje, nedeployuje a neposouvá `main`.**

## Milníky a Definition of Done

**Agent done** = TDD čisté izolované API + dva soubory + typy, unit, build + draft PR. **Integrovaný Prompt 23** = skutečné načítání a uvolňování chunk resources (Phaser + simulace), hladký přechod hranic a korektní návrat bez respawnu unikátních událostí/pokladů. **Integrovaný Prompt 24** = funkční minimapa i velká mapa, fog, CS/EN, neprozrazování POI, discovery zachované podle dokumentované save politiky. **Integrovaný Prompt 25** = proměnlivá hratelná krypta s dostupným bossem a východem pro matrix seedů, fallback, kompatibilní Act I quest a E2E.

Plné přijetí vyžaduje `bash scripts/verify.sh full`, GREEN PR a finální `main` CI/Pages na přesném SHA. Samotný merge datových modulů **není** dokončení jednotlivých Promptů. Hranice Wave F: **bez Promptů 26–28, bez fast travel (Prompt 36)** a bez nových závislostí.

**Závazná přejímka a pořadí integrátora:** [INTEGRATION_F.md](INTEGRATION_F.md).
