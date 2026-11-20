# Agent 21 — Prompt 17: Elitní modifikátory

**Stav:** připraveno pro samostatnou větev; agent není spuštěn. **Nesmí mergeovat PR.**
**Výchozí commit:** přesný `BASE_SHA` musí koordinátor zaznamenat z `main` PO merge integračního PR #21; všech šest agentů startuje ze stejného SHA.

## Jediné povolené soubory

1. `web/src/game/enemies/eliteModifiers.ts`
2. `web/tests/unit/Agent21EliteModifiers.test.ts`

**Nesmíš vytvořit/měnit žádný třetí soubor**, ani AGENTS.md, README, společné testy, shared types, i18n, GameSimulation, SaveRepository, web/package.json, workflow, soubory ostatních agentů. Soubor vytvoř, pouze pokud na BASE_SHA neexistuje. Kolidující nebo chybějící API → popsání blokátoru v PR, nikoli zásah do sdílených souborů.

## Cíl

Realizuj **izolovaný, plně otestovaný doménový modul** Promptu 17. Je to příprava pro integrátora, ne tvrzení o dokončené runtime acceptance.

- Data-driven: Extra Health, Increased Damage, Fast, Fire Aura, Frost/Poison attacks, Teleporting, Shielded, Regenerating, Summoner, Explodes On Death, Hazardous Ground.
- Kompozice kompatibilních max 1–3 modifierů; explicitní exclude/prerequisites, seedový RNG, stabilní ID.
- Pure TypeScript vrací stat delta a návrh status/telegraph/summon efektu pro simulation, nezasahuje do ActorSnapshot/Phaser.
- Přidej štít, periodic buff a death-explosion do plánovacích dat, ale žádné skutečné poškození mimo central typedDamage.
- Testy stacking/exclusions, CRIT/HIT hooks, death one-shot, 0 a invalid config, deterministic seed, loot quality tag.

## Požadované rozhraní

Navrhni a exportuj smysluplná typed API odpovídající:
`ELITE_MODIFIERS, rollEliteModifiers(context,rng), applyEliteStats, eliteOnHitPlan, eliteOnDeathPlan, validateEliteSet`.

Názvy lze zpřesnit, ale vždy v PR výslovně uveď finální funkce/typy, hraniční chování a způsob integrace. Bez simulace, Phaser/Svelte/UI a nových závislostí.

## Práce krok po kroku

1. Přečti `AGENTS.md`, `docs/plan/agents/WAVE_C.md`, `docs/plan/agents/INTEGRATION_C.md`, originální Prompt 17, existující typy/konvence, svoje TASK.md.
2. Z `BASE_SHA` vytvoř větev `agent/21-prompt-17` a samostatný worktree; nezačínej z cizí feature větve.
3. Napiš červené Vitest testy ve svém *jediném* testovacím souboru; poté implementuj čistý modul. TDD. Testy musí zohlednit neplatné vstupy a nekonečné hodnoty.
4. Ověř `cd web && npm ci --no-audit --no-fund && npm run check && npm run test && npm run build`; výsledky připoj do PR. Pokud nejsou nástroje dostupné, označ NOT RUN.
5. Ověř `git diff --name-only BASE_SHA...HEAD`: přesně povolené 2 soubory. Vytvoř PR do `main` jako draft a předej integrátorovi. Neprováděj merge.

## Závazné ochrany

- Žádný `Math.random()` v doménové logice; vždy předaný seedovaný generátor.
- Všechny veřejné vstupy validovat; immutable data, deterministické pořadí, rozumné caps, bez skrytého fallbacku měnícího výsledek.
- Character-only IndexedDB save v8 **nedotýkat se**; požadavky na budoucí save migraci jen vysvětlit.
- CS/EN data = stabilní klíče; lokální překlady nerozšiřovat bez integrátora.
- Vlastní kód GPL-3.0-only; externí assety/dep nepřidávat.
- `web/src/game/enemies/eliteModifiers.ts` nemá importovat jiné nově přidané moduly této vlny.
- Překryv write-setů mezi agenty je nula. Jednotkové testy mohou importovat existující `web/src/game/data/**`, ale nesmějí je upravovat.
- V popisu PR uveď předpoklady, kvantifikované testy, TDD RED→GREEN a tento integrační handoff:

Koordinátor připojí do spawn factory, damage pipeline, status runtime, render a loot table agenta 20 až po obou merge.

## Prompt pro programovacího agenta

> Jsi **Agent 21** pro Aether & Ruin, zpracováváš původní **Prompt 17 — Elitní modifikátory** v `Nereziel/dark_fantasy_2d_arpg`. Přečti `docs/plan/agents/21/TASK.md`, `docs/plan/agents/WAVE_C.md`, `AGENTS.md` a originální `2d_arpg_implementation_prompts.md`. Z přesného společného BASE_SHA main od integrátora vytvoř vlastní `agent/21-prompt-17` branch/worktree. Pomocí TDD implementuj **výhradně** `web/src/game/enemies/eliteModifiers.ts` a `web/tests/unit/Agent21EliteModifiers.test.ts`, s invalid-input a deterministickými testy. Neimportuj nové moduly jiných agentů, neměň simulaci/UI/save/locale/CI. Spusť dostupné check/test/build, otevři pouze draft PR, napiš přesné výsledky a integrační kontrakt. **Nikdy neslučuj do main.**
