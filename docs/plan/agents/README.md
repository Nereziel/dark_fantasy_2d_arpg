# Koordinace agentů — Wave G: core integrována (Prompty 26–28)

**20. 11. 2026 — herní jádro Wave G sloučeno do `main`.** Izolovaní agenti **31/32/33** (PR [#56](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/56), [#57](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/57), [#58](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/58)) a integrátor (PR [#59](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/59), [#60](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/60), [#61](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/61), [#62](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/62), [#63](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/63)) už dodali jádro krypty, klikatelné kontejnery/pasti, 4 minibossové i třífázového Hollow Kinga. **Agenty 01–33 znovu nespouštěj.**

[WAVE_G.md](WAVE_G.md), [INTEGRATION_G.md](INTEGRATION_G.md), [31/TASK.md](31/TASK.md), [32/TASK.md](32/TASK.md), [33/TASK.md](33/TASK.md) jsou historické zadání a integrační audit. Aktuální herní runtime `main` je `ab8aa0ca345ab71fa2aafd02885cfc207daaee88`; poslední PR HEAD CI má 696/696 Vitest, 14/14 Chromium, Svelte/TS 0 errors/warnings, build/legacy PASS.

**Status = CORE INTEGRATED, full acceptance pending.** Zbývá bezdebugový browser Act I/dungeon boss playthrough, originální dungeon audio/atlasy, plně objevitelné secret rooms, treasure-item rewards, offscreen entity/loot streaming memory performance, optional wilderness POI a verifikace přesného Pages deploy. Zachovat character-only save v11 + seed-scoped world facts format1, původní `crypt_lord-4` ID a quest `crypt_lord_fallen`. **Waypoint fast travel až Prompt 36.** Po Wave G je nyní integrován také **Prompt 29 — Death and Respawn**, [PR #65](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/65), do runtime `main` SHA `47b5b5285921baf535ccf8bcbd5ecf077b21bd36`. Death cleanup, aktivovaná Svatyně duší / town waypoint fallback, jednorázová 3s ochrana, trvalé progress/save fakty; CI: **701/701 unit, 14/14 Chromium**, 0 TS/Svelte errors/warnings a build PASS. Kompletní natural browser death→respawn UX není pokryt novým E2E a zbývá acceptance. **Prompt 30 — Talent Tree Foundation** již také implementován v [PR #67](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/67), `main` SHA `3deaaeb65b15c8c718e2d2c6fe78f803fe0afa97`. 12 Warrior talentů / Berserker, Guardian, Warlord / přidělování ranků a placený respec přes simulaci; živé bonusy statistik i schopností, uchované v kompatibilním save v11, lokalizované UI a nový browser test. HEAD CI [44799632075](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44799632075): **709/709 unit + 15/15 Chromium**, TS/Svelte 0 chyb/varování, build a legacy PASS. Stále zbývá natural gameplay acceptance vyvažování všech Warrior buildů; ostatní classy budou mít vlastní talenty v dalších zadáních. **Prompt 31 — Skill Modification System** nyní **CORE INTEGRATED** v [PR #69](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/69), `main` SHA `2c4e6597605f345c5cc22ed9adb595671dc6e309`. Vznikl pure skládací model radius/pull/status/projectile/pierce/summon, živý Whirlwind používá Warlord/Berserker modifikace i legacy item `skillRank`/legendární síly; skutečné kolizní přitažení + canonical bleeding, Phaser efekt a CS/EN tooltip; save v11 beze změny. HEAD [CI 44808819324](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44808819324) GREEN: **715/715 unit, 16 browser po 1 flaky retry starého evade testu**, typy/build PASS. Zbývá natural combat balance a reálné rozšíření tříd Fireball/Raise Skeleton; nyní jen čisté extension hooks. **Prompt 32 — Crafting, Salvaging, and Materials** je **CORE INTEGRATED** v [PR #71](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/71), herní main SHA `097b20b8d709f908cc88acba1e02817b035ce6c4`. Data-defined pure recepty, železo/ocel/tajemný prach/úlomky duší/démonická esence/prastarý krystal, skutečné salvage/upgrade/affix reroll/enchant/empty socket, autoritativní kontrola kováře a nákladů, CS/EN panel. Materiály jsou volitelné character-only pole v dosavadním save v11, starší uložené postavy kompatibilní. HEAD [CI 44814185282](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44814185282) GREEN: **722/722 unit, 16/16 Chromium**, typy 0 chyb/varování, build a legacy PASS. Zbývá herní vyvážení salvage economy a reálné gemy/runy — ty patří až do Promptu 33. **Prompt 33 — Gems and Runes** je **CORE INTEGRATED** v [PR #73](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/73), herní `main` SHA `0c59fe382dd8f558a2061c3afaf9dc52c5b44933`. Šest druhů kamenů a run ve třech tierech, 3→1 upgrade, kování z reálných materiálů, atomické socketing/extraction s ochranou item IDs a nákladů, živé kategoriální bonusy damage/resist/regen a sockety šperků, volitelná v11 gem wallet, lokalizované CS/EN UI. HEAD [CI 44818461718](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44818461718) GREEN: **732/732 Vitest, 19/19 Chromium, 0 chyb/varování**, build a legacy PASS. Zbývá natural dlouhé hraní a ekonomické vyvážení gemů; neznamená to plnou Act I acceptance ani ověřený Pages deploy. **Prompt 34 — Potions and Consumables je nyní CORE INTEGRATED** v [PR #75](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/75), runtime `main` SHA `666ca3c0aed2f0427fc882a2ca2e6e9ab7846260`. Simulací řízené `Q` a 4 typy lektvarů, charges/refill/4s shared cooldown, dočasná odolnost a útok s reálným damage efektem, CS/EN HUD, Phaser VFX, character-only save v11 s volitelnými potion fields a anti-reload cooldown. HEAD [CI #44825426654](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44825426654) GREEN: **741/741 Vitest, 20/20 Chromium (1 flaky retry)**, TS/Svelte 0 errors/warnings, build a legacy PASS. Kompletní natural-play balancing a Pages na novém merge SHA se musí ověřit zvlášť. **Prompt 35 — Player Stash CORE INTEGRATED** v [PR #77](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/77), merge `683a97fdb0d348153991681b65c6e870fbd4086f`. Původní 24slotové character stash v11 zůstává beze změny jako tab 0; dva další 24slotové volitelné character-owned taby, atomické transfery/mezizáložkové move/řazení a read-only filtry dle názvu template, vzácnosti a kategorie, zachování ID, socketů, locked/favorite a proximity autority. UI CS/EN. HEAD [CI #44827650522](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44827650522) GREEN: **748/748 Vitest, 21/21 Chromium, TS/Svelte 0 errors, build/legacy PASS**. Natural-play zaplněných 72 slotů a multi-character account storage zůstávají budoucí acceptance; multiplayer storage není přidáno. **Prompt 36 — Fast Travel and Waypoints CORE INTEGRATED** v [PR #79](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/79), herní `main` SHA `b100eb6b233fea3476d63bf8f002e752a202c408`. Skutečný světově deterministický přesun mezi aktivovaným táborovým waypointem a odemčenou Svatyní duší; čisté atomic access/destination plánování, bez remote/crypt/unrevealed travel, bez odkrytí mezilehlých fog buněk; map + town Svelte CS/EN UI a Phaser kamera. Bez změny character save v11, world save format 1 nebo map fingerprintu, zachování starých uložených světů. Přesný PR HEAD [CI #44830367344](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44830367344) **GREEN: 753/753 Vitest, 22/22 Chromium, 0 TS/Svelte chyb/varování, build a legacy PASS**. Natural browser field-shrine→town→field (bez fixture), balancing checkpointy a post-merge Pages ověřit samostatně. **Prompt 37 — World Events CORE INTEGRATED** v [PR #81](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/81), herní main SHA `0d13700b8862c59d2b9ea2668d2154ce3a70b373`. Osm seedově deterministických typů ze tří regionálních tabulek nad dvěma již validovanými volitelnými event POI; maximálně dva další nepřátelé, žádné poškození Act I mandatory lokací, skutečný simulační combat a jednorázové XP/gold/material/item po potvrzení `eventCompleted` world fact. Před úplným dokončením souboje se nepřiděluje dílčí loot, XP, zlato ani quest/kill counter. CS/EN Svelte HUD a Phaser FX, mapová mlha nezveřejňuje neobjevené body, character v11/world format1/fingerprint neměníme. Přesný PR HEAD [CI #44833728170](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44833728170) **GREEN: 759/759 Vitest, 23/23 Chromium, 0 Svelte/TS chyb/varování, build/legacy PASS**. Pokročilá ochrana karavany/záchrana civilistů (živé přátelské NPC, časované fáze) ještě není dokončena a nelze ji vydávat za full acceptance. **Další originální Prompt 38 — Shrines and Environmental Interactions**; nejprve audit stávajících klikacích dveří, truhel, pastí a shrines, pak rozsah implementace.


---

## Archiv: Wave F — agenti 28–30 integrováni

# Koordinace agentů — Wave F: herní jádro integrováno (28–30)

**Aktuální stav 20. 11. 2026:** Wave F (Prompty 23–25) má sloučené izolované agentní moduly **#48 / #50 / #49**, následně runtime **[#51](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/51)** (wilderness chunks), **[#52](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/52)** (mapa, fog, world-scoped persistence) a **[#53](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/53)** (procedurální krypta). Všechny PR prošly GREEN CI před merge; poslední #53 zahrnovalo 607/607 unit + 14/14 Chromium. **Agenty 28–30 znovu nespouštěj.**

| Historický agent | Prompt | Výhradní modul | Stav |
| --- | --- | --- | --- |
| 28 | 23 — World Chunking | `world/chunkStreaming.ts` | [#48](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/48) merged |
| 29 | 24 — Map/Minimap/Fog | `world/mapDiscovery.ts` | [#50](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/50) merged |
| 30 | 25 — Procedural Dungeon | `world/proceduralDungeon.ts` | [#49](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/49) merged |

**Source of truth:** [WAVE_F.md](WAVE_F.md), [INTEGRATION_F.md](INTEGRATION_F.md) obsahují výsledek včetně přesných SHAs, CI a zbývajících acceptance. Důležité: character-only save **v11** trvá, samostatná perzistence world facts/fog je seed-scoped; žádné fast travel před Promptem 36. Zbývá měření offscreen AI/entity unload + browser průchod celým novým dungeonem bez fixture a poslední kontrola Pages/main. Číselně další Prompty 26–28; nejprve rozhodnout o stavu acceptance tohoto closeoutu.

---

## Archiv: Wave E — story & wilderness core integrována (agenti 25–27)

[WAVE_E.md](WAVE_E.md), [INTEGRATION_E.md](INTEGRATION_E.md), [25/TASK.md](25/TASK.md), [26/TASK.md](26/TASK.md), [27/TASK.md](27/TASK.md).
Agentní PR #42/#41/#43 a runtime PR #44/#45 jsou sloučené do `main`; dokumentace #46. 547/547 jednotkových a 13/13 Chromium testů prošlo v PR runtime, dokončen byl i CS/EN a character-only save v11 (migrace v8/v9/v10). Uživatel potvrdil manuální průchod celým Aktem I; **automatický full no-debug Act I E2E a interaktivní optional POI event/treasure** zůstávají k doložení. **Agenty 25–27 znovu nespouštěj**.

---

## Archiv: Wave D dokončena na úrovni runtime

Vlna D měla **3 agenty** (22–24), každý samostatný doménový modul a jednotkový test. **Žádný z těchto úkolů znovu nespouštěj.** Agenti předali izolované PR [#30](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/30), [#32](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/32) a [#31](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/31); integrátor je sloučil v pořadí 18→19→20 a napojil runtime přes [#33](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/33), [#34](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/34), [#35](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/35).

- [WAVE_D.md](WAVE_D.md) je historické zadání; [INTEGRATION_D.md](INTEGRATION_D.md) obsahuje integrační závěrečný záznam.
- Prompty **18–20 mají integrované funkční jádro**: město s NPC, léčitelem a **perzistentní osobní úschovnou** (closeout [#37](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/37), character-only v10 s migrací v8/v9), ekonomiku a dialog/quest registry. Waypoint rychlé cestování není hotové a patří Promptu 36.
- Následující obsahové Prompty **21–22** plánovat teprve po výslovném zadání; nevytvářet kolidující paralelní změny bez nového write-set plánu.

---

## Archiv: Wave C (agenti 16–21, Prompty 12–17)

Wave C je skutečně **dokončená a sloučená**: agentní moduly #22/#27/#23/#26/#24/#25, runtime integration [PR #28](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/28), GREEN testy a deployment `main`. Historický plán [WAVE_C.md](WAVE_C.md) a [INTEGRATION_C.md](INTEGRATION_C.md) ponecháváme pro dohledání rozhodnutí.

---

## Archiv: Wave B (agenti 06–15)

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
