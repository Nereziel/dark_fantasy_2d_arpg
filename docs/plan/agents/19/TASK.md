# Agent 19 — Prompt 15: Inventář a výbava

**Stav:** připraveno pro samostatnou větev; agent není spuštěn. **Nesmí mergeovat PR.**
**Výchozí commit:** přesný `BASE_SHA` musí koordinátor zaznamenat z `main` PO merge integračního PR #21; všech šest agentů startuje ze stejného SHA.

## Jediné povolené soubory

1. `web/src/game/inventory/equipmentRules.ts`
2. `web/tests/unit/Agent19EquipmentRules.test.ts`

**Nesmíš vytvořit/měnit žádný třetí soubor**, ani AGENTS.md, README, společné testy, shared types, i18n, GameSimulation, SaveRepository, web/package.json, workflow, soubory ostatních agentů. Soubor vytvoř, pouze pokud na BASE_SHA neexistuje. Kolidující nebo chybějící API → popsání blokátoru v PR, nikoli zásah do sdílených souborů.

## Cíl

Realizuj **izolovaný, plně otestovaný doménový modul** Promptu 15. Je to příprava pro integrátora, ne tvrzení o dokončené runtime acceptance.

- Čisté immutable operace nad stávajícími veřejnými typy z `data/items.ts`, bez mutace UI a bez importů z jiných nových modulů.
- Validuj sloty, požadavky, obsazený inventář, obranu proti ztrátě předmětu, invalid index, lock/favorite, duplikované instance ID.
- Dvouruční vybavení: přesun offhand do inventáře atomicky, nebo operaci odmítni; zakázat vybavení do obsazené ruky v rozporu s pravidly.
- Srovnávací tooltip je čistá projekce rozdílu základních/odvozených statistik; žádná přímá změna Player.stats.
- TDD pro inventář plný/částečně plný, swap, rozdělené ring sloty, JSON roundtrip, invalid command.

## Požadované rozhraní

Navrhni a exportuj smysluplná typed API odpovídající:
`planEquip, planUnequip, planSwap, planDrop, sortInventory, filterInventory, compareEquipment, favoriteOrLockItem`.

Názvy lze zpřesnit, ale vždy v PR výslovně uveď finální funkce/typy, hraniční chování a způsob integrace. Bez simulace, Phaser/Svelte/UI a nových závislostí.

## Práce krok po kroku

1. Přečti `AGENTS.md`, `docs/plan/agents/WAVE_C.md`, `docs/plan/agents/INTEGRATION_C.md`, originální Prompt 15, existující typy/konvence, svoje TASK.md.
2. Z `BASE_SHA` vytvoř větev `agent/19-prompt-15` a samostatný worktree; nezačínej z cizí feature větve.
3. Napiš červené Vitest testy ve svém *jediném* testovacím souboru; poté implementuj čistý modul. TDD. Testy musí zohlednit neplatné vstupy a nekonečné hodnoty.
4. Ověř `cd web && npm ci --no-audit --no-fund && npm run check && npm run test && npm run build`; výsledky připoj do PR. Pokud nejsou nástroje dostupné, označ NOT RUN.
5. Ověř `git diff --name-only BASE_SHA...HEAD`: přesně povolené 2 soubory. Vytvoř PR do `main` jako draft a předej integrátorovi. Neprováděj merge.

## Závazné ochrany

- Žádný `Math.random()` v doménové logice; vždy předaný seedovaný generátor.
- Všechny veřejné vstupy validovat; immutable data, deterministické pořadí, rozumné caps, bez skrytého fallbacku měnícího výsledek.
- Character-only IndexedDB save v8 **nedotýkat se**; požadavky na budoucí save migraci jen vysvětlit.
- CS/EN data = stabilní klíče; lokální překlady nerozšiřovat bez integrátora.
- Vlastní kód GPL-3.0-only; externí assety/dep nepřidávat.
- `web/src/game/inventory/equipmentRules.ts` nemá importovat jiné nově přidané moduly této vlny.
- Překryv write-setů mezi agenty je nula. Jednotkové testy mohou importovat existující `web/src/game/data/**`, ale nesmějí je upravovat.
- V popisu PR uveď předpoklady, kvantifikované testy, TDD RED→GREEN a tento integrační handoff:

Připojení přes GameCommand, Player deriveStats a UI (Svelte), jen integrační owner.

## Prompt pro programovacího agenta

> Jsi **Agent 19** pro Aether & Ruin, zpracováváš původní **Prompt 15 — Inventář a výbava** v `Nereziel/dark_fantasy_2d_arpg`. Přečti `docs/plan/agents/19/TASK.md`, `docs/plan/agents/WAVE_C.md`, `AGENTS.md` a originální `2d_arpg_implementation_prompts.md`. Z přesného společného BASE_SHA main od integrátora vytvoř vlastní `agent/19-prompt-15` branch/worktree. Pomocí TDD implementuj **výhradně** `web/src/game/inventory/equipmentRules.ts` a `web/tests/unit/Agent19EquipmentRules.test.ts`, s invalid-input a deterministickými testy. Neimportuj nové moduly jiných agentů, neměň simulaci/UI/save/locale/CI. Spusť dostupné check/test/build, otevři pouze draft PR, napiš přesné výsledky a integrační kontrakt. **Nikdy neslučuj do main.**
