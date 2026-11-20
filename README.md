# Aether & Ruin

Dark-fantasy 2D ARPG pro prohlížeč. Hra se postupně převádí z původního monolitického HTML enginu na **Svelte 5 + Phaser 4 + TypeScript + Vite**.

## Hrát online

**https://nereziel.github.io/dark_fantasy_2d_arpg/**

Na GitHub Pages se nyní publikuje **nová Svelte/Phaser verze**, která je stále ve vývoji. Obsahuje výběr šesti tříd, skupinové souboje se třemi nezávislými nepřáteli, kolize a obcházení překážek, dvě původní aktivní schopnosti pro všech šest tříd (Q / pravé tlačítko a 1), přičemž válečník má nově dalších pět schopností (klávesy 2–6), efekty, úvodní trojici nepřátel (přízrak, kostlivec, vlk) a od druhé vlny i 14 datově definovaných rodových monster s různou AI a viditelným varováním před útokem, kořist, inventář, výbavu, zkušenosti, zlato a uložení nové hry. V táboře lze promluvit se strážkyní Vesnou, přijmout úvodní úkol **Popel u bran**, porazit tři nepřátele a odevzdat úkol za zlato a XP. Nově přibyli **obchodník Bram** (nákup a prodej vybavení) a **kovář Odan** (až tři trvalá vylepšení nasazené zbroje či zbraně za zlato). První hratelný dungeon **Krypta Duté koruny** má vlastní generovanou mapu, skupinu silnějších strážců a závěrečného bosse. Další dungeony, questy, talenty a rozsáhlejší herní svět se teprve převádějí.

## Lokální spuštění

Vyžaduje Node.js 22+ a npm:

```bash
cd web
npm ci
npm run dev
```

Lokální adresa: http://localhost:5173/dark_fantasy_2d_arpg/

## Ovládání

- **Levé tlačítko myši:** klik nebo **podržení pro průběžný pohyb za kurzorem**, kontextový útok, NPC, portály, truhly, svatyně a kořist. Zablokovaný cíl se přesměruje na nejbližší dosažitelné místo. Při držení je přepočet cesty omezen, aby pohyb necukal.
- **Prostřední tlačítko myši:** vynucený pohyb (bez vybírání nepřátel a NPC). Přesun řeší kolize a překážky.
- Klávesa **I**: inventář; Esc: zavření inventáře.
- Klávesa **C**: přehled postavy a všech atributů; Esc: zavření přehledu.
- **Q** nebo **pravé tlačítko myši**: první schopnost; **1** (včetně numerické klávesnice): druhá schopnost. Schopnosti používají polohu kurzoru (entity, oblast, směr či bod podle typu); vzdálenou oblast postava nejprve přiblíží. **Válečník:** klávesy **2–6** aktivují Úder do země, Válečný pokřik, Smršť čepelí, Popravu a Základní úder; každá má Rage/cooldown. Ostatní třídy stále mají dvě původní schopnosti; lektvary zůstávají plánované.
- Kliknutí na konkrétního nepřítele nebo položku v seznamu cílů: vybere nepřítele k útoku.
- Uhnutí před útokem: opusť červeně vyznačenou oblast před zásahem.
- **Shift (držet):** postava útočí na místě a nesleduje nepřítele ani nevykoná útočný dash. **Mezerník:** úskok s cooldownem. **Esc:** pauza / návrat do hry nebo zavření otevřeného panelu. V pauze lze otevřít **Ovládání**, přemapovat klávesy či myš a uložit preference pro tento prohlížeč.
- Přepnutí **Čeština / English** je v menu i při hraní.
- **Tábor:** bezpečná oblast bez útoků nepřátel. Kliknutím na NPC nebo tlačítkem v deníku úkolů lze zahájit rozhovor a přijmout úkol.
- **Úvodní úkol:** Po přijetí poraz 3 nepřátele a vrať se ke strážkyni pro odměnu. Postup se automaticky ukládá.
- **Obchod a kovář:** Klikni na NPC ve světě nebo použij tlačítka „Prohlédnout zboží“ / „Navštívit kováře“ v táboře. U Brama lze nakupovat a prodávat předměty z batohu, u Odana vylepšovat **nasazené** zbraně a zbroj.
- **Krypta Duté koruny:** Klikni na kamenný portál za táborem nebo na tlačítko „Vstoupit do krypty“. Poraz tři strážce, poté vládce krypty a jeho doprovod. Tlačítko „Vrátit se do tábora“ funguje také během boje.

