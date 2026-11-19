# Agent 03 — Mouse Context Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zavést nezávislý, opakovatelně testovaný překladač pozice myši a kandidátních objektů na typovaný kontext a již existující `GameCommand`.

**Architecture:** Nový čistý soubor `contextResolver.ts` nezná Phaser, Svelte ani aktuální simulaci. Vrací pouze data, neprovádí žádnou akci. Adaptér ve `FrontierScene.ts` připojí až integrátor po dokončení Promptu 03.

**Tech Stack:** TypeScript 6, Vitest 5; import existujících read-only `Point`, `GameCommand`, `NpcId`.

**Spec:** [Prompt 04](../../../../2d_arpg_implementation_prompts.md), [společná pravidla](../README.md).

## Global Constraints

- **Výhradní write-set:** pouze `web/src/game/input/contextResolver.ts` (nový) a `web/tests/unit/Agent03ContextResolver.test.ts` (nový).
- Žádné změny `GameSimulation.ts`, `core/types.ts`, `FrontierScene.ts`, `App.svelte`, NPC dat, rendereru, lokalizace či souborů jiného agenta.
- Podporovat kategorie `GROUND`, `ENEMY`, `NPC`, `LOOT`, `INTERACTABLE`, `UI`, `INVALID`.
- Jen existující akce z `GameCommand`; pro `INTERACTABLE` nyní podporuj jen portál na `usePortal`. Truhla a shrine budou vyžadovat nový command, který přidá až koordinátor.
- Nepřidávat závislost na `navigation.ts` a pomocníkovi agenta 02: `walkable` přichází od volajícího, aby nebyl mezi agenty runtime coupling.

## Review Focus

1. Svelte/UI překryv → `UI` a `null` command, i když pod ním leží enemy (Task 1).
2. Neplatné, nefinite souřadnice → `INVALID`, ne `move` s NaN (Task 1).
3. Více objektů v dosahu → deterministická volba bez závislosti na pořadí v poli (Task 2).
4. Mrtvý enemy nebo cíl s invalid hit-radius → přeskočit (Task 2).
5. Nesprávné / podvržené NPC či neznámá truhla → žádné nepovolené příkazy (Task 3).

---

## Prompt pro agenta (zkopírovat celý blok)

Jsi **Agent 03: Context Resolver**. Připrav izolovanou datovou část originálního **PROMPT 04 — Mouse Context Resolver and Interaction Model**. Přečti `AGENTS.md`, `docs/plan/agents/README.md`, svou `03/TASK.md`, původní PROMPT 04 a existující `GameCommand` v `core/types.ts`. Ve své větvi `agent/03-context` a vlastním worktree od zadaného base SHA **vytvoř pouze dva soubory ve write-setu**. Neprováděj integraci do Phaseru, neměň společné typy, neimplementuj chests/shrines novými GameCommand typy. Při blokátoru vydej jasný požadavek integrátorovi, nikoliv úpravu jiného souboru. TDD, determinismus, vlastní PR a žádné mergování/push do main.

### Task 1: Datový kontext myši

**Files:**
- Create: `web/src/game/input/contextResolver.ts`
- Create: `web/tests/unit/Agent03ContextResolver.test.ts`

**Interfaces:** Zaveď a exportuj:
```ts
type ContextKind = 'GROUND' | 'ENEMY' | 'NPC' | 'LOOT' | 'INTERACTABLE' | 'UI' | 'INVALID';
type ContextTarget = {
  kind: 'ENEMY' | 'NPC' | 'LOOT' | 'INTERACTABLE';
  id: string;
  position: Point;
  hitRadius: number;
  alive?: boolean; // only ENEMY needs this
};
type PointerContextInput = {
  pointer: Point;
  uiCaptured: boolean;
  walkable: boolean;
  targets: readonly ContextTarget[];
};
type ResolvedPointerContext =
  | { kind: 'UI' | 'INVALID' }
  | { kind: 'GROUND'; position: Point }
  | { kind: ContextTarget['kind']; id: string };
function resolvePointerContext(input: PointerContextInput): ResolvedPointerContext;
```

- [ ] **Step 1: Napsat selhávající testy.** `uiCaptured=true` → `UI` i nad živým enemy; nefinite pointer → `INVALID`; prázdný seznam na walkable místě → `GROUND`; `walkable=false` bez entity → `INVALID`.
- [ ] **Step 2: Spustit `cd web && npm run test -- tests/unit/Agent03ContextResolver.test.ts` a ověřit red.**
- [ ] **Step 3: Implementovat čistou funkci**, bez DOM/Phaser volání nebo měnění `targets`. Poloha targetu se porovnává s `pointer` a `hitRadius`; invalidní či dead targets ignorovat.

### Task 2: Deterministické priority a cursor feedback

**Files:** stejné jako Task 1.

- [ ] **Step 1: Test překrytí:** shodný hitbox NPC/LOOT/ENEMY/INTERACTABLE, priorita `NPC > LOOT > ENEMY > INTERACTABLE`. U stejné kategorie nejbližší střed, při shodě lexikograficky menší ID, bez závislosti na pořadí input pole.
- [ ] **Step 2: Implementace priorit**; validovat konečné kladné radiusy, nerozhodovat podle vzhledu sprite nebo textu entity.
- [ ] **Step 3: Export `cursorForContext(context: ResolvedPointerContext)`** vrací jednu z datových hodnot `move | hostile | talk | loot | interact | blocked | ui`. Nesmí manipulovat s HTML kurzorem ani Phaser GameObject.
- [ ] **Step 4: Test pro všechny kategorie a neustálené pořadí targetů.**

### Task 3: Překlad na existující command

**Files:** stejné jako Task 1.

**Interface:**
```ts
function contextToCommand(context: ResolvedPointerContext): GameCommand | null;
```

- [ ] **Step 1: Test očekává:** `GROUND`→`{type:'move',destination}`; `ENEMY`→`{type:'attack',targetId}`; `LOOT`→`{type:'pickup',id}`; známé `NPC`→`{type:'interactNpc',npcId}`; `INTERACTABLE` s ID `crypt-portal`→`{type:'usePortal'}`; `UI/INVALID`→`null`.
- [ ] **Step 2: Zajistit, že neznámé NPC ID a jiná INTERACTABLE ID vrátí `null`, ne nový, dosud nedefinovaný příkaz.**
- [ ] **Step 3: Implementovat minimalistický překlad pomocí `isNpcId` (read-only import).**

### Task 4: PR gate

- [ ] `cd web && npm run check && npm run test && npm run build` → PASS.
- [ ] `git diff --name-only <BASE_SHA>...HEAD` → přesně dva povolené soubory.
- [ ] V PR uvést, že hover styl, klik v `FrontierScene.ts`, interakční vzdálenost a budoucí truhly zůstávají **k integraci po Promptu 03**.
- [ ] Commit a PR, bez merge.
