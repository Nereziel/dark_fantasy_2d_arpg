# Aether & Ruin — roadmapa

[Implementační prompty](../2d_arpg_implementation_prompts.md) definují požadované chování.
[Stav implementace](IMPLEMENTATION_STATUS.md) eviduje integraci a ověření.
[Roadmapa na GitHubu #119](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/119) sleduje jednotlivé úkoly a jejich historii.

Cílem je původní browserové ARPG s ovládáním myší, šesti třídami, pěti akty, seedovanými lokacemi a češtinou i angličtinou. V této etapě hra běží pro jednoho hráče na statickém hostingu. Změny počtu tříd a síťová hra vyžadují samostatné produktové rozhodnutí.

## Pořadí práce

| Fáze | Obsah a rozhodující ověření |
| --- | --- |
| **F0 · Stabilní Akt I** | Dokončit [přejímku Aktu I #125](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/125). Doložit celý příběh běžnými herními příkazy, kontrolu HUDu, inventáře a čitelnosti boje. Ověřit funkční veřejné nasazení oprav. |
| **F1 · Ovládání, výbava a prezentace** | Dokončit [doplňky vstupu #153](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/153), [hotbar a presety #126](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/126), [výtvarný směr #124](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/124) a přejímku audia (48). Souběžně lze měřit výkon (57), doplňovat regresní testy (58–59) a izolované vývojové nástroje (60). Rozsah obtížnosti (53) a legendárních předmětů (55) postupně odvozovat z ověřených herních scénářů. |
| **F2 · Akty II–V** | Prompty 49 → 50 → 51 → 52. Každý akt dodá průchozí region, vlastní herní mechaniku, dokončitelnou linii, bosse a uložení postupu. Před integrací Aktu II ověřit návaznost na F0, kompatibilitu uložení (45) a seedovou validaci (58) pro nový region. |
| **F3 · Hloubka a endgame** | Frakce (54) a [reaktivní svět #127](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/127) podle potřeb kampaně. Opakovatelná výzva (56) až po dokončení Aktu V a funkčním škálování a odměnách (53, 55). |
| **F4 · Přejímka vydání** | Výkon a regresní sady (57–59), oddělení vývojových nástrojů (60), architektonická revize bez netcode (61), celý vydávací průchod (62) a audit (63). |

Čísla promptů jsou trvalé odkazy na funkční zadání. Pořadí integrace určují skutečné závislosti, například lifecycle uložení před dalším aktem a ověřený přechod před rozšiřováním kampaně.

## F0 · Přejímka aktuálního buildu

- [ ] **Průchod příběhem.** Od Vesny přes povinný lov a Morrowa až po získání důkazu, kryptu, Hollow Kinga, návrat portálem a závěrečný rozhovor. Po Save/Load zůstane postup, identita výbavy a jednorázové odměny. [PR #194](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/194) pokrývá finále v prohlížeči, [PR #196](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/196) opravuje blokaci povinné vlny nepovinným minibossem.
- [ ] **Veřejné nasazení.** U buildu s opravami [#195](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/195) a #196 ověřit úspěšný job `deploy` a veřejný průchod portálem kolem překážek. Zaznamenat commit buildu a odkaz na nasazení.
- [ ] **HUD a výbava.** Ověřit ovladatelný HUD, dialogy a inventář na desktopu, fyzickém Androidu a iPhonu v portrétu i na šířku. Projít vybavení a výměnu obouruční zbraně, plný batoh, přesun mezi batohem a úschovnou, srovnání prstenů a identitu po načtení. [#101](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/101) · [#123](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/123) · [#173](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/173)
- [ ] **Přístupnost a čitelnost.** Klávesnicí a čtečkou ověřit dosažitelnost akcí, pojmenování a návrat fokusu. V boji ověřit varování útoků, zásahy, změnu fáze bosse a omezené efekty při zapnutém nastavení sníženého pohybu. [#125](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/125) · [#128](https://github.com/Nereziel/dark_fantasy_2d_arpg/issues/128)

## První přírůstek Aktu II

1. Propojit dokončený rozhovor s Vesnou s dosažitelným vstupem do The Rotting Marshes. Ověřit zamčený vstup před dokončením Aktu I a jeho odemčení i po Save/Load.
2. Dodat jeden průchozí úsek s úvodním úkolem, novou čitelnou mechanikou oblasti a reprezentativním setkáním. Použít stávající simulaci, projekce HUDu, uložení a lokalizaci.
3. Doplnit zbytek regionu, minibossy a Mother of Decay z [Promptu 49](../2d_arpg_implementation_prompts.md#prompt-49--act-ii-region). Celý prompt uzavřít až s přirozeným průchodem, zachováním odměn po načtení a doloženými průchozími seedy.

U každé přejímky evidovat commit, rozsah testu a výsledek. V poznámkách uvádět, zda je změna v draftu, integrovaná v `main`, ověřená skutečným hraním a nasazená na Pages. Jeden údaj nenahrazuje ostatní.
