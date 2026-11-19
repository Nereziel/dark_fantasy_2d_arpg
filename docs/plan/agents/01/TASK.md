# Agent 01 — Player Entity and Character Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zpevnit čistý model hráče a odvozených atributů bez změn živého API nebo ostatních systémů.

**Architecture:** Opravovat pouze čisté výpočty v `player.ts` a `deriveStats.ts`. Existující `GameSimulation`, `GameSnapshot.stats`, Svelte CharacterSheet a save v8 musí dál fungovat beze změn. Žádné nové UI.

**Tech Stack:** TypeScript 6, Node 22+, Vitest 5; bez nových závislostí.

**Spec:** [původní Prompt 02](../../../../2d_arpg_implementation_prompts.md) a [společné zadání](../README.md).

## Global Constraints

- **Výhradní write-set:** `web/src/game/entities/player.ts`, `web/src/game/stats/deriveStats.ts`, `web/tests/unit/Agent01PlayerStats.test.ts`.
- Read-only: `classes.ts`, `items.ts`, `core/types.ts`, `GameSimulation.ts` i všechny ostatní soubory.
- Zachovat existující exporty: `spawnPlayer(classId, equipment, position)`, `updateHealthLimit(player, maxHealth)`, `advanceResource(current, regenRate, cap, deltaSeconds)`, `deriveStats(classId, equipment)`, `DerivedStats`, `STAT_GROUPS`, `PERCENT_STATS`. Žádná změna jejich veřejných typů ani názvů.
- Pro validní vstupy zachovat současné výsledky Warrior i ostatních šesti tříd a chování z `Stats.test.ts`, `PlayerModel.test.ts`, `ItemsAndClasses.test.ts`.
- Nesmíš upravovat `GameSimulation.ts`, přepočítávat svévolně balanc, měnit uložená data ani integrovat Prompt 06.

## Review Focus (rizika a jejich testy)

1. `NaN`/`Infinity` jako nový maxHealth → hráč zůstane nezměněn (Task 1).
2. Nová hranice zdraví `<= 0` → žádný záporný/nekonečný HP stav (Task 1).
3. Smrt před výměnou výbavy → úprava maxima nesmí oživit (Task 1).
4. Invalidní `deltaSeconds` a kapacita zdroje → finite výstup bez záporné hodnoty (Task 2).
5. Přepočet ze stejné výbavy znovu → shodné výsledky bez mutací `CLASSES` a `Equipment` (Task 3).

---

## Prompt pro agenta (zkopírovat celý blok)

Jsi **Agent 01: Character Core** projektu Aether & Ruin. Tvým úkolem je dokončit oddělenou, testovanou část originálního **PROMPT 02 — Player Entity and Character Core**, konkrétně čisté výpočty životů, class resource a odvozených statistických hodnot. Přečti `AGENTS.md`, `docs/plan/agents/README.md`, `docs/plan/agents/01/TASK.md`, sekci PROMPT 02 v `2d_arpg_implementation_prompts.md` a stávající modulové testy. Pracuj ve vlastní větvi `agent/01-player-stats` a vlastním worktree od zadaného base SHA. **Smíš měnit jen tři soubory ve write-setu.** Nezasahuj do `GameSimulation`, `types`, UI, ukládání nebo cizích testů. Použij TDD, zachovej public API i numerické výsledky na validních vstupech, doplň unit testy pro neplatné hodnoty a nemutovatelnost. Odevzdej samostatný PR s výpisem přesných souborů, testovacími příkazy a výstupy. **Nesmíš mergnout PR ani pushnout main.** Pokud potřebuješ změnu mimo write-set, zastav se a popiš integrační požadavek.

### Task 1: Hranice maximálních životů

**Files:**
- Modify: `web/src/game/entities/player.ts`
- Create: `web/tests/unit/Agent01PlayerStats.test.ts`

**Interfaces:**
- Consumes: `ActorSnapshot` z `core/types.ts`.
- Produces: stávající `updateHealthLimit(player: ActorSnapshot, maxHealth: number): void`.

- [ ] **Step 1: Napsat selhávající Vitest test.** Alive s `maxHealth=100,health=70`: změna maxima na 140 dá `health=110`. Pro `NaN`, `Infinity`, záporné maximum a nulu se celý actor nezmění. Dead s `health=0` zůstane dead/0 po validním navýšení maxima.
- [ ] **Step 2: Spustit red test:** `cd web && npm run test -- tests/unit/Agent01PlayerStats.test.ts`. Ověřit očekávané selhání invalidních hodnot, ne v setupu.
- [ ] **Step 3: Upravit `updateHealthLimit`.** Odmítat nekladné nebo nefinite `maxHealth` před mutací; u validních hodnot zachovat současný způsob přenosu zbývajícího poškození a stávající clampování.
- [ ] **Step 4: Spustit tento test; očekávat PASS.**

### Task 2: Bezpečné časové kroky resource

**Files:**
- Modify: `web/src/game/entities/player.ts`
- Test: `web/tests/unit/Agent01PlayerStats.test.ts`

**Interfaces:** `advanceResource(current: number, regenRate: number, cap: number, deltaSeconds: number): number`.

- [ ] **Step 1: Přidat red testy.** `advanceResource(10, 5, 100, 0.5)===12.5`, `advanceResource(1, -5, 100, 2)===0`, `advanceResource(120, 10, 100, 1)===100`. `deltaSeconds < 0` a `NaN` způsobí **nulový časový posun**. `cap<=0` vrací 0. `NaN` current/regen nesmí vracet `NaN`; použij 0 pro invalidní current a nulovou změnu pro invalidní regen.
- [ ] **Step 2: Spustit red test a zjistit skutečný důvod selhání.**
- [ ] **Step 3: Doplnit sanitizaci vstupů bez přetypování a bez side-effectů; pro validní vstupy zachovat 60Hz deterministické výsledky.**
- [ ] **Step 4: Ověřit PASS a existující `PlayerModel.test.ts`.**

### Task 3: Výpočty a nemutovatelnost atributů

**Files:**
- Optional Modify: `web/src/game/stats/deriveStats.ts` **jen pokud test prokáže bug**
- Test: `web/tests/unit/Agent01PlayerStats.test.ts`

**Interfaces:** `deriveStats(classId: ClassId, equipment: Equipment): DerivedStats`.

- [ ] **Step 1: Vytvořit testy s `createEquipment()`, nasazeným itemem/afixy; ověřit shodu opakovaných výpočtů, nezměněný vstup a zachování `CLASSES.WARRIOR.primary`.**
- [ ] **Step 2: Ověřit, zda stávající modul už testy splňuje. Pokud ano, zbytečně jej nepřepisovat.**
- [ ] **Step 3: Případný prokázaný bug opravit minimálně v `deriveStats.ts`; žádné nové sekundární combat efekty ani změna balancingových konstant.**
- [ ] **Step 4: Spustit cílený test, `Stats.test.ts` a celý Vitest.**

### Task 4: Gate před PR

- [ ] `cd web && npm run check && npm run test && npm run build` → exit code 0; na PR se spustí i Playwright.
- [ ] `git diff --name-only <BASE_SHA>...HEAD` obsahuje jen tři přidělené cesty.
- [ ] V popisu PR výslovně uvést, které části Promptu 02 zůstaly **mimo scope** (combat/animation/interaction integrace), test evidence a případné limity.
- [ ] Commit a PR. Žádné změny mimo write-set, žádné merge.
