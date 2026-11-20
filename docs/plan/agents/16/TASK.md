# Agent 16 — Prompt 12: XP a levelování

**Stav:** připraveno pro samostatnou větev; agent není spuštěn. **Nesmí mergeovat PR.**
**Výchozí commit:** přesný `BASE_SHA` musí koordinátor zaznamenat z `main` PO merge integračního PR #21; všech šest agentů startuje ze stejného SHA.

## Jediné povolené soubory

1. `web/src/game/progression/progressionRules.ts`
2. `web/tests/unit/Agent16ProgressionRules.test.ts`

**Nesmíš vytvořit/měnit žádný třetí soubor**, ani AGENTS.md, README, společné testy, shared types, i18n, GameSimulation, SaveRepository, web/package.json, workflow, soubory ostatních agentů. Soubor vytvoř, pouze pokud na BASE_SHA neexistuje. Kolidující nebo chybějící API → popsání blokátoru v PR, nikoli zásah do sdílených souborů.

## Cíl

Realizuj **izolovaný, plně otestovaný doménový modul** Promptu 12. Je to příprava pro integrátora, ne tvrzení o dokončené runtime acceptance.

- Odděl XP křivky a růst atributů od Player a GameSimulation. Čisté TypeScript funkce; bez save/UI.
- XP ze zabití, questů, průzkumu, dungeonů a událostí, deterministický poměr level/obtížnost.
- Při level-up poskytni skill/talent pointy a data pro růst základních atributů (nikoliv jejich přímý zápis); škálování a hard-cap.
- Nepřepisuj aktuální pravidlo `xp < level * 80` v runtime: navrhni migrační adaptér pro koordinátora v PR.
- Testy: hranice levelu, multi-level gain, 0/NaN/Infinity, overflow, strop levelu, 2 stejné vstupy = stejný výstup.

## Požadované rozhraní

Navrhni a exportuj smysluplná typed API odpovídající:
`xpRequiredForLevel(level), awardProgression(state, xp), rewardForActivity(kind, difficulty, level), levelGrowth(classId, level)`.

Názvy lze zpřesnit, ale vždy v PR výslovně uveď finální funkce/typy, hraniční chování a způsob integrace. Bez simulace, Phaser/Svelte/UI a nových závislostí.

## Práce krok po kroku

1. Přečti `AGENTS.md`, `docs/plan/agents/WAVE_C.md`, `docs/plan/agents/INTEGRATION_C.md`, originální Prompt 12, existující typy/konvence, svoje TASK.md.
2. Z `BASE_SHA` vytvoř větev `agent/16-prompt-12` a samostatný worktree; nezačínej z cizí feature větve.
3. Napiš červené Vitest testy ve svém *jediném* testovacím souboru; poté implementuj čistý modul. TDD. Testy musí zohlednit neplatné vstupy a nekonečné hodnoty.
4. Ověř `cd web && npm ci --no-audit --no-fund && npm run check && npm run test && npm run build`; výsledky připoj do PR. Pokud nejsou nástroje dostupné, označ NOT RUN.
5. Ověř `git diff --name-only BASE_SHA...HEAD`: přesně povolené 2 soubory. Vytvoř PR do `main` jako draft a předej integrátorovi. Neprováděj merge.

## Závazné ochrany

- Žádný `Math.random()` v doménové logice; vždy předaný seedovaný generátor.
- Všechny veřejné vstupy validovat; immutable data, deterministické pořadí, rozumné caps, bez skrytého fallbacku měnícího výsledek.
- Character-only IndexedDB save v8 **nedotýkat se**; požadavky na budoucí save migraci jen vysvětlit.
- CS/EN data = stabilní klíče; lokální překlady nerozšiřovat bez integrátora.
- Vlastní kód GPL-3.0-only; externí assety/dep nepřidávat.
- `web/src/game/progression/progressionRules.ts` nemá importovat jiné nově přidané moduly této vlny.
- Překryv write-setů mezi agenty je nula. Jednotkové testy mohou importovat existující `web/src/game/data/**`, ale nesmějí je upravovat.
- V popisu PR uveď předpoklady, kvantifikované testy, TDD RED→GREEN a tento integrační handoff:

Plán integrace do GameSimulation.awardExperience, CharacterProgress v8→nový save se samostatnou migrací až po rozhodnutí integrátora, UI XP progress.

## Prompt pro programovacího agenta

> Jsi **Agent 16** pro Aether & Ruin, zpracováváš původní **Prompt 12 — XP a levelování** v `Nereziel/dark_fantasy_2d_arpg`. Přečti `docs/plan/agents/16/TASK.md`, `docs/plan/agents/WAVE_C.md`, `AGENTS.md` a originální `2d_arpg_implementation_prompts.md`. Z přesného společného BASE_SHA main od integrátora vytvoř vlastní `agent/16-prompt-12` branch/worktree. Pomocí TDD implementuj **výhradně** `web/src/game/progression/progressionRules.ts` a `web/tests/unit/Agent16ProgressionRules.test.ts`, s invalid-input a deterministickými testy. Neimportuj nové moduly jiných agentů, neměň simulaci/UI/save/locale/CI. Spusť dostupné check/test/build, otevři pouze draft PR, napiš přesné výsledky a integrační kontrakt. **Nikdy neslučuj do main.**
