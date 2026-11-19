# Agent 04 — Configurable Input Bindings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Připravit konfigurovatelné klávesové/myší mapování pro budoucí ovladač ARPG, nezávisle na Phaseru.

**Architecture:** Čistá TypeScript knihovna překládá přijaté `KeyboardEvent.code` a index tlačítka myši na akce. Nenaslouchá reálným událostem a nepřidává nové `GameCommand`. Hotové akce se do hry zapojí až poté, co Prompt 04 propojí context resolver.

**Tech Stack:** TypeScript 6, Vitest 5; bez závislostí.

**Spec:** [Prompt 05](../../../../2d_arpg_implementation_prompts.md), [matice souborů](../README.md).

## Global Constraints

- **Výhradní write-set:** `web/src/game/input/bindings.ts`, `web/tests/unit/Agent04InputBindings.test.ts` (oba nové).
- `contextResolver.ts` agenta 03, `FrontierScene.ts`, `App.svelte`, `SkillBar.svelte`, `skills.ts`, `types.ts`, překlady a testy ostatních agentů jsou read-only.
- Udržovat vše datové a konfigurovatelné; žádné `window.addEventListener`, `document`, Phaser Input API, `setInterval`, IndexedDB nebo side effects v importu.
- `KeyC` a `KeyI` musí zůstat současnými zkratkami. Kódy `Digit1`–`Digit4` řeš jako fyzické pozice kláves pro české i anglické rozložení.
- Neimplementuj zatím míření skilly ani hold-position pravidla ve `GameSimulation`; bude to koordinovaný krok Promptu 05.

## Review Focus

1. Česká klávesnice (key `ě` na `Digit2`) → správná akce podle `code`, ne podle `key` (Task 1).
2. Psaní do inputu nebo otevřený modal → žádný world shortcut (Task 1).
3. Kolize dvou stejnoměrných bindingů → odmítnout změnu beze ztráty starého nastavení (Task 2).
4. Levé/pravé/střední tlačítko myši musí být rozlišeno (Task 1).
5. Rebind nezmutuje defaultní objekt ani předanou mapu; při stejném vstupu identický výstup (Task 2).

---

## Prompt pro agenta (zkopírovat celý blok)

Jsi **Agent 04: Input Bindings**. Z originálního **PROMPT 05 — Force Move, Hold Position, and Skill Aiming** připrav čistou vrstvu konfigurovatelných bindingů. Přečti `AGENTS.md`, `docs/plan/agents/README.md`, `docs/plan/agents/04/TASK.md` a původní Prompt 05. Ve vlastní větvi `agent/04-bindings` a odděleném worktree od přiděleného base SHA vytvoř **jen** `bindings.ts` a `Agent04InputBindings.test.ts`. Neupravuj key listeners, Phaser, `GameCommand` ani libovolný jiný soubor. Test-first; odevzdej PR s ověřením a popisem budoucí integrace; žádný merge ani push main.

### Task 1: Výchozí klávesy a myš

**Files:**
- Create: `web/src/game/input/bindings.ts`
- Create: `web/tests/unit/Agent04InputBindings.test.ts`

**Interfaces:** Definuj exportované:
```ts
type InputAction =
  | 'PRIMARY' | 'SECONDARY' | 'FORCE_MOVE' | 'HOLD_POSITION'
  | 'SLOT_1' | 'SLOT_2' | 'SLOT_3' | 'SLOT_4'
  | 'POTION' | 'EVADE' | 'INVENTORY' | 'CHARACTER'
  | 'SKILLS' | 'TALENTS' | 'MAP' | 'JOURNAL' | 'MENU';
type InputBinding =
  | { action: InputAction; device: 'keyboard'; code: string }
  | { action: InputAction; device: 'mouse'; button: number };
type KeyboardInput = { code: string; uiCaptured: boolean; isTyping: boolean; repeat?: boolean };
type PointerInput = { button: number; uiCaptured: boolean };
const DEFAULT_BINDINGS: readonly InputBinding[];
function resolveKeyboardAction(input: KeyboardInput, bindings?: readonly InputBinding[]): InputAction | null;
function resolvePointerAction(input: PointerInput, bindings?: readonly InputBinding[]): InputAction | null;
```

- [ ] **Step 1: Napsat red testy:** `Digit2` vrátí `SLOT_2` nezávisle na `key`; `KeyC`→`CHARACTER`; `KeyI`→`INVENTORY`; `ShiftLeft/ShiftRight`→`HOLD_POSITION`; `Escape`→`MENU`; myš `0`→`PRIMARY`, `1`→`FORCE_MOVE`, `2`→`SECONDARY`.
- [ ] **Step 2: Dodat defaulty pro `Digit1..4`, `KeyQ` POTION, `Space` EVADE, `KeyS` SKILLS, `KeyT` TALENTS, `KeyM` MAP, `KeyJ` JOURNAL, `KeyC`, `KeyI`, `Escape`.**
- [ ] **Step 3: UI guard:** `uiCaptured` nebo `isTyping` potlačí výstup `null`; Escape pro modal dnes zpracovává UI, ne tuto knihovnu. Neznámé button/code → `null`. `repeat` pro hold-position může být true; ostatní akce se opakováním nevyvolají.
- [ ] **Step 4: Spustit red, implementaci a green:** `cd web && npm run test -- tests/unit/Agent04InputBindings.test.ts`.

### Task 2: Přemapování bez konfliktů

**Files:** stejné jako Task 1.

**Interface:**
```ts
function rebindAction(
  bindings: readonly InputBinding[], replacement: InputBinding
): { ok: true; bindings: InputBinding[] } | { ok: false; reason: 'CONFLICT' | 'INVALID' };
```

- [ ] **Step 1: Test úspěšného rebindu `FORCE_MOVE` na jiné tlačítko, `CHARACTER` na `KeyP` a že DEFAULT_BINDINGS zůstává netknutý.**
- [ ] **Step 2: Test odmítnutí kolize `KeyC` mezi `CHARACTER` a `MAP`, nevalidního code a button mimo `0..4`; původní mapu nemutovat.**
- [ ] **Step 3: Implementovat kontrolu unikátního `device+code/button`; výměnu provádět immutably.**
- [ ] **Step 4: Ověřit testy na dvou různých binding mapách.**

### Task 3: Gate před PR

- [ ] `cd web && npm run check && npm run test && npm run build` → PASS.
- [ ] Write-set kontrola: jen `bindings.ts` a `Agent04InputBindings.test.ts`.
- [ ] PR musí výslovně uvádět, že **žádné runtime zkratky se tímto PR nemění**, Q nyní může ve hře dělat jiné chování; výchozí doporučení je připravené pro budoucí integraci, kterou provede koordinátor podle Promptu 05.
- [ ] Commit a PR, bez merge.
