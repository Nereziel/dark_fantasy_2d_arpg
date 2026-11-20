# Agent coordination — Wave C (Agents 16–21, Prompts 12–17)

**Aktuální zadání:** [WAVE_C.md](WAVE_C.md), [integrační pravidla](INTEGRATION_C.md) a [16](16/TASK.md), [17](17/TASK.md), [18](18/TASK.md), [19](19/TASK.md), [20](20/TASK.md), [21](21/TASK.md). Všech šest úkolů má vlastní exkluzivní 2-file write-set a prompt ke spuštění. **Připraveno, nikoli spuštěno; start až po ověření merge PR #21.**

---

# Parallel agent development — current Wave B (Agents 06–15)

Ten independently assigned modules for Prompts 07–11: [exact write-sets and rules](WAVE_B.md), [integration plan](INTEGRATION_B.md), and individual task docs [06](06/TASK.md), [07](07/TASK.md), [08](08/TASK.md), [09](09/TASK.md), [10](10/TASK.md), [11](11/TASK.md), [12](12/TASK.md), [13](13/TASK.md), [14](14/TASK.md), [15](15/TASK.md). This is a **plan only**; no work started. The earlier Wave A plan remains below for reference.

---

## Archived Wave A (Agents 01–05)

**Umístění:** `docs/plan/agents/`  
**Zdroj pořadí:** [63 implementačních promptů](../../../2d_arpg_implementation_prompts.md)  
**Aktuální stav:** [docs/IMPLEMENTATION_STATUS.md](../../IMPLEMENTATION_STATUS.md)

## Cíl

Dokončovat **základní ARPG engine**, nikoli přidávat další města, bossy či questy. Pět agentů může bezpečně připravovat **samostatné, testovatelné moduly** ve stejnou dobu. Žádný agent této vlny nesmí měnit společná centra simulace ani provádět integraci do hry. Integrace proběhne následně a **v pořadí původních promptů**.

### Proč právě takto

Prompty 02–06 spolu funkčně souvisejí: pohyb, kontext klikání, klávesy a combat budou později propojené v `GameSimulation.ts`, `FrontierScene.ts`, `App.svelte` a sdílených typech. Pokud by na těchto souborech agenti pracovali paralelně, hrozí kolize. Proto je první vlna omezena na autonomní moduly a jejich **výhradní testovací soubory**. Prompt 02 je zatím rozpracovaný; ostatní agenti dělají pouze **přípravu budoucích promptů**, nikoli jejich dokončení mimo pořadí.

## Matice vlastnictví (přesné write-sety)

| Agent | Originální prompt | Smí měnit / vytvořit POUZE | Výstup |
| --- | --- | --- | --- |
| [01](01/TASK.md) | 02 — Player Entity and Character Core | `web/src/game/entities/player.ts`, `web/src/game/stats/deriveStats.ts`, `web/tests/unit/Agent01PlayerStats.test.ts` | Odolný a deterministický model zdraví/zdrojů/statů |
| [02](02/TASK.md) | 03 — Diablo-Style Mouse Movement | `web/src/game/world/navigation.ts`, `web/tests/unit/Agent02Navigation.test.ts` | Čisté rozlišení nejbližší dosažitelné pozice |
| [03](03/TASK.md) | 04 — Mouse Context Resolver | `web/src/game/input/contextResolver.ts`, `web/tests/unit/Agent03ContextResolver.test.ts` | Nezávislé rozlišení kontextu kliknutí a návrh typovaného příkazu |
| [04](04/TASK.md) | 05 — Force Move / Hold Position / Skill Aiming | `web/src/game/input/bindings.ts`, `web/tests/unit/Agent04InputBindings.test.ts` | Konfigurovatelné mapování kláves/myši bez Phaser listenerů |
| [05](05/TASK.md) | 06 — Combat Foundation | `web/src/game/combat/typedDamage.ts`, `web/tests/unit/Agent05TypedDamage.test.ts` | Čistá typovaná damage pipeline připravená na budoucí zapojení |

**Průnik write-setů kterýchkoliv dvou agentů musí být prázdný.** Názvy testů jsou úmyslně unikátní; agenti se nesmějí dělit o jeden testovací soubor.

