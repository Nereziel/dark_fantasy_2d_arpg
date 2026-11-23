# Instrukce pro programovací agenty

Projekt: **Aether & Ruin** (`Nereziel/dark_fantasy_2d_arpg`).

Produktové zadání je v [implementačních promptech](2d_arpg_implementation_prompts.md). Aktuální pořadí práce a přejímku určuje [roadmapa](docs/ROADMAP.md) a ověřené změny eviduje [stav implementace](docs/IMPLEMENTATION_STATUS.md). Před převzetím úkolu ověř jeho stav v `main` a souvisejících GitHub issues/PR. Pro koordinovanou paralelní práci platí [plán agentů](docs/plan/agents/README.md).

- Pracuj ve **vlastní větvi / worktree**, nikdy přímo do `main`.
- Zapisuj **pouze** soubory uvedené jako povolené v zadání. Jestli potřebuješ jiný soubor, zastav se a požádej integrátora o změnu rozsahu.
- Před úpravou napiš selhávající test (TDD), po úpravě ověř typy, jednotkové testy i build.
- Pro nové vlny používej [workflow a cache runbook](docs/plan/agents/WORKFLOW_CACHE.md): izolované worktree, sdílenou npm download cache a stupňovanou validaci. Výsledky CI platí jen pro přesné SHA.
- Neměň sdílené API, schéma uložených postav ani pravidla licence bez schválení integrátora.
- `CharacterProgress` je character save v11 s migracemi webových formátů v8–v10. Seed, objevená mapa, checkpointy a vybrané trvalé údaje světa jsou v samostatném per-character záznamu v1. Do obou záznamů patří pouze validovaná trvalá data popsaná v Promptu 45.
- Zachovej CS/EN, determinismus simulace a GPL-3.0-only pro vlastní tvorbu; licence externích zdrojů musí být respektované.
- Jednotliví pracovníci **nesmějí** slučovat PR ani spouštět deployment. Jediný vlastník integrace je koordinátor.

Pokud nejsi explicitně přidělen ke konkrétnímu agentu NN, **nespouštěj žádný z těchto pracovních balíčků sám**.
