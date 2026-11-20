# Agent 25 — Wave E / Prompt 21: Act I Quest Chain

**Stav: ZADÁNO, NESPŮŠTĚNO.** Branch `agent/25-prompt-21`, worktree `../worktrees/agent-25`, společný integrátorem sdělený **FULL_40_CHAR_BASE_SHA**.

## Výhradní write-set (PŘESNĚ dva soubory)

- `web/src/game/quests/actIQuestChain.ts` (nový)
- `web/tests/unit/Agent25ActIQuestChain.test.ts` (nový)

Žádný další soubor, zejména ne `firstQuest.ts`, `starterQuestRegistry.ts`, `questDialogue.ts`, `GameSimulation.ts`, `core/types.ts`, i18n, UI, NPC, save, lockfile nebo dokumentace. Bez nových závislostí.

## Co implementovat

Vytvoř **čistý, typovaný quest katalog Act I** pro stávající `QuestCatalog` a `QuestLedger` v `questDialogue.ts`. Použij existující `STARTER_QUEST_CATALOG` jako základ, nevytvářej druhé `ashes_at_gate`, nepřepisuj `WARDEN_ID = warden_vesna`, `QUEST_REQUIRED_KILLS = 3`, původních 150 gold / 100 XP. Quest řetězec musí přirozeně navazovat na starter quest přes stabilní prerequisity; navrhni konzistentní stabilní ID a localization keys pro následující kapitoly: (1) pátrání po korupci, (2) nakažené bestie, (3) opuštěný hřbitov, (4) pojmenovaný mini-boss, (5) důkaz ukazující na crypt, (6) sestup do krypty, (7) dungeon boss, (8) návrat k Vesně a unlock příští kapitoly. Zachovej příběhové souvislosti v `descriptionKey`/dialogue klíčích, žádné pouze anonymní kill tasky.

Exportuj např. `ACT_I_QUEST_CATALOG`, stabilní typed story quest IDs, uspořádaný seznam milestones a definici **event contracts** s unikátním `eventId` (typ události), `occurrenceId` (unikátní konkrétní výskyt produkuje integrátor), region/marker hint a NPC turn-in hint — **bez world souřadnic ze seedu a bez funkčního runtime emitteru**. Přidej pure helper pro bezpečné vytvoření/migraci **in-memory** Act I ledgeru z validního `QuestProgress` (ne nový save): musí zachovat historický stav a rewardClaimed. Použij `validateQuestCatalog`/`validateQuestLedger`. Tam, kde quest engine neumí přímo navázat událost/flag, předdej integrační kontrakt, ne workaround mutující simulaci. Dialogy jen typované `DialogueNode`/volby; stará root Vesna musí zůstat dostupná. Žádný nový autoritativní reward executor.

## RED→GREEN acceptance

1. Full katalog validní, žádná duplicita s `ashes_at_gate`, DAG prerequisit, oboustranně konzistentní markers/events, story gate pořadí a odemčení dalšího kroku.
2. Z původních `available/active/ready/completed` stavů se starý quest nezmění (zejména již vyplacený reward se nikdy znovu nevrátí); pozdější quest je zamčen před dokončením prerequisitu.
3. Každá fáze `accept → relevant events → ready → turnIn` je přes generic engine reprodukovatelná; duplicate occurrence a opakovaný turn-in = no second reward; unrelated event nepřidává progress.
4. Nevalidní ledger, event/ID, ohrožené čítače, `NaN/Infinity`, rehydrace po JSON roundtrip, nemutování snapshotů a language-independent IDs.
5. Testy garantují pouze klíče, nikoli skutečné překlady (CS/EN dodá integrátor s runtime).

## Postup

Přečti `AGENTS.md`, `README.md`, `WAVE_E.md`, `INTEGRATION_E.md`, toto TASK, Prompt 21 z `2d_arpg_implementation_prompts.md`, `questDialogue.ts`, `starterQuestRegistry.ts`, `firstQuest.ts`. Začni z **jediného BASE_SHA** a svého worktree; respektuj [WORKFLOW_CACHE.md](../WORKFLOW_CACHE.md). Test musí být RED před implementací. Potom:

```bash
bash scripts/agent-bootstrap.sh agent/25-prompt-21 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-25
# následující příkazy z KOŘENE agentního worktree
bash scripts/verify.sh targeted tests/unit/Agent25ActIQuestChain.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
```

Otevři **jen draft PR** do main: přesný dvousouborový diff, API a event handoff, validace/RED→GREEN, výsledky PASS/FAIL/NOT RUN. **NEMERGOVAT**.

## Prompt k přímému předání agentovi

> Jsi **Agent 25 (Wave E, Prompt 21)** pro `Nereziel/dark_fantasy_2d_arpg`. Přečti celé `docs/plan/agents/25/TASK.md`, `WAVE_E.md`, `INTEGRATION_E.md`, `WORKFLOW_CACHE.md`, `AGENTS.md` a originální Prompt 21. Ze společného integrátorem předaného BASE_SHA založ `agent/25-prompt-21` v izolovaném worktree. TDD RED→GREEN dodej **pouze** `web/src/game/quests/actIQuestChain.ts` a `web/tests/unit/Agent25ActIQuestChain.test.ts`: kompletní datový Act I quest chain přes stávající QuestCatalog s prerequisitami, narativními klíči, event/marker kontrakty, bezpečným in-memory ledger převodem a exactly-once reward testy. Neměň `ashes_at_gate`, `warden_vesna`, v10 save, GameSimulation, UI, i18n či soubory jiných agentů. Ověř targeted a agent verifikaci, otevři **pouze draft PR** s přesným 2-souborovým diffem a handoffem. **NIKDY NEMERGUJ.**