# Aether & Ruin — roadmapa v3

[Implementační prompty 01–63](../2d_arpg_implementation_prompts.md) definují funkční zadání a závazné architektonické kontrakty. [Architektura](ARCHITECTURE.md) popisuje vrstvy a stav migrace. [Stav implementace](IMPLEMENTATION_STATUS.md) eviduje ověřené změny.

**Jediný živý řídicí tracker je [#119](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/119).** Tento soubor je jeho stabilní zrcadlo pořadí a bran; aktuální SHA, CI a průběh jsou v issues. Čísla promptů jsou trvalé identifikátory, nikoli pořadí práce.

Cíl: původní browserové 2.5D izometrické ARPG (2:1), šest tříd, CS/EN, kompletní procedurální Akt I. Pět aktů je dlouhodobý rozsah. Do výslovného schválení G5 uživatelem **žádné plánování, data, implementace ani integrace Aktu II–V**. Žádná síťová hra ani nový engine bez schválení.

## Pořadí práce (G0–G5)

| Brána | Vlastníci a rozsah | Podmínka dokončení |
| --- | --- | --- |
| **G0 · Stabilizace** | #250 → #252 → #253 | Dokončit existující PR v pořadí, ověřit aktuální main, přesný HEAD, kompletní CI, merge a postmerge kontrolu. |
| **G1 · Technická izometrie** | #210, #153, technická část #112/#124/#128 | 2:1 projekce, kamera, pointer a held movement, picking NPC/loot/portálů, depth/roof cutaway, funkční 8-směrný atlas a bojové animace, camera culling/streaming, desktop/touch/keyboard, map-only fog. Natural průchod stávajícím příběhem v izometrii, multi-seed a performance baseline. G1/E2 přepne default na izometrii a E3 odstraní classic renderer i výběr pohledu. Nasazení a postup do G2 až po přesné CI a technické přejímce G1/E. |
| **G2 · Kompletní obsah a populace** | #208 → #207 → #208 session; #113 | Tři obydlená sídla, tři odlišné dungeony, cesty, NPC, questy, svatyně, waypointy, eventy; prostorové skupiny namísto běžných globálních vln; nový seed při novém launch, trvalá postava, jednorázové odměny. Striktní 1000-seed sweep po změnách geometrie/populace. |
| **G3 · Herní systémy a balance** | #108 (přehodnotit #206 po #207), #126, #123 (včetně #173), #101, #114, #110 jen Act I | Šest tříd, skilly/talenty, loot, obtížnost, ekonomika, crafting, inventář, HUD, ovládání. Audit existujících systémů, jen chybějící rozsah. #115 pouze pokud blokuje testy, bez debug v release. |
| **G4 · Finální art, audio, polish** | #124, #128, #103, #112 | Finální licenční manifest, siluety, ikony, detailní prostředí, stíny, efekty, audio, mobilní paměť a FPS; žádný nový gameplay scope. |
| **G5 · Úplná přejímka** | #125, #113, #114, #112; regresní #120/#121/#122 | Natural celý Akt I na více seedech a všech šesti třídách, desktop + fyzický Android/iOS, CS/EN, přístupnost, výkon, save/load, exact-head CI a ověřený veřejný Pages build. Výslovné schválení uživatelem. |

## Architektonické invarianty a akceptace

- Cartesian world-space je autoritativní pro simulaci, navigaci, generování, boj a save. Phaser projektuje 2:1; kamera a inverse picking převádějí vstup do world-space. Výška je vizuální, nikoli nová navigační rovina.
- Stejná geometrie pro cesty, kolize, portály a renderery. Stabilní kotvy a identity sídel, proměnlivé biomy, hory/průsmyky a organické trasy. Hlavní cesty propojují sídla, vedlejší mohou končit či POI vynechat. Povinné cíle musí být pěšky dosažitelné.
- Stabilní sémantické identifikátory a oddělené deterministické seedy pro region, chunky, dungeony, encounters a loot. Rozdílné mine/cave/story crypt a přesný návrat ke vstupu. Bounded retry a bezpečný fallback.
- Živá populace podle biomů/POI/chunků a místností; běžné globální vlny odstranit, výjimka explicitní eventy a boss mechaniky. Oddělit simulation lifecycle od render culling, zachovat jednorázové fakty.
- Character v11 a world v1 zůstávají samostatné. Nový launch vygeneruje nový seed i u existující postavy; smrt, save, portál a cestování seed nemění. Explicitní kompatibilní same-seed restore zachová eligible world facts. Historické pozice nemigrovat povinně. Trvalá quest odměna se novým seedem neobnovuje.
- Fog of war pouze mapa/minimapa: neobjevené cesty, terén a POI skryté; žádná discovery maska či dimming v herní scéně. Přirozené překryvy a osvětlení nezávislé.
- G1 může používat funkční placeholder art, G4 dodá finální kvalitní licencované assety. G1 technické přepnutí default rendereru není G5 produktová přejímka.
- Přejímka musí zahrnout skutečný průchod Vesna → lov → Morrow → důkaz → krypta → Hollow King → Vesna, lokální questy, volitelné dungeony, loot/gear/stash/trade/crafting, waypointy, save/load. Bez debug příkazů nebo fixture jako náhrady. Fyzická mobilní a screen-reader QA nejsou nahrazeny emulací.

## Pravidla integrace

- Jeden aktivní implementační balíček a jedna brána; před novou prací kontrola otevřených PR a #119. Žádné nové souběžné feature PR bez explicitního rozhodnutí.
- Samostatná branch/worktree, vymezené soubory, RED→GREEN test-first, relevantní jednotkové a browser testy, check, build a kompletní exact-head CI. Jen integrátor merguje/deployuje.
- #119 eviduje přechody bran; dílčí issue eviduje SHA, CI, merge, vizuální QA a Pages zvlášť. Zelený CI neznamená veřejné nasazení nebo hráčskou přejímku. Docs-only změny nevyvolávají Pages deploy.
- #210 vlastní technickou izometrii, #208 obsah/session, #207 populaci, #124 finální art, #125 přejímku. #123 je jediný inventářový checklist; #173 je nahrazené. Původní prompty a promptové issues zachovat; neotvírat hotový prompt jen kvůli historickým checkboxům.
- Odloženo: #104–107 další akty, #109/#127 frakce/reaktivní svět, #111 endgame, #116–118 pozdější audit a finální kampaň. Historické specifikace zachovat, neimplementovat před schválením Aktu I.
