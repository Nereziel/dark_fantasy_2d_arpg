# Instrukce pro programovací agenty

Projekt: **Aether & Ruin** (`Nereziel/dark_fantasy_2d_arpg`).

Produktové zadání je v [implementačních promptech](2d_arpg_implementation_prompts.md). Aktuální pořadí práce a přejímku určuje [roadmapa](docs/ROADMAP.md) a ověřené změny eviduje [stav implementace](docs/IMPLEMENTATION_STATUS.md). Před převzetím úkolu ověř jeho stav v `main` a souvisejících GitHub issues/PR. [Roadmapa #119](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/119) je jediný živý řídicí tracker; soubor roadmapy je stabilní zrcadlo. Historické agentní vlny jsou pouze referenční, dokud nejsou výslovně povolené v aktivní bráně.

- Pořadí G0 → G1 technická izometrie → G2 kompletní obsah a populace Aktu I → G3 balance → G4 finální art/audio → G5 hráčská přejímka. Před zahájením ověř otevřená PR a aktivní bránu v #119; jediný aktivní implementační balíček, bez nových paralelních feature PR bez explicitního rozhodnutí. Původní promptová čísla jsou identifikátory, ne pořadí. Žádné plánování, příprava ani implementace Aktu II–V do výslovného schválení G5 uživatelem.
- Simulace, navigace, kolize, boj a save používají Cartesian world-space; Phaser 2:1 projekci a inverse picking. Renderer nevlastní gameplay a vizuální výška nemění collision. Fog pouze mapa/minimapa. G1/E2 připraví izometrii jako výchozí pohled; před nasazením ověřit technickou přejímku na přesném SHA. Classic pouze dočasný interní fallback (`?view=classic`); po přejímce G1/E odstranit v ověřeném E3 cleanup PR před G2, nikoli až v G5.
- G2 target: nový launch = nový seed i existující postavy, same-seed restore pouze kompatibilních world facts; smrt, portál, travel a save seed nemění. Žádné běžné globální vlny po dokončení #207, pouze explicitní event/boss vlny. Oddělit render culling od autoritativního lifecycle.
- Pracuj ve **vlastní větvi / worktree**, nikdy přímo do `main`.
- Zapisuj **pouze** soubory uvedené jako povolené v zadání. Jestli potřebuješ jiný soubor, zastav se a požádej integrátora o změnu rozsahu.
- Před úpravou napiš selhávající test (TDD), po úpravě ověř typy, jednotkové testy i build.
- Pro nové vlny používej [workflow a cache runbook](docs/plan/agents/WORKFLOW_CACHE.md): izolované worktree, sdílenou npm download cache a stupňovanou validaci. Výsledky CI platí jen pro přesné SHA.
- Neměň sdílené API, schéma uložených postav ani pravidla licence bez schválení integrátora.
- `CharacterProgress` je character save v11 s migracemi webových formátů v8–v10. Seed, objevená mapa, checkpointy a vybrané trvalé údaje světa jsou v samostatném per-character záznamu v1. Do obou záznamů patří pouze validovaná trvalá data popsaná v Promptu 45.
- Zachovej CS/EN, determinismus simulace a GPL-3.0-only pro vlastní tvorbu; licence externích zdrojů musí být respektované.
- Jednotliví pracovníci **nesmějí** slučovat PR ani spouštět deployment. Jediný vlastník integrace je koordinátor.

Pokud nejsi explicitně přidělen ke konkrétnímu agentu NN, **nespouštěj žádný z těchto pracovních balíčků sám**.
