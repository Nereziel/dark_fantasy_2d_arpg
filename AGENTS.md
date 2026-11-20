# Instrukce pro programovací agenty

Projekt: **Aether & Ruin** (`Nereziel/dark_fantasy_2d_arpg`).

Pro koordinovanou paralelní práci platí **[docs/plan/agents/README.md](docs/plan/agents/README.md)**. **Aktuální Wave F (3 agenti 28–30, Prompty 23–25) je připravena, ale agentní implementace zatím nezačala:** závazný [WAVE_F.md](docs/plan/agents/WAVE_F.md), [INTEGRATION_F.md](docs/plan/agents/INTEGRATION_F.md) a vlastní `docs/plan/agents/{28,29,30}/TASK.md`. Všichni používají **stejný dispatch-time main BASE_SHA**, izolované worktree a výhradně své dva soubory; nikdy neprovádějí runtime integraci.

Wave E (agenti 25–27, Prompty 21–22) je integrovaná (PR #42/#41/#43 + runtime #44/#45; closeout #46), manuální průchod Aktem I potvrdil uživatel. Automatický full no-debug Act I browser E2E a interaktivní volitelné POI zůstávají k dokončení, proto neoznačovat všechny acceptance podmínky za splněné. Historická Wave D (agenti 22–24) je rovněž integrovaná; starší vlny A–C jsou archivované. Znovu nespouštěj úkoly agentů 01–27. Každý nový agent musí nejprve přečíst aktuální `AGENTS.md`, `README.md`, `WAVE_F.md`, `INTEGRATION_F.md`, `WORKFLOW_CACHE.md`, své `TASK.md` a originální Prompt v `2d_arpg_implementation_prompts.md`. **Waypoint fast travel je až Prompt 36.**

- Pracuj ve **vlastní větvi / worktree**, nikdy přímo do `main`.
- Zapisuj **pouze** soubory uvedené jako povolené v zadání. Jestli potřebuješ jiný soubor, zastav se a požádej integrátora o změnu rozsahu.
- Před úpravou napiš selhávající test (TDD), po úpravě ověř typy, jednotkové testy i build.
- Pro nové vlny používej [workflow a cache runbook](docs/plan/agents/WORKFLOW_CACHE.md): izolované worktree, sdílenou npm download cache a stupňovanou validaci. Výsledky CI platí jen pro přesné SHA.
- Neměň sdílené API, schéma uložených postav ani pravidla licence bez schválení integrátora.
- Aktuální `CharacterProgress` je **character-only save v11** s migracemi v8/v9/v10, nezachovává world seed, transient combat, chest loot ani dungeon snapshot. Agent pouze definuje čisté session/map/world fact struktury; případné dlouhodobé world-instance uložení, fog state a novou save verzi řeší výhradně integrátor explicitně, bez rozbití stávajícího load chování.
- Zachovej CS/EN, determinismus simulace a GPL-3.0-only pro vlastní tvorbu; licence externích zdrojů musí být respektované.
- Jednotliví pracovníci **nesmějí** slučovat PR ani spouštět deployment. Jediný vlastník integrace je koordinátor.

Pokud nejsi explicitně přidělen ke konkrétnímu agentu NN, **nespouštěj žádný z těchto pracovních balíčků sám**.
