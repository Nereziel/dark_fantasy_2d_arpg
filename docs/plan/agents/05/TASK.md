# Agent 05 — Typed Combat Damage Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Připravit deterministickou a čistou `typedDamage` pipeline pro damage types, resistances, crit, dodge, block, shields a healing, bez změn živé soubojové simulace.

**Architecture:** Nový modul `typedDamage.ts` dostane vše přes explicitní payload a předaný RNG. Může **importovat beze změn** stávající `mitigateDamage` z `damage.ts`. Nic neodečítá přímo z `ActorSnapshot`, nevyvolává eventy, neupravuje health ani svět. Až po promtech 02–05 koordinátor zapojí čistou funkci do jediné autoritativní combat pipeline.

**Tech Stack:** TypeScript 6, Vitest 5, Node 22+, stávající `SeededRng` jako kompatibilní RNG.

**Spec:** [Prompt 06](../../../../2d_arpg_implementation_prompts.md), [společná pravidla](../README.md).

## Global Constraints

- **Výhradní write-set:** `web/src/game/combat/typedDamage.ts`, `web/tests/unit/Agent05TypedDamage.test.ts` (oba nové).
- `web/src/game/combat/damage.ts`, `GameSimulation.ts`, `skills.ts`, `core/types.ts`, `deriveStats.ts`, `App.svelte` a další soubory jsou **read-only**. Neměň je ani kvůli testům.
- Žádné `Math.random()`, Phaser/Svelte, importy UI, změna balancingových konstant ve stávajícím souboji, modifikace attacker/defender objektů či vyvolávání `GameEvent`.
- Současné chování základního damage zůstává netknuté, dokud integrátor neschválí převod `rollAttackDamage` a všech skillů.
- Přesně definuj čistý výpočet pro explicitní payload, aby neexistovalo druhé místo s tajnými pravidly.

## Review Focus

1. Armor pro physical a resistance pro elemental/special → správné oddělení (Task 1).
2. 100% dodge/block/crit → definovaný výsledek, nulové či limitní šance bezpečně clampovat (Task 2).
3. Shield větší než přijatý damage → žádné záporné HP damage, spočítat zbývající shield (Task 2).
4. Stejný seed RNG → stejný damage i přesné pořadí spotřeby RNG (Task 2).
5. `NaN`/`Infinity`, záporné damage a nevalidní multiplikátory → konečné nezáporné výsledky, bez mutace payloadu (Task 3).

---

## Prompt pro agenta (zkopírovat celý blok)

Jsi **Agent 05: Typed Damage**. Připrav čistý, samostatný základ originálního **PROMPT 06 — Combat Foundation** pro budoucí integraci. Čti `AGENTS.md`, `docs/plan/agents/README.md`, svou `05/TASK.md`, originální PROMPT 06 a současný `web/src/game/combat/damage.ts`. Na větvi `agent/05-typed-damage` a v izolovaném worktree od přiděleného base SHA smíš vytvořit **pouze dva uvedené soubory**. Nepřipojuj novou pipeline ke `GameSimulation`, nezasahuj do `damage.ts` ani skillů. TDD, seedované deterministické testy, žádná změna ukládání. PR bez merge/push main; integrační potřebné změny popiš v PR.

### Task 1: Payload a vrstvy obrany

**Files:**
- Create: `web/src/game/combat/typedDamage.ts`
- Create: `web/tests/unit/Agent05TypedDamage.test.ts`

**Interfaces:**
```ts
export type DamageType =
  | 'physical' | 'fire' | 'frost' | 'lightning'
  | 'poison' | 'holy' | 'shadow' | 'arcane';
export type RandomSource = { next(): number };
export type DamageRequest = {
  type: DamageType;
  base: number;
  multiplier?: number;       // default 1
  critChance?: number;       // 0..100, default 0
  critMultiplier?: number;   // default 1.7
  defenderArmor?: number;    // default 0
  defenderLevel?: number;    // default 1
  resistancePercent?: number;// 0..100, default 0
  dodgeChance?: number;      // 0..100, default 0
  blockChance?: number;      // 0..100, default 0
  blockReduction?: number;   // 0..1, default 0.5
  shield?: number;           // default 0
};
export type DamageResult = {
  damage: number;
  absorbed: number;
  shieldRemaining: number;
  critical: boolean;
  dodged: boolean;
  blocked: boolean;
};
export function resolveTypedDamage(
  request: Readonly<DamageRequest>, rng: RandomSource
): DamageResult;
```

- [ ] **Step 1: Napsat red Vitest testy.** Physical `base=100,armor=50,level=1` → 50 bez dalších modifikátorů. Fire `base=100,armor=500,resistancePercent=25` → 75 (armor se neaplikuje na čistě ohnivé poškození). Všechny osmi typy musí být reprezentovatelné.
- [ ] **Step 2: Spustit `cd web && npm run test -- tests/unit/Agent05TypedDamage.test.ts`; očekávané RED pro chybějící funkci.**
- [ ] **Step 3: Pořadí pipeline:** `base * multiplier → critical → physical armor (jen physical) → resistancePercent (všechny typy včetně physical) → block → zaokrouhlení → shield → result`. Pro armor použij stávající `mitigateDamage` jako read-only import nebo ekvivalent bez změny starého modulu.
- [ ] **Step 4: Green testy pro physical/elemental a čistotu nemutovaných vstupů.**

### Task 2: Náhoda, blokace, absorpce

**Files:** stejné.

- [ ] **Step 1: Test `critChance=100, critMultiplier=1.7` ze 100 dá 170; `blockChance=100, blockReduction=0.5` po crit dá 85; `dodgeChance=100` dá 0 a `dodged=true`.**
- [ ] **Step 2: Test shield 60 proti mitigovanému damage 100 → `damage=40,absorbed=60,shieldRemaining=0`; shield 200 → `damage=0,absorbed=100,shieldRemaining=100`.**
- [ ] **Step 3: Před každým hit výpočtem vždy spotřebuj **přesně tři** `rng.next()` v pořadí dodge, crit, block, i při úhybu. `SeededRng` se stejným seedem musí vracet identickou sérii výsledků a spotřebu RNG.
- [ ] **Step 4: Otestovat absence mutací requestu a stejné výsledky pro opakování.**

### Task 3: Healing a nevalidní numerika

**Files:** stejné.

**Interface:**
```ts
export function resolveHealing(
  currentHealth: number, maxHealth: number, amount: number
): { health: number; healed: number };
```

- [ ] **Step 1: Test `resolveHealing(50,60,25)` → `{health:60,healed:10}`; `resolveHealing(0,100,-5)` → `{health:0,healed:0}`.**
- [ ] **Step 2: Sanitize: invalidní/nefinite numerika na rozumné 0 či default; žádné `NaN`, Infinity, záporné damage, shield ani healed. Percentages clamp 0..100, multipliers na nezáporné hodnoty.**
- [ ] **Step 3: Testy pro negativní base, procenta nad 100, `NaN` armor a invalidní shield.**
- [ ] **Step 4: Otestovat, že funkce nikdy nedává záporný `damage` ani záporný `shieldRemaining`.**

### Task 4: Gate před PR

- [ ] `cd web && npm run check && npm run test && npm run build` → PASS.
- [ ] `git diff --name-only <BASE_SHA>...HEAD` → jen povolené dva nové soubory.
- [ ] PR explicitně uvádí: nová pipeline je **zatím odpojená**, Prompt 06 nesplňuje celý acceptance gate (projectiles/area/damage events/skills jsou integrace koordinátora). Není povoleno změnit současný damage balance.
- [ ] Commit a PR, bez merge.