### Základy podle implementačních promptů

Převod pokračuje **v pořadí 63 promptů** ze souboru `2d_arpg_implementation_prompts.md`. Funkční základy **promptů 02–06** jsou propojené: oddělené výpočty hráče, plynulý pohyb s omezením přepočtů, jednotný kontext interakcí, přemapování ovládání a typovaná soubojová pipeline. Podporuje elementální odolnosti u zásahů, úhyb, blokování, štíty, projektily, oblastní poškození a léčení. Integrační PR #20 a #21 propojují Prompty 07–11: sedm schopností válečníka, časování útoků i kouzel všech šesti tříd, původní pixelové atlasy pro jejich animace a všechny příšery, patnáct efektů, AI a odlišné schopnosti monster. Funkční implementace má automatické regresní testy; velkoprodukční ručně kreslené animace zůstávají výtvarným rozšířením. Prompty **12–17** nyní propojuje integrační [PR #28](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/28) po sloučení samostatných agentních modulů #22, #27, #23, #26, #24 a #25. Integrace pokrývá levelování, katalog vybavení, affixy, inventář, loot a elitní nepřátele; stav finální validace a nasazení je popsán v `docs/IMPLEMENTATION_STATUS.md`. Přesný přehled dokončení základů je v `docs/IMPLEMENTATION_STATUS.md`.

## Vlna D — město, ekonomika a questy

