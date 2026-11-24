# Aether & Ruin — roadmapa

[Implementační prompty](../2d_arpg_implementation_prompts.md) definují požadované chování.
[Stav implementace](IMPLEMENTATION_STATUS.md) eviduje integraci a ověření.
[Roadmapa na GitHubu #119](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/119) sleduje jednotlivé úkoly a jejich historii.

Cílem je původní browserové ARPG s ovládáním myší, šesti třídami, pěti akty, seedovanými lokacemi a češtinou i angličtinou. V této etapě hra běží pro jednoho hráče na statickém hostingu. Změny počtu tříd a síťová hra vyžadují samostatné produktové rozhodnutí.

## Závazná priorita — pouze Akt I (24. 11. 2026)

Akt I musí být plnohodnotný, vyladěný samostatný celek. Dokud uživatel výslovně neschválí jeho úplnou přejímku (#125), **neplánovat, nepřipravovat data, neimplementovat ani neintegrovat Akt II–V**. Zelené CI ani dokončitelný hlavní quest samotné nejsou přejímkou. Tato podmínka má přednost před staršími plány.

## Pořadí práce

| Fáze | Obsah a rozhodující ověření |
| --- | --- |
| **F0 · Stabilní Akt I** | Dokončit [přejímku Aktu I #125](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/125). Doložit celý příběh běžnými herními příkazy, kontrolu HUDu, inventáře a čitelnosti boje. Ověřit funkční veřejné nasazení oprav. |
| **F1 · Ovládání, výbava a prezentace** | Dokončit [doplňky vstupu #153](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/153), [hotbar a presety #126](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/126), [výtvarný směr #124](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/124) a přejímku audia (48). Souběžně lze měřit výkon (57), doplňovat regresní testy (58–59) a izolované vývojové nástroje (60). Rozsah obtížnosti (53) a legendárních předmětů (55) postupně odvozovat z ověřených herních scénářů. |
| **F1.5 · Kompletní procedurální Akt I** | [#208](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/208) celá topologie, sídla, NPC, questy, cesty, dungeony, eventy, svatyně a nový seed po spuštění; [#207](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/207) populace; [#121](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/121) fog; [#124](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/124) tilemapy a art. Následně skutečný balance #108, loot, UI, audio, výkon a plná přejímka. Tato fáze má nejvyšší aktuální prioritu. |
| **F2 · Akty II–V** | STOP — žádná práce do výslovného schválení kompletního Aktu I uživatelem. |
| **F3 · Hloubka a endgame** | Frakce (54) a [reaktivní svět #127](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/127) podle potřeb kampaně. Opakovatelná výzva (56) až po dokončení Aktu V a funkčním škálování a odměnách (53, 55). |
| **F4 · Přejímka vydání** | Výkon a regresní sady (57–59), oddělení vývojových nástrojů (60), architektonická revize bez netcode (61), celý vydávací průchod (62) a audit (63). |

Čísla promptů jsou trvalé odkazy na funkční zadání. Pořadí integrace určují skutečné závislosti, například lifecycle uložení před dalším aktem a ověřený přechod před rozšiřováním kampaně.

## F0 · Přejímka aktuálního buildu

- [ ] **Průchod příběhem.** Od Vesny přes povinný lov a Morrowa až po získání důkazu, kryptu, Hollow Kinga, návrat portálem a závěrečný rozhovor. Po Save/Load zůstane postup, identita výbavy a jednorázové odměny. [PR #194](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/194) pokrývá finále v prohlížeči, [PR #196](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/196) opravuje blokaci povinné vlny nepovinným minibossem.
- [ ] **Veřejné nasazení.** U buildu s opravami [#195](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/195) a #196 ověřit úspěšný job `deploy` a veřejný průchod portálem kolem překážek. Zaznamenat commit buildu a odkaz na nasazení.
- [ ] **HUD a výbava.** Ověřit ovladatelný HUD, dialogy a inventář na desktopu, fyzickém Androidu a iPhonu v portrétu i na šířku. Projít vybavení a výměnu obouruční zbraně, plný batoh, přesun mezi batohem a úschovnou, srovnání prstenů a identitu po načtení. [#101](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/101) · [#123](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/123) · [#173](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/173)
- [ ] **Přístupnost a čitelnost.** Klávesnicí a čtečkou ověřit dosažitelnost akcí, pojmenování a návrat fokusu. V boji ověřit varování útoků, zásahy, změnu fáze bosse a omezené efekty při zapnutém nastavení sníženého pohybu. [#125](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/125) · [#128](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/128)

## F1.5 · Rozhodující požadavky na Akt I

- [ ] [#210](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/210): přechod na 2.5D izometrickou prezentaci (2:1), ověřit obousměrnou projekci, kameru, pointer picking, řazení podle hloubky, izometrické assety a všechny efekty. Simulace zůstává v Cartesian world-space; produkční renderer přepnout až po ověření. Datový generátor #208 může pracovat nezávisle, runtime a art integrace až po ověření izometrie.

- [ ] Každá nová herní relace po spuštění má nový seed; stejný seed reprodukuje celý svět. Během relace se svět nemění kvůli smrti, cestování, ukládání nebo vstupu do dungeonu. Zachovat postavu a jednorázový quest postup, oddělit session stav. Historické pozice není nutné migrovat.
- [ ] Generovaný region má předem určené přibližné kotvy hlavních sídel a NPC, proměnlivé biomy, terén, cesty, hlavní i vedlejší úkoly, dungeony, eventy, svatyně a waypointy. Hory, lesy a další překážky mohou vynutit obchvat; hlavní cesty propojují sídla, vedlejší stezky mohou slepě končit u srubu, dolu, domu či mýtiny. Některé jeskyně a POI leží mimo cesty. Všechny povinné cíle jsou dosažitelné pěšky, ne nutně po silnici. Stejná geometrie řídí cesty, kolize i vykreslení.
- [ ] Běžní nepřátelé tvoří skupiny rozmístěné v regionu a dungeonech; běžné globální vlny odstranit, zachovat je jen u explicitních událostí. Aktivní budget, stabilní ID a žádná duplikace jednorázových odměn.
- [ ] Skutečné vrstvené tilemapy, jednotný pixel art, čitelné prostředí. Fog of war pouze na velké mapě a minimapě: neprozkoumané cesty, terén a POI zůstávají skryté, známé oblasti viditelné. Herní scéna nemá discovery masku; zobrazuje prostředí v záběru kamery s běžnými překryvy objektů a atmosférickým osvětlením.
- [ ] Vyladěné třídy, loot, ekonomika, questy, AI, bossové, audio, UI, ovládání, výkon a přístupnost. Kompletní přirozený průchod na několika seedech, desktop i fyzická mobilní zařízení, CS/EN, přesný CI a veřejný build. Výslovná hráčská přejímka #125.

U každé přejímky evidovat commit, rozsah testu a výsledek. V poznámkách uvádět, zda je změna v draftu, integrovaná v `main`, ověřená skutečným hraním a nasazená na Pages. Jeden údaj nenahrazuje ostatní.
