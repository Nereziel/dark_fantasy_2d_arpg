# Instrukce pro programovací agenty

Projekt: **Aether & Ruin** (`Nereziel/dark_fantasy_2d_arpg`).

Pro koordinovanou paralelní práci platí **[docs/plan/agents/README.md](docs/plan/agents/README.md)** a **[docs/plan/agents/INTEGRATION.md](docs/plan/agents/INTEGRATION.md)**. Každý přidělený agent musí nejprve přečíst svůj `docs/plan/agents/NN/TASK.md` a původní prompt v `2d_arpg_implementation_prompts.md`.

- Pracuj ve **vlastní větvi / worktree**, nikdy přímo do `main`.
- Zapisuj **pouze** soubory uvedené jako povolené v zadání. Jestli potřebuješ jiný soubor, zastav se a požádej integrátora o změnu rozsahu.
- Před úpravou napiš selhávající test (TDD), po úpravě ověř typy, jednotkové testy i build.
- Neměň sdílené API, schéma uložených postav ani pravidla licence bez schválení integrátora.
- Soubojový a světový stav se neukládají; perzistentní je pouze postava a její pokrok. Nesnaž se podporovat staré save formáty.
- Zachovej CS/EN, determinismus simulace a GPL-3.0-only pro vlastní tvorbu; licence externích zdrojů musí být respektované.
- Jednotliví pracovníci **nesmějí** slučovat PR ani spouštět deployment. Jediný vlastník integrace je koordinátor.

Pokud nejsi explicitně přidělen ke konkrétnímu agentu NN, **nespouštěj žádný z těchto pracovních balíčků sám**.
