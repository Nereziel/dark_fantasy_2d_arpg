# Instrukce pro programovací agenty

Projekt: **Aether & Ruin** (`Nereziel/dark_fantasy_2d_arpg`).

Pro koordinovanou paralelní práci platí **[docs/plan/agents/README.md](docs/plan/agents/README.md)**. **Aktuální Wave G (agenti 31–33, Prompty 26–28) je PŘIPRAVENA jako plán, nikoli již implementována:** závazný [WAVE_G.md](docs/plan/agents/WAVE_G.md), [INTEGRATION_G.md](docs/plan/agents/INTEGRATION_G.md) a `docs/plan/agents/{31,32,33}/TASK.md`. **Agenti nesmí začít před merge plánovacího PR a doručením jediného nového 40-char BASE_SHA z aktuálního main**. Každý má izolovaný worktree a výhradně 2 soubory; jen draft PR, žádné runtime změny. Agenti 01–30 již dokončili své izolované moduly a **nesmějí být znovu spuštěni**.

Wave F (agenti 28–30, Prompty 23–25) má **CORE INTEGRATED** systémy v `main`: agentní PR #48/#50/#49, runtime streaming #51, mapa/fog/world facts #52, procedurální dungeon #53, dokumentace #54. Wave E (25–27, Prompty 21–22) má story/wilderness jádro. Full browser Act I/dungeon boss playthrough bez fixture, offscreen entity streaming a performance telemetry, live optional treasure/event interactions, a potvrzení posledního Pages deploymentu zůstávají nepokryté acceptance. Neoznačovat je za hotové jen díky nové Wave G. Každý budoucí agent si přečte nové `TASK.md`, `WAVE_G.md`, `INTEGRATION_G.md`, `WORKFLOW_CACHE.md`, originální prompt a `AGENTS.md`. **Waypoint fast travel je až Prompt 36.**

- Pracuj ve **vlastní větvi / worktree**, nikdy přímo do `main`.
- Zapisuj **pouze** soubory uvedené jako povolené v zadání. Jestli potřebuješ jiný soubor, zastav se a požádej integrátora o změnu rozsahu.
- Před úpravou napiš selhávající test (TDD), po úpravě ověř typy, jednotkové testy i build.
- Pro nové vlny používej [workflow a cache runbook](docs/plan/agents/WORKFLOW_CACHE.md): izolované worktree, sdílenou npm download cache a stupňovanou validaci. Výsledky CI platí jen pro přesné SHA.
- Neměň sdílené API, schéma uložených postav ani pravidla licence bez schválení integrátora.
- Aktuální `CharacterProgress` je **character-only save v11** s migracemi v8/v9/v10, nezachovává world seed, transient combat, chest loot ani dungeon snapshot. Agent pouze definuje čisté session/map/world fact struktury; případné dlouhodobé world-instance uložení, fog state a novou save verzi řeší výhradně integrátor explicitně, bez rozbití stávajícího load chování.
- Zachovej CS/EN, determinismus simulace a GPL-3.0-only pro vlastní tvorbu; licence externích zdrojů musí být respektované.
- Jednotliví pracovníci **nesmějí** slučovat PR ani spouštět deployment. Jediný vlastník integrace je koordinátor.

Pokud nejsi explicitně přidělen ke konkrétnímu agentu NN, **nespouštěj žádný z těchto pracovních balíčků sám**.
