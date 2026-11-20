# Instrukce pro programovací agenty

Projekt: **Aether & Ruin** (`Nereziel/dark_fantasy_2d_arpg`).

Pro koordinovanou paralelní práci platí **[docs/plan/agents/README.md](docs/plan/agents/README.md)**. Aktuálně se připravuje **vlna D (3 agenti 22–24 pro Prompty 18–20)** podle [WAVE_D.md](docs/plan/agents/WAVE_D.md) a [INTEGRATION_D.md](docs/plan/agents/INTEGRATION_D.md); starší vlny A–C jsou archivované. Každý přidělený agent musí nejprve přečíst svůj `docs/plan/agents/NN/TASK.md`, aktuální plán vlny a původní prompt v `2d_arpg_implementation_prompts.md`. Zadání vlny D je pouze plán a nespouští práci agentů.

- Pracuj ve **vlastní větvi / worktree**, nikdy přímo do `main`.
- Zapisuj **pouze** soubory uvedené jako povolené v zadání. Jestli potřebuješ jiný soubor, zastav se a požádej integrátora o změnu rozsahu.
- Před úpravou napiš selhávající test (TDD), po úpravě ověř typy, jednotkové testy i build.
- Neměň sdílené API, schéma uložených postav ani pravidla licence bez schválení integrátora.
- Soubojový a světový stav se neukládají; perzistentní je pouze postava a její pokrok. Současný character-only save v9 a již existující migrace v8→v9 nesmí být rozbity; změny save formátu smí řešit pouze integrátor.
- Zachovej CS/EN, determinismus simulace a GPL-3.0-only pro vlastní tvorbu; licence externích zdrojů musí být respektované.
- Jednotliví pracovníci **nesmějí** slučovat PR ani spouštět deployment. Jediný vlastník integrace je koordinátor.

Pokud nejsi explicitně přidělen ke konkrétnímu agentu NN, **nespouštěj žádný z těchto pracovních balíčků sám**.
