# Agent 27 — Wave E / Prompt 22: Wilderness Features & POIs

**Stav: ZADÁNO, NESPŮŠTĚNO.** Branch `agent/27-prompt-22-features`, worktree `../worktrees/agent-27`, společný BASE_SHA.

## Jediný povolený write-set

- `web/src/game/world/wildernessFeatures.ts`
- `web/tests/unit/Agent27WildernessFeatures.test.ts`

**Neimportuj `wildernessTerrain.ts` ani `actIQuestChain.ts`.** `WorldLayout` a `Point` importuj **jen ze stávajících souborů** `generator.ts` / `core/types.ts`; žádné změny `world/generator.ts`, `core/types.ts`, `GameSimulation.ts`, Phaser, UI, i18n, save, docs, CI či npm configu.

## Úkol

Pure TypeScript `planWildernessFeatures(seed: number, layout: Readonly<WorldLayout>): FeaturePlanResult`, které po terrain fázi vybere typed manifest **povinných příběhových landmarků** (corruption site, abandoned graveyard, evidence lead, crypt entrance), **named mini-boss encounter anchor**, zóny nakažených bestií, volitelná seedovaná POI/treasure/event místa a případné vizuální landmark metadata. Udrž dungeon entrance kompatibilní s existujícím portálem `CRYPT_GATE` (zachovat jeho použitelnou pozici; nezavádět novou `ZoneId`). Nezaváděj nová AI, drop gold, inventář ani world snapshot persistence. Event IDs/feature IDs musí být jasně dokumentované pro pozdější integrátorovo mapování na quest event kinds; **žádný runtime trigger a žádná lokalizovaná string ID**.

Algoritmus musí ověřovat: finite/uint32 seed policy, bounds, `canOccupy`, `findPath` od `layout.camp` do každého **mandatory** feature, neblokované bezpečné město/NPC a souřadnice portálu, minimální rozestupy od spawnu, ostatních POI a zdí, unikátní ID a nepřekryv s existujícími chest/shrine. Využij existující `WorldLayout` a `WORLD_OBJECTS`, ale čti je imutabilně. Pokud layout není validní, vrať explicitní validovaný error; optional placement může po konečném počtu pokusů vynechat POI, mandatory nikdy tiše nezmizí. Důležitá místa musí být při různých seedech dosažitelná a konzistentně pojmenovaná; seed 0 je také podporovaný.

## RED→GREEN acceptance

1. Stejný seed a stejný layout → deep equal typed IDs, kind, positions a presentation keys; různé seedy mění volitelný obsah, ale mandatory stable IDs/zóny zůstávají.
2. Povinná corruption/forest/graveyard/evidence/crypt/mini-boss místa jsou unikátní, dosažitelná od `CAMP`, mimo safe-zone a kolize (crypt entry výjimka jen pro existující přesnou portal position).
3. `NaN`/Infinity, rozbitá geometrie layoutu, nezvyklý seed, duplicitní IDs, unreachable point, přepsání vstupu → odmítnutí; žádný infinite loop, žádný `Math.random`.
4. Žádná mutace caller layoutu/obstacles/encounterPositions; seriálizovatelný manifest použitelný pro snapshots/render bez save.
5. Handoff obsahuje tabulku feature ID → intended story event kind, které integrátor propojí s Agentem 25 až po merge; **v testu se neimportuje agent 25**.

## Postup a prompt

Přečti `AGENTS.md`, svůj TASK, `WAVE_E.md`, `INTEGRATION_E.md`, `WORKFLOW_CACHE.md`, originální Prompt 22 a existující `generator.ts`, `navigation.ts`, `interactables.ts`. Vlastní branch/worktree stejného BASE_SHA, TDD RED→GREEN. Z kořene worktree:

```bash
bash scripts/agent-bootstrap.sh agent/27-prompt-22-features <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-27
bash scripts/verify.sh targeted tests/unit/Agent27WildernessFeatures.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
```

Otevři pouze **draft PR** s přesným dvěma soubory, cílovými ID/event handoff a výsledky. Nikdy nemerguj.

> Jsi **Agent 27 (Wave E, Prompt 22 — features)** v `Nereziel/dark_fantasy_2d_arpg`. Přečti `docs/plan/agents/27/TASK.md`, `WAVE_E.md`, `INTEGRATION_E.md`, `WORKFLOW_CACHE.md`, `AGENTS.md` a původní Prompt 22. Ze společného BASE_SHA založ izolovanou branch `agent/27-prompt-22-features`. TDD RED→GREEN vytvoř **jen** `web/src/game/world/wildernessFeatures.ts` a `web/tests/unit/Agent27WildernessFeatures.test.ts`: validované seeded POI/landmark/monster zone/treasure/event plánování nad READONLY existujícím `WorldLayout`, zaručená průchodnost korupce, hřbitova, evidence, mini-bosse a crypt entrance, bounded retry a typed story feature IDs. Žádné vzájemné importy nových modulů, runtime/UI/save/i18n changes ani deps. Ověř targeted + agent verifikaci, otevři **draft PR** se 2-souborovým diffem a handoffem. **NESLUČUJ DO MAIN.**