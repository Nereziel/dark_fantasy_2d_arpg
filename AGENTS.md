# Instrukce pro programovací agenty

Projekt: **Aether & Ruin** (`Nereziel/dark_fantasy_2d_arpg`).

Pro koordinovanou paralelní práci platí **[docs/plan/agents/README.md](docs/plan/agents/README.md)**. Wave F (agenti 28–30, Prompty 23–25) má **CORE INTEGROVANÉ herní systémy** v `main`: agentní PR #48/#50/#49, runtime streaming #51, mapa/fog/world facts #52 a procedurální dungeon #53. Viz [WAVE_F.md](docs/plan/agents/WAVE_F.md) a [INTEGRATION_F.md](docs/plan/agents/INTEGRATION_F.md). **Již sloučené agenty 01–30 znovu nespouštěj; další úkoly nových agentů vyžadují nový integrační BASE_SHA a vlastní plány.** Automatizovaná end-to-end plná Act I/dungeon přejímka, offscreen entity stream telemetry a poslední Pages/main deployment ověření zůstávají.

Wave E (agenti 25–27, Prompty 21–22) má sloučené story/wilderness jádro (#42/#41/#43 a runtime #44/#45; dokumentace #46). Uživatel ručně prošel Akt I, ale automatický úplný no-debug E2E a živé volitelné world treasure/event interactions nejsou zatím doloženy. Wave D (22–24) a starší A–C jsou archivovány. Každý **budoucí** agent přečte nové `TASK.md`, příslušnou `WAVE_*.md`, `INTEGRATION_*.md`, `WORKFLOW_CACHE.md`, originální prompt a `AGENTS.md`. **Waypoint fast travel není součástí Wave F, patří až Promptu 36.**

- Pracuj ve **vlastní větvi / worktree**, nikdy přímo do `main`.
- Zapisuj **pouze** soubory uvedené jako povolené v zadání. Jestli potřebuješ jiný soubor, zastav se a požádej integrátora o změnu rozsahu.
- Před úpravou napiš selhávající test (TDD), po úpravě ověř typy, jednotkové testy i build.
- Pro nové vlny používej [workflow a cache runbook](docs/plan/agents/WORKFLOW_CACHE.md): izolované worktree, sdílenou npm download cache a stupňovanou validaci. Výsledky CI platí jen pro přesné SHA.
- Neměň sdílené API, schéma uložených postav ani pravidla licence bez schválení integrátora.
- Aktuální `CharacterProgress` je **character-only save v11** s migracemi v8/v9/v10, nezachovává world seed, transient combat, chest loot ani dungeon snapshot. Agent pouze definuje čisté session/map/world fact struktury; případné dlouhodobé world-instance uložení, fog state a novou save verzi řeší výhradně integrátor explicitně, bez rozbití stávajícího load chování.
- Zachovej CS/EN, determinismus simulace a GPL-3.0-only pro vlastní tvorbu; licence externích zdrojů musí být respektované.
- Jednotliví pracovníci **nesmějí** slučovat PR ani spouštět deployment. Jediný vlastník integrace je koordinátor.

Pokud nejsi explicitně přidělen ke konkrétnímu agentu NN, **nespouštěj žádný z těchto pracovních balíčků sám**.
