# Instrukce pro programovací agenty

Projekt: **Aether & Ruin** (`Nereziel/dark_fantasy_2d_arpg`).

Pro koordinovanou paralelní práci platí **[docs/plan/agents/README.md](docs/plan/agents/README.md)**. Wave E (3 agenti 25–27, Prompty 21–22) má **integrované herní jádro** (agentní #42/#41/#43, runtime #44/#45; další full E2E acceptance pending) podle [WAVE_E.md](docs/plan/agents/WAVE_E.md) a [INTEGRATION_E.md](docs/plan/agents/INTEGRATION_E.md). Vlna D (3 agenti 22–24, Prompty 18–20) je **integrována do herního runtime** podle [WAVE_D.md](docs/plan/agents/WAVE_D.md) a [INTEGRATION_D.md](docs/plan/agents/INTEGRATION_D.md); starší vlny A–C jsou archivované. Každý přidělený agent musí nejprve přečíst svůj `docs/plan/agents/NN/TASK.md`, aktuální plán vlny a původní prompt v `2d_arpg_implementation_prompts.md`. Historická zadání vln D ani E (agenti 22–27) se znovu nespouštějí; agentní PR #30/#32/#31 a integrační PR #33/#34/#35 jsou sloučené. Úschovna byla dokončena v integračním PR #37; waypoint fast travel patří až Promptu 36.

- Pracuj ve **vlastní větvi / worktree**, nikdy přímo do `main`.
- Zapisuj **pouze** soubory uvedené jako povolené v zadání. Jestli potřebuješ jiný soubor, zastav se a požádej integrátora o změnu rozsahu.
- Před úpravou napiš selhávající test (TDD), po úpravě ověř typy, jednotkové testy i build.
- Pro nové vlny používej [workflow a cache runbook](docs/plan/agents/WORKFLOW_CACHE.md): izolované worktree, sdílenou npm download cache a stupňovanou validaci. Výsledky CI platí jen pro přesné SHA.
- Neměň sdílené API, schéma uložených postav ani pravidla licence bez schválení integrátora.
- Soubojový a světový stav se neukládají; perzistentní je pouze postava a její pokrok. Současný character-only save **v11** a migrace z **v8/v9/v10** nesmí být rozbity; změny save formátu smí řešit pouze integrátor.
- Zachovej CS/EN, determinismus simulace a GPL-3.0-only pro vlastní tvorbu; licence externích zdrojů musí být respektované.
- Jednotliví pracovníci **nesmějí** slučovat PR ani spouštět deployment. Jediný vlastník integrace je koordinátor.

Pokud nejsi explicitně přidělen ke konkrétnímu agentu NN, **nespouštěj žádný z těchto pracovních balíčků sám**.
