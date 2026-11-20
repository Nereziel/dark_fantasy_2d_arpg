# Agent 24 — Prompt 20: Dialogové a questové jádro

**Vlna D | izolovaný doménový modul | stav: ZADÁNO, NESPŮŠTĚNO.** Branch `agent/24-prompt-20` od společného BASE_SHA a vlastní worktree.

## Přesný write-set (pouze tyto 2 nové soubory)

1. `web/src/game/quests/questDialogue.ts`
2. `web/tests/unit/Agent24QuestDialogue.test.ts`

Nepovoleny jsou jakékoli změny `quests/firstQuest.ts`, `world/npcs.ts`, `core/types.ts`, `GameSimulation.ts`, `NpcDialogue.svelte`, `QuestJournal.svelte`, save, lokalizace, dokumentace, CI, lockfile, ani modul jiného agenta. Chybějící API/potřeba třetího souboru => napiš integrátorovi blokátor, ne workaround.

## Východisko

- Originální Prompt 20: větvený dialog s volbami a podmínkami; NPC/quest stav, prerequisite, dobrovolné volby, quest ID/title/description/objectives/rewards, počítadla, completed/failed podle potřeby a kategorie `main/side/bounty/exploration/dungeon/boss/collection/investigation`.
- `quests/firstQuest.ts` má stabilní `FIRST_QUEST_ID = 'ashes_at_gate'`, `WARDEN_ID = 'warden_vesna'`, výchozí quest progress, required kills a jednorázové reward. `GameSimulation.ts` řeší accept/kills/turn-in. **Zachovej ID, dosavadní reward a valid save; žádný druhý autoritativní quest stav.**
- Svelte dialog a journal jsou nyní pro jediný quest; integrátor je v další fázi napojí na obecné API. Samotný module runtime nezmění.

## Dodávka

Implementuj čistý TypeScript typový kontrakt s exporty obdobnými:

- `QuestDefinition`: trvalé ID, `titleKey`, `descriptionKey`, `objectiveKey`, kategorie, prerequisite IDs, seznam objektivů s event ID/targetCount, reward (gold/XP), volitelná failure podmínka. Žádné texty CS/EN přímo; jen stabilní lokalizační klíče.
- `QuestRuntimeState` a `QuestCatalog` (může obsahovat více questů): `available | active | ready | completed | failed`, čítače, ověřené ID, rewardClaimed. Jasné oddělení **persistované character quest progress** a transient dialog/selection; žádné world coords nebo combat state v save návrhu.
- `DialogueNode`, `DialogueOption` a `DialogueCondition`: branching, viditelnost/dostupnost voleb, quest flags, NPC state, prerequisite/gating, odkaz na next node či typed action. Žádný libovolný JS callback v definicích.
- Čisté operace `validateQuestCatalog` (unique IDs, positive integer targets, DAG prerequisites, no cycles/unknown refs), `evaluateDialogue`, `acceptQuest`, `advanceObjective`, `turnInQuest`, případně `failQuest`. Vše serializovatelné, deterministické, bez mutace vstupů.
- Reward je jen **návrh jednorázového výdeje**; gold/XP přidává výhradně integrátor přes existující progression/economy. Opakované volby, duplicity eventů při opakování stavu a turn-in nesmějí vytisknout druhou odměnu.
- Typově podporuj existující první quest jako fixture bez přímého nahrazení `firstQuest.ts`; ukázkový katalog může být lokální test fixture. Připrav cestu pro akt I (Prompt 21), ale **neimplementuj jeho příběh**.
- Nevalidní objekt, neexistující ID, počet záporný, `NaN`/Infinity, obří čísla, neplatná volba a locked quest se odmítnou konzistentně. Ochrana proti prototype keys, neomezené velikosti/cyklům a double reward.

## TDD — acceptance testy

1. Zkušební dialog se 2+ větvemi, locked/hidden volbou a živým reevaluation s různým quest stavem; návrat přesných lokalizačních klíčů.
2. Prerekvizity, cyklus a neznámé ID, dvě kategorie questů; validní cesta `available → active → ready → completed`, `failed` jen když policy dovolí.
3. Objective counters pouze relevantní událostí, clamp target, ignorace neznámých/duplicate event IDs podle deterministické politiky; no double quest completion/reward při opakovaném turn-in.
4. Nestrannost na jazykové mutaci (IDs se nepřekládají), serializace character-only objektu, nemutování předaných struktur.
5. `ashes_at_gate` a `warden_vesna` zachovány jako kompatibilní fixtures; starý reward/třídní quest se **nesmějí změnit**; neplatné/okrajové číselné hodnoty a cykly.

## Pracovní postup / PR

Přečti `AGENTS.md`, `WAVE_D.md`, `INTEGRATION_D.md`, `2d_arpg_implementation_prompts.md` (Prompt 20) a existující Quest/UI/Save definice. Startuj výhradně ze společného BASE_SHA, ne z agenta 22/23. TDD: vlastní červené testy → implementace → zelené. V `web/` proveď `npm ci --no-audit --no-fund`, `npm run check`, `npm run test` a `npm run build`. `git diff --name-only BASE_SHA...HEAD` musí mít **přesně dva povolené soubory**. Draft PR s API, RED→GREEN, testy (PASS/FAIL/NOT RUN) a riziky migrace. **Neslučuj, nedělej runtime UI ani deploy.**

## Handoff integrátorovi

Integrátor připojí unified quest registry do `GameSimulation` a typed `GameCommand`/`GameSnapshot`, adaptuje první quest s nezměněným gold/XP a ID, změny perzistence provede jako explicitní migraci v9→nový formát, aktualizuje CS/EN katalozích a Svelte dialog/journal. Dokončení Promptu 20 potvrzuje až E2E offer→accept→progress→reward exactly once a save/reload, nikoli kompilace helperu.

## Prompt pro samostatného agenta

> Jsi **Agent 24 (Wave D, Prompt 20)** projektu `Nereziel/dark_fantasy_2d_arpg`. Přečti celé `docs/plan/agents/24/TASK.md`, `WAVE_D.md`, `INTEGRATION_D.md`, `AGENTS.md` a originální Prompt 20. Ze společného BASE_SHA zvol vlastní `agent/24-prompt-20` branch a izolovaný worktree. Pomocí RED→GREEN TDD implementuj **pouze** `web/src/game/quests/questDialogue.ts` a `web/tests/unit/Agent24QuestDialogue.test.ts`: typovaný quest registry, branching dialogue s podmínkami, counters, prerequisites, fail/complete, jednorázový reward plan, všechny invalid-input testy. Zachovej `ashes_at_gate`, `warden_vesna` a stávající perzistenci; žádné změny GameSimulation/UI/i18n/save. Check/test/build; otevři jen **draft PR** s přesným dvousouborovým diffem, výsledky a handoffem; **nikdy neslučuj do main**.