Vlna D proběhla se **třemi izolovanými agenty** (22, 23, 24). Jejich moduly (#30, #32, #31) byly sloučeny, načež je integrátor postupně propojil s hrou pomocí [PR #33 — město](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/33), [PR #34 — ekonomika](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/34) a [PR #35 — dialogy/questy](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/35). Ověřeno **488/488 unit testů, 12/12 Chromium E2E, build a typy** pro integraci #35. Navazující [PR #37](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/37) doplnil trvalou úschovnu a prošel vlastními testy a CI.

V táboře přibyly vykreslené a interaktivní postavy, léčitel (15 zlatých) a obnova bojového zdroje (12 zlatých), obojí hlídá simulace. Obchodník a kovář používají jednotnou cenovou a transakční logiku. Rozhovor se strážkyní Vesnou nyní nabízí větvené volby; první quest používá sdílené questové jádro a odměnu lze získat jen jednou. Překlady fungují v **CS/EN**. Osobní **24slotová úschovna** bezpečně přesouvá předměty mezi batohem a truhlou; s postavou se ukládá ve formátu **v10** (migrace v8/v9).

**Omezení:** waypoint má zatím jen připravené rozhraní; rychlé cestování náleží Promptu 36. Základ města s perzistentní úschovnou je nyní **core complete**. Nová dějová linie a procedurální divočina náleží Promptům **21–22**. Podrobnosti a pravdivé acceptance označení: [stav implementace](docs/IMPLEMENTATION_STATUS.md) a [integrace D](docs/plan/agents/INTEGRATION_D.md).

## Wave C — XP, vybavení, loot a elity

- Hrdina dostává XP za monstra, quest, kryptu a interakce se světem. Nová křivka podporuje více level-upů z jedné odměny; s levelem se přepočítávají základní atributy, životy, maximální zdroje a poškození. HUD ukazuje aktuální XP a přehled postavy nevyužité skill/talent body.
- Katalog obsahuje 23 základů výbavy, všech 14 typů zbraní včetně jednoručních a obouručních, šest rarit, požadavky na level, sockety a legendární vlastnosti. Dvou­ruční zbraň automaticky uvolní druhou ruku, ale pouze když lze oba vytlačené předměty bezpečně uložit do batohu.
- Inventář dovoluje vybavování, sundávání, přesun, výměnu, řazení, filtraci dle rarity, označení oblíbených předmětů, uzamykání a položení na zem. Kompatibilní jednoruční zbraň lze nasadit také do druhé ruky. Změny herních dat provádí simulace, nikoliv komponenty UI.
- Předměty generují seedované prefixy, suffixy a tiery. Náhodnost se neprovádí znovu při uložení, načtení ani přepnutí CS/EN. Kořist zohledňuje oblast, druh nepřítele, level a normal/elite/boss; boss zaručeně dává epickou odměnu.
- Ve vyšších vlnách se objevují elity se štítem, aurami, regenerací, teleportací, vyvoláváním pomocníků a efekty po smrti. Elementální zásahy procházejí centrálním soubojovým systémem, Phaser pouze vykresluje.

Postavy se ukládají jako **character-only v10**, včetně osobní úschovny; z v8 a v9 se migruje inventář, vybavení, XP i postup. Combat, svět, jednotliví nepřátelé a kořist na zemi zůstávají dočasnými daty.

## Současná architektura

| Složka | Účel |
| --- | --- |
| `web/src/game/core` | Herní simulace, příkazy, XP, boj, kořist |
| `web/src/game/skills` a `web/src/game/combat` | Schopnosti, cooldowny, stavové efekty a výpočty poškození |
| `web/src/game/data`, `web/src/game/items`, `web/src/game/inventory`, `web/src/game/loot`, `web/src/game/progression` | Jednotný katalog 23 předmětů, 14 typů zbraní, affixy, atomické operace s inventářem, seedovaný loot a levelování |
| `web/src/game/stats` a `web/src/game/entities` | Odvozené statistiky, vznik hráče a pravidla života/zdrojů |
| `web/src/game/enemies` | Skupiny nepřátel, AI, seedovaní elitní modifikátoři a jejich efekty vykonávané centrálním soubojovým systémem |
| `web/src/game/quests` | Trvalé questové stavy, cíl úkolu a definice odměny |
| `web/src/game/trade` | Ceník obchodu, výkupní ceny, kovářské vylepšení a pravidla transakcí |
| `web/src/game/world` | Seedovaná divočina a dungeon, přechody oblastí, bezpečný tábor, kolize a A* navigace |
| `web/src/game/phaser` | Phaser scéna, vykreslování a ovládání |
| `web/src/game/bridge` | Typovaný most mezi simulací a Svelte |
| `web/src/ui` | Svelte komponenty pro výběr třídy, inventář, dialogy NPC, obchod, kováře, deník úkolů a HUD |
| `web/src/i18n` | Překlady `cs` a `en` přes svelte-i18n |
| `web/src/persistence` | Automatické i ruční ukládání trvalých dat postavy (v10, explicitní migrace v8/v9), bez ukládání pozice nebo bojového stavu |
| `web/tests` | Vitest a Playwright |

Z původní hry zůstaly v kořeni `dark_fantasy_2d_arpg_engine.html`, `visuals.js`, `visuals.css` a `index.html` jako **referenční implementace**. Na Pages se již nepoužívají; nedochází tedy k nechtěnému mísení starého a nového enginu.

## Testování

```bash
cd web
npm run check
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Workflow [`pages.yml`](./.github/workflows/pages.yml) kontroluje typy, jednotkové testy, build a browser smoke test a poté nasazuje pouze `web/dist/`. Spustí se při změně zdrojových souborů nové hry, build konfigurace či jejích závislostí, **nikoli při úpravách samotného README, dokumentace nebo testů**. Samostatné [`quality.yml`](./.github/workflows/quality.yml) ověřuje PR a změny testů bez deploymentu.

## Licence

Vlastní kód a originální herní assety se licencují jako GPL-3.0-only; externí assety si zachovávají vlastní licence a vyžadují patřičné uvedení zdroje. Před přijetím cizích assetů ověřte licenční kompatibilitu.

## Vývojový plán

Kompletní posloupnost 63 implementačních kroků: [`2d_arpg_implementation_prompts.md`](./2d_arpg_implementation_prompts.md).

Současná verze je **v rané fázi převodu**. Ukládání nyní funguje po vzoru Diabla: do IndexedDB se zapisují jen **trvalá data hrdiny** (povolání, úroveň, XP, zlato, statistika porážek, inventář, osobní úschovna, výbava včetně kovářských vylepšení a stav úkolu). Po opětovném načtení se postava objeví s plným zdravím v **bezpečném táboře**. Vznikne nová divočina s jiným seedem a nepřátelé, předměty na zemi, stavové efekty i cooldowny začínají znovu. Rozmístění části ruin a překážek se obměňuje; plnohodnotné biomy, další města a rozsáhlé dungeony zatím chybějí. **Postava se automaticky ukládá při změně trvalého postupu**, při spuštění nové postavy a při odchodu do menu; ruční tlačítko „Uložit“ zůstává dostupné. Uložené **postavy ve formátu v8 a v9 se automaticky migrují na v10** včetně všech jejich předmětů a kovářských vylepšení; starším postavám vznikne prázdná úschovna. Historické snapshoty světa a formáty starší než v8 nadále nejsou podporovány.
