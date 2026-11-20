# Wave E — Akt I a procedurální divočina (Prompty 21–22)

**Stav:** PLÁN, agenti dosud nespouštěni; izolované moduly neznamenají dokončené Prompty 21/22. **Maximálně 3 souběžní agenti: 25, 26, 27.**

**Výchozí stav:** Wave D runtime je dokončena (PR #30–#38), hra používá character-only save v10 s migrací v8/v9, funkční město / ekonomiku / quest engine. [Původní Prompty 21 a 22](../../../2d_arpg_implementation_prompts.md) určují výslednou funkčnost. **Waypoint fast travel patří výlučně Promptu 36** — v této vlně se nezapíná, neimplementuje ani netestuje jako hotová funkce.

## Matice přesných a vzájemně disjunktních write-setů

| Agent | Původní prompt | Produkční soubor (jen tento) | Test (jen tento) | Výstup |
| --- | --- | --- | --- | --- |
| [25](25/TASK.md) | **21 — Act I Quest Chain** | `web/src/game/quests/actIQuestChain.ts` | `web/tests/unit/Agent25ActIQuestChain.test.ts` | TypeScript katalog questů, narativní/událostní plán aktu I, vazby na stávající quest engine |
| [26](26/TASK.md) | **22 — Procedural Wilderness: Terrain** | `web/src/game/world/wildernessTerrain.ts` | `web/tests/unit/Agent26WildernessTerrain.test.ts` | Seeded layout, terrain/road vrstvy, kolize, konzistentní a validovaná průchodnost |
| [27](27/TASK.md) | **22 — Procedural Wilderness: Features** | `web/src/game/world/wildernessFeatures.ts` | `web/tests/unit/Agent27WildernessFeatures.test.ts` | Seeded POI/landmark/encounter/event/treasure manifest a validace umístění nad předaným layoutem |

**Všech šest cílových souborů k přípravě plánu v `main` neexistovalo; integrátor musí absenci znovu ověřit při dispatchi.** Ani dva agenti nesmějí zapisovat stejný soubor. Agent 27 neimportuje nový soubor agenta 26: pracuje pouze s veřejným `WorldLayout` ze současného `world/generator.ts` nebo s lokálním readonly strukturálním typem. Agent 25 neimportuje nové soubory 26/27. Žádné nové vzájemné závislosti mezi agentními moduly.

## Kontrakty pro bezpečnou pozdější integraci

- **25 / příběh:** používej `QuestCatalog`, `QuestDefinition`, `QuestLedger`, `validateQuestCatalog`, `createQuestLedger`, `acceptQuest`, `advanceObjective`, `turnInQuest` z existujícího `questDialogue.ts`. Navazuj na `STARTER_QUEST_CATALOG` z `starterQuestRegistry.ts`. **Nesmí se změnit `ashes_at_gate`, `warden_vesna`, 3 kills, 150 gold ani 100 XP.** Vícekroková linie je deterministický řetězec prerequisit, event kinds a jednoznačných occurrence IDs; přenos dialogu a reward execution do runtime provede integrátor. Všechny nové uživatelské texty v agentním katalogu zastupují stabilní `*.title / *.description / *.objective / dialogue.*` klíče. Skutečné CZ/EN překlady přidá integrátor v jedné změně s jejich zobrazením; do hry nesmí uniknout raw key.
- **26 / krajina:** navazuj na `WorldLayout`, `CAMP`, `CAMP_RADIUS`, `WORLD_WIDTH/HEIGHT`, `ACTOR_RADIUS`, `canOccupy`, `findPath`, `OBSTACLES` z existujícího `generator.ts` / `navigation.ts`. Nový generátor vrací kompatibilní layout + volitelnou strukturovanou renderovací vrstvu (tile/terrain/road IDs). Seed musí být explicitně validovaný a normalizovaný; nezávislý na jazyku, `Math.random`, render snímcích či `Date.now`. Město, spawn, NPC, existující chest/shrine a dosažitelnost portálu `CRYPT_GATE` zůstávají. Neimplementovat nový chunk engine (Prompt 23).
- **27 / landmarky:** dostává seed a **readonly hotový layout** jako vstup, vrací serializovatelný manifest s typovanými ID/kategoriemi pro invariantní story landmarky (korupce, opuštěný hřbitov, evidence, dungeon entry), seedované vedlejší POI/události/treasure, encounter/mini-boss zóny. Validuje bounds, radius, kolize, safe-zone, unikátní IDs, přístupnost od města a nutné oddělení spawnu NPC; při chybě vrací explicitní failure (bez nekonečného rerollu). **Nevytváří druhý autoritativní systém odměn ani monster AI.**
- **Integrátor:** vlastní pipeline `seed → terrain → walkability/obstacles → roads → POIs/landmarks → encounters/treasure/events → validation/retry → live runtime`. Po agentních merge se integrace provede v malých runtime PR, ne společnou agentní změnou. Příběhové eventy se vydávají pouze autoritativně po skutečném průzkumu/killu/dungeon entry/boss kill, nikoliv z kliknutého UI. Data pro quest markery a journal jsou read-only snapshoty, Svelte nic neautorizuje.
- **Save:** character-only v10 zůstává bez dotyku agentů. Nový perzistentní quest ledger bude vyžadovat integrátorem vlastněný version bump (v11 nebo další aktuální), **explicitní bezeztrátovou migraci v8/v9/v10**, validaci a testy; world seed, pozice, transient spawny, kills a world loot do save nepřidávat. Zachovat staré itemy, úschovnu i `ashes_at_gate` reward state.
- **Autorská práva:** vlastní zdroj/narativ pod GPL-3.0-only; žádné externí assety/neověřené licence ani nové závislosti.

## Dispečink / write gate

1. Integrační koordinátor nejprve dostane tuto dokumentaci na `main`, ověří aktuální zelenou CI, deployment předchozí hry a všech šest **neexistujících** cílových souborů.
2. Koordinátor stanoví jediný konkrétní **FULL_40_CHAR_BASE_SHA = HEAD main při dispatchi** (nikoli SHA uvedené v tomto plánovacím PR) a pošle ho všem třem agentům. Každý agent založí vlastní `agent/25-prompt-21`, `agent/26-prompt-22-terrain` nebo `agent/27-prompt-22-features` větev, izolovaný worktree a vlastní `node_modules`.
3. Respektovat [WORKFLOW_CACHE.md](WORKFLOW_CACHE.md): `bash scripts/agent-bootstrap.sh <branch> <BASE_SHA> ../worktrees/agent-NN`, `bash scripts/verify.sh targeted tests/unit/AgentNN....test.ts`, pak **`bash scripts/verify.sh agent`**; sdílet npm download cache, nesdílet `node_modules`. Přesný testový příkaz je ve vlastním TASK.
4. Každý nejprve prokáže RED test, pak GREEN implementaci; neplatné `NaN/Infinity`, záporné seed/bounds, duplicate IDs, kolize, nedosažitelné cíle a replay events explicitně testovat. Žádné `Math.random()` v deterministickém jádru.
5. **Žádné změny mimo dva vlastní soubory**: zejména ne `GameSimulation.ts`, `generator.ts`, `core/types.ts`, `starterQuestRegistry.ts`, `firstQuest.ts`, `App.svelte`, Phaser, i18n, save, docs, CI, `web/package.json` či lockfile. Potřeba jiného souboru = technický blokátor integrátorovi, nikoli neohlášený workaround.
6. Agent otevře **pouze draft PR do `main`**, uvede exact diff proti BASE_SHA, API/handoff, RED→GREEN, `targeted`/`agent`/CI PASS/FAIL/NOT RUN; **nikdy neslučuje ani nedeployuje**.
7. Integrátor sloučí malé čisté agentní PR v pořadí **25 → 26 → 27**, vždy po zelené PR CI a review. Samostatný agentní merge není důkaz dokončeného Promptu. Pak runtime gate **21 → 22**, přičemž pro Prompt 21 jsou možné dočasné fixed landmark fixtures a definitivní E2E quest průchod se znovu ověří s generovanou divočinou.

## Definition of Done

**Agent done** = přesně dvě cesty, ověřené pure API, nulové změny sdíleného runtime, RED→GREEN, check/test/build, draft PR s handoffem. **Prompt 21/22 done** = hráč reálně projde celou linií v prohlížeči bez debug commandů, včetně značek, podmínek a jednorázových odměn, s perzistencí quest stavu; u Prompta 22 je seedově deterministická a průchodná generovaná divočina, viditelné renderovací vrstvy, dosažitelné dungeon/town/quest landmarky. V obou jazycích + E2E + CI + Pages na finálním SHA. Do té doby status `planned/isolated/in integration`.

**Integrátorský runbook:** [INTEGRATION_E.md](INTEGRATION_E.md).