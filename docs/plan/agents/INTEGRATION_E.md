# Integrátor — Wave E, Prompty 21–22, agenti 25–27

**Účel:** dokončit reálný Act I příběh a seedovanou divočinu v prohlížeči v malých PR. Tato dokumentace je příprava, **nic zatím není implementováno ani sloučeno**. Vlastníci agenta a write-setů: [WAVE_E.md](WAVE_E.md).

## 0 — Před dispatchí

- [ ] `WAVE_E.md`, `INTEGRATION_E.md` a TASK 25/26/27 jsou na `main`; ověř `git status`, `git rev-parse HEAD`, green HEAD quality a poslední úspěšné Pages.
- [ ] Znovu ověř, že šest agentních cílových souborů z `WAVE_E.md` **neexistuje**. Ověř dostupnost `QuestCatalog` a `WorldLayout` na HEAD.
- [ ] Zapiš **FULL_40_CHAR_BASE_SHA** přesně z HEAD `main` (žádné stale SHA z předchozích vln či plánovacího PR). Identické SHA sděl agentům 25/26/27.
- [ ] Každý agent pracuje ve vlastní branch/worktree dle [WORKFLOW_CACHE.md](WORKFLOW_CACHE.md); nejvýše 3 souběžně. Globální úpravy má vyhrazen integrátor.

## 1 — Review a agentní merge

- [ ] **Agent 25, Prompt 21**: quest DAG včetně zachování `ashes_at_gate` / `warden_vesna`, jeden reward plan na turn-in, jasná story dramaturgie (korupce → bestie → hřbitov → mini-boss → důkazy → dungeon → boss → návrat), validní registry/ledger a testy historie / invalid input. Bez druhého quest authoritativního engine.
- [ ] **Agent 26, Prompt 22/terrain**: různý seed znamená relevantní rozdíl, stejný seed identické struktury; seed 0 a hraniční hodnoty; město, spawn, existující objekty/NPC, dungeon gate a encounter zóny jsou průchodné. Žádný nekonečný retry, žádná mutace cizích struktur.
- [ ] **Agent 27, Prompt 22/features**: obytné/příběhové landmarky a dungeon entry garantované, všechny body dosažitelné z města; volitelné POI/zóny/treasure/events seedované bez kolizí; validace nevalidního layoutu, bounded retry/failure; připravené event/marker IDs.
- [ ] U každého PR kontrola `git diff --name-only BASE_SHA...HEAD` = **přesně dva povolené soubory**; prověř auth/náhodu/licence/deps, importy pouze do existujících modulů, žádný agent-to-agent import.
- [ ] Ověřit RED→GREEN, `bash scripts/verify.sh agent`, zelený Actions `verify` pro **přesný PR HEAD**. Pokud není GREEN, nepoužívat stale cache úspěch.
- [ ] Merge **25 → 26 → 27**, mezi merge ověř green main / konflikty. Agenti nesmějí mergovat. Samostatné PR obsahují jen izolované knihovny.

## 2 — Runtime gate 21 (samostatné reviewable PR)

- [ ] Napoj novou Act I quest data definici na stávající `starterQuestRegistry.ts`, `questDialogue.ts` a jediný `GameSimulation.ts` ledger. **Nedublovat** `ashes_at_gate` ani quest reward executor. Starý quest si zachová identické ID, 3 kills a 150 gold / 100 XP.
- [ ] Implementuj konzistentní quest eventy s jednorázovými occurrence ID a bezpečnou vazbou na skutečné autoritativní akce: explore/corruption, beast kill, graveyard, named mini-boss, evidence pickup, dungeon enter, dungeon boss kill, report NPC. Použij stávající beast/boss/crypt mechaniky, přidej jen chybějící nutný obsah. Žádný reward z prostého Svelte UI kliknutí.
- [ ] Nový Svelte journal/quest tracker, značení cílů ve world mapě/Phaseru a NPC dialogue pracují pouze s read-only snapshots a commandy; aktivní quest, locked podmínky, přijmutí/turn-in, návrat do města. Všechny zobrazované **CS/EN lokalizační klíče** s live locale switch a žádné raw keys.
- [ ] Charakterový save: **explicitní nová verze** se serializovaným validním quest ledgerem + bezpečná migrace současného v10 a v8/v9, beze ztráty úschovny, vybavení, XP, gold či stavu starého questu. `world seed`, pozice, spawny, world enemy/snapshot, dočasné POI nesmí být součástí character-only save. Reward state přes save/reload nesmí vést k dvojí výplatě.
- [ ] End-to-end: new game → Vesna → přijmout → discover/kill/graveyard/mini-boss/evidence/dungeon/boss → return/claim → next step; E2E bez debug shortcuts, v obou jazycích, save/reload (aktivní, ready, completed), žádné duplikované odměny. Pokud některé body vyžadují generovaný terén, ponechat kritickou finalizaci tohoto E2E pro gate 22 a zatím status `partial`.
- [ ] Aktualizuj `docs/IMPLEMENTATION_STATUS.md` pravdivě. Výsledek `bash scripts/verify.sh full`, CI a Pages GREEN musí odpovídat přesnému HEAD.

## 3 — Runtime gate 22 (samostatné reviewable PR; případně dva malé PR)

- [ ] Připoj `wildernessTerrain` jako jediného autora výsledného `WorldLayout` pro `wilderness`; zachovej `generateCrypt`/crypt boss a zkontroluj staré odkazy, které dnes volají `generateWorld`.
- [ ] Připoj `wildernessFeatures` až **po** vygenerování a validaci layoutu. Pipeline má jasný seed, stabilní invariantní town/quest/dungeon landmark IDs, náhodné přípustné POI, encounter/event/treasure zóny a konečný počet retry. Při nevalidním seedu/layoutu **bezpečně fallbackni do ověřeného průchozího světa**; nepoužívej prázdnou nebo zabugovanou mapu jako úspěch.
- [ ] Phaser renderuje terrain/roads/forest/obstacles/POI vrstvy z TypeScript world dat; hit test, pathfinding, monster movement a pixel rendering musí vidět stejnou kolizní geometrii. Svelte dostává jen potřebné marker/snapshot eventy. Pozor na GH Pages base path.
- [ ] Prověř reachability pomocí existujících `canOccupy` a `findPath` od spawn/town do všech mandatory lokací včetně dungeon vstupu, quest markery, interact distances, safe zone a NPC klikání. Zahrnout seed matrix 0/1/2/42/large uint32, opakované generování, okrajové hodnoty a imutabilitu vstupů.
- [ ] Integrace event IDs pro Act I; `ashes_at_gate` kompatibilní a žádné nerovnoměrné respawny, ztracený progress či vyplacení odměny po reload. World je session-local a znovu se generuje; uložené quest eventy musí být stabilně validované, ale world snapshot se neukládá.
- [ ] End-to-end seed 0 i různý seed: město, cesta k vyšetřování/hřbitovu/crypt, boje, boss, návrat, questy, včetně překladů a uloženého stavu. Zkontrolovat konzolové chyby a výkon generování.
- [ ] `bash scripts/verify.sh full`, zelený Actions HEAD a Pages `main` pro runtime soubory; žádný deploy při čistě docs/test změně. Zaznamenej URL runů a přesné SHAs.

## 4 — Stop podmínky a handoff

**STOP** při save-loss v8/v9/v10, dvojím XP/gold, záměně NPC/quest IDs, nedosažitelném story cíli, cyklu/prerequisite deadlock, kolizi town, nestabilním seedu, ad-hoc `Math.random`, UI authority, rozbitém Pages subpath, fail v check/test/build/E2E nebo změně mimo exact write-set. Vrať blocker k příslušnému rozhraní; nezakrývej regresi vypnutím testu.

**Waypoint fast travel není součástí Wave E; Prompt 36 zůstává samostatný.** Po uzavření Wave E pokračuj v číselném pořadí Promptem 23 (world chunking), nikoli předběžnou implementací cestování.