# Agent 02 — Diablo-Style Navigation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodat testovanou deterministickou funkci pro řešení kliknutí na neprůchozí/nedosažitelnou pozici; samotné připojení myši do hry není součástí vlny.

**Architecture:** Rozšířit čistý `navigation.ts` o volitelnou API funkci nad existujícími `Obstacle`, `Point`, `canOccupy`, `findPath`, A* mřížkou a radius. Dosavadní `findPath` a `moveActor` musí nadále fungovat beze změny signatury a výstupu.

**Tech Stack:** TypeScript 6, Vitest 5, Node 22+.

**Spec:** [Prompt 03](../../../../2d_arpg_implementation_prompts.md), [matice vlastnictví](../README.md).

## Global Constraints

- **Výhradní write-set:** `web/src/game/world/navigation.ts` a `web/tests/unit/Agent02Navigation.test.ts`.
- Pro novou funkci používej pouze existující datové typy; bez `GameSimulation.ts`, `generator.ts`, Phaseru, UI nebo input adapteru.
- Zachovat stávající exporty a navigaci (including default `OBSTACLES`), kompatibilitu s `Navigation.test.ts` a `WorldGeneration.test.ts`. Žádné nové závislosti.
- Nedělat repathing na každém simulačním ticku; výsledek je pro **jednu explicitní požadovanou destinaci**.

## Review Focus

1. Cíl uvnitř zdi → nejbližší **dosažitelný** bod, nikoli jen libovolný volný bod (Task 1).
2. Cíl mimo mapu → konečný bod uvnitř hranic světa (Task 1).
3. `NaN`/`Infinity` v souřadnicích → `null`, žádný nekonečný loop (Task 1).
4. Žádná validní startovní pozice → `null`, neměnit vstupy (Task 1).
5. Opakovaný stejný seed/obstacles → totožná destinace a omezený počet prozkoumaných buněk (Task 2).

---

## Prompt pro agenta (zkopírovat celý blok)

Jsi **Agent 02: Navigation** pro Aether & Ruin. Implementuj izolovaný základ **PROMPT 03 — Diablo-Style Mouse Movement**: přeložení blokované nebo nedosažitelné cílové pozice na nejbližší dosažitelné místo. Čti `AGENTS.md`, společný `docs/plan/agents/README.md`, tuto `02/TASK.md`, originální PROMPT 03 a existující navigační testy. Ve vlastní branch `agent/02-navigation` a odděleném worktree od přiděleného base SHA smíš měnit **jen** `navigation.ts` a nový `Agent02Navigation.test.ts`. Zachovej stávající `findPath`, `moveActor`, `canOccupy` a staré testy, nesahej na Phaser ani simulaci. Implementuj a TDD otestuj níže stanovenou funkci. Pošli PR bez merge/push main; pokud potřebuješ integrační API, napiš jej pouze do popisu PR.

### Task 1: Dosažitelný cíl

**Files:**
- Modify: `web/src/game/world/navigation.ts`
- Create: `web/tests/unit/Agent02Navigation.test.ts`

**Interfaces:**
- Consumes: `Point`, `Obstacle`, `ACTOR_RADIUS`, `OBSTACLES`, existující `canOccupy` a `findPath`.
- Produces:
```ts
export function resolveReachableDestination(
  from: Point,
  requested: Point,
  radius?: number,
  obstacles?: readonly Obstacle[]
): Point | null;
```
(Parametry `radius=ACTOR_RADIUS`, `obstacles=OBSTACLES`.)

- [ ] **Step 1: Selhávající test.** `from={x:430,y:742}`, `requested={x:520,y:745}` uvnitř `collapsed-wall`: výsledek není `null`, je průchozí s poloměrem 18 a existuje nenulová `findPath(from,result,...)`. Pro volný dosažitelný požadavek vrať přesně požadované souřadnice.
- [ ] **Step 2: Red test.** `cd web && npm run test -- tests/unit/Agent02Navigation.test.ts`; očekávané FAIL pro chybějící funkci.
- [ ] **Step 3: Implementace.** Jestliže je požadavek průchozí a dosažitelný, vrať jeho kopii. Jinak prohledej pouze průchozí **spojenou komponentu startu** v existující gridové mapě (včetně blokace diagonálních rohů), vyber bod s minimální eukleidovskou vzdáleností od `requested`; deterministické shody rozřeš podle menší vzdálenosti od `from`, pak `x`, pak `y`. Výsledek musí znovu projít `canOccupy` a `findPath`, jinak `null`. Nevytvářej opakované plné A* pro každého kandidáta.
- [ ] **Step 4: Doplnit testy mimo hranice, blokované body, nefinite hodnoty a nevalidní start; nesmí mutovat `from`, `requested` ani `obstacles`.**
- [ ] **Step 5: Green test.** Ověř cílený Vitest a stávající `Navigation.test.ts`, `WorldGeneration.test.ts`.

### Task 2: Výkonnostní a deterministické hranice

**Files:** stejné jako Task 1.

- [ ] **Step 1: Test pro stejné vstupy/rozložení vrací přesně stejný bod (opakuj 10×).**
- [ ] **Step 2: Test pro generovanou mapu `generateWorld(987)` (jen read-only import) vrací platné cesty i v blízkosti náhodných zdí.**
- [ ] **Step 3: Nepoužívat `Math.random()`, rekurzi nebo neomezený while; vyhledávání musí mít konečný limit `COLS*ROWS`.**
- [ ] **Step 4: Ověřit běžící starou navigaci, šíření kolizních překážek ani souřadnice portálů nesmějí být změněny.**

### Task 3: Gate před PR

- [ ] `cd web && npm run check && npm run test && npm run build` → PASS.
- [ ] `git diff --name-only <BASE_SHA>...HEAD` → jen povolené dva soubory.
- [ ] PR popíše nové API a **výslovně potvrdí, že ještě není připojené** k drženému LMB, GameSimulation a Phaser vstupu; tato integrace patří koordinátorovi v Promptu 03.
- [ ] Commit a PR, bez merge.