## Společná pravidla

1. Každý agent startuje ze **stejného aktuálního commitu main** (koordinátor zaznamená SHA při dispatchi), vytváří vlastní `agent/NN-...` branch a izolovaný `git worktree`. Samostatná sdílená pracovní složka je zakázaná.
2. Přečti `AGENTS.md`, toto README, svou `TASK.md`, příslušný originální prompt, aktuální kód a stávající testy. Superpowers: `writing-plans`, `test-driven-development`, `verification-before-completion`, `requesting-code-review`.
3. **Mimo výše uvedený write-set nic neměň.** Platí i pro `AGENTS.md`, `docs/`, `README.md`, `web/package.json`, lockfile, CI, `web/src/i18n/`, `web/src/game/core/types.ts`, `GameSimulation.ts`, `FrontierScene.ts`, `App.svelte` a jakýkoliv save soubor.
4. Veřejné existující funkce a typy zachovej kompatibilní; nepřidávej závislosti. Nepřenášej výpočty do Phaseru/Svelte a neposílej změny do herního UI. Když potřebuješ nové sdílené API, zaznamenej návrh v textu PR; integrátor ho přidá **až po dokončení vlny**.
5. Dodržuj **TDD**: selhávající test → minimální úprava → ověření → malý commit → PR. Nezměň test pouze proto, aby skrýval skutečnou chybu.
6. Hodnoty předané zvenčí validuj; nulové, záporné, `NaN`, nekonečné či neplatné souřadnice ošetři deterministicky. Žádné `Math.random()` v doménových funkcích; případná náhoda přes předaný RNG.
7. Vlastní kód a testy pod GPL-3.0-only; žádná cizí grafika, soubory ani závislosti bez prověření licencí. Zachovej chování **character-only autosave** (žádný combat/world snapshot ani migrace).
8. Před PR spusť v `web/`: `npm ci --no-audit --no-fund`, `npm run check`, `npm run test`, `npm run build`. Pro nové testy použij `npm run test -- tests/unit/AgentNN...test.ts`. CI na PR navíc spustí Chromium a původní referenční test.
9. **Nikdo z agentů nesmí pushnout na main, mergnout PR, měnit workflow nebo publikovat Pages.** Do PR přidej seznam změněných souborů, přesné příkazy a výsledky testů, případná omezení a potřebné integrační kroky.
10. Když změna vyžaduje soubor jiného agenta nebo chráněný soubor, **STOP**: nevytvářej skrytý workaround a nesahej na cizí write-set; předlož integrátorovi technický blokátor.

## Průběh paralelní vlny

```text
                společný základ main @ <SHA>
                     /    /    |    \    \
                   01    02    03    04    05
                 vlastní větve a testy; bez shared edits
                     \    \    |    /    /
                  5 nezávislých Pull Requestů
                              |
                       integrační brána
            kontrola write-setů + review + plná CI
                              |
                 postupné začlenění 02 → 06
```

**Při běhu vlny se nemění `main` kvůli žádnému agentu.** Příprava agentů 02–05 neznamená, že prompty 03–06 splnily acceptance criteria. Po schválení jejich čistých modulů teprve koordinátor propojí runtime v pořadí 02, 03, 04, 05, 06.

## Jak spustit agenty

1. Pro každého nezávislého programovacího agenta vytvoř oddělenou větev/worktree ze stejného SHA.
2. Zkopíruj **celý blok „Prompt pro agenta“** z příslušného `NN/TASK.md`; předej jen daný task a tento kontext repozitáře.
3. Všech pět agentů je možné spustit současně **jen ve chvíli, kdy dodrží přesné write-sety**.
4. Výsledkem práce agenta je **PR, nikoli změna main**.
5. Koordinátor provede proces v [INTEGRATION.md](INTEGRATION.md). Pokud nejsou agenty/tooling dostupné, dokumenty zůstávají připravené pro pozdější spuštění.

**Stav tohoto dokumentu:** pouze zadání; vytvoření plánu není spuštění pěti agentů ani dokončení jejich úkolů.
