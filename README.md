# Aether & Ruin

Dark-fantasy 2D ARPG pro prohlížeč. Hra se postupně převádí z původního monolitického HTML enginu na **Svelte 5 + Phaser 4 + TypeScript + Vite**.

## Hrát online

**https://nereziel.github.io/dark_fantasy_2d_arpg/**

Na GitHub Pages se nyní publikuje **nová Svelte/Phaser verze**, která je stále ve vývoji. Obsahuje výběr šesti tříd, skupinové souboje se třemi nezávislými nepřáteli, kolize a obcházení překážek, dvě aktivní schopnosti pro každou ze šesti tříd (Q / pravé tlačítko a 1), efekty, tři archetypy nepřátel (přízrak, kostlivec a vlk) s nezávislou skupinovou AI a viditelným varováním před útokem, kořist, inventář, výbavu, zkušenosti, zlato a uložení nové hry. V táboře lze promluvit se strážkyní Vesnou, přijmout úvodní úkol **Popel u bran**, porazit tři nepřátele a odevzdat úkol za zlato a XP. Nově přibyli **obchodník Bram** (nákup a prodej vybavení) a **kovář Odan** (až tři trvalá vylepšení nasazené zbroje či zbraně za zlato). První hratelný dungeon **Krypta Duté koruny** má vlastní generovanou mapu, skupinu silnějších strážců a závěrečného bosse. Další dungeony, questy, talenty a rozsáhlejší herní svět se teprve převádějí.

## Lokální spuštění

Vyžaduje Node.js 22+ a npm:

```bash
cd web
npm ci
npm run dev
```

Lokální adresa: http://localhost:5173/dark_fantasy_2d_arpg/

## Ovládání

- **Levé tlačítko myši:** kontextový pohyb, útok na nepřítele, NPC, portál a sběr kořisti. Neprůchozí kliknutí nasměruje postavu na nejbližší dosažitelné místo.
- **Prostřední tlačítko myši:** vynucený pohyb (bez vybírání nepřátel a NPC). Přesun řeší kolize a překážky.
- Klávesa **I**: inventář; Esc: zavření inventáře.
- Klávesa **C**: přehled postavy a všech atributů; Esc: zavření přehledu.
- **Q** nebo **pravé tlačítko myši**: první schopnost; **1** (včetně numerické klávesnice): druhá schopnost. Pravé kliknutí na nepřítele ho před sesláním vybere; další sloty a lektvary zatím nejsou implementované.
- Kliknutí na konkrétního nepřítele nebo položku v seznamu cílů: vybere nepřítele k útoku.
- Uhnutí před útokem: opusť červeně vyznačenou oblast před zásahem.
- **Shift (držet):** drž pozici, nepokračuj v automatickém pronásledování nepřítele. **Mezerník:** úskok s cooldownem. **Esc:** pauza / návrat do hry nebo zavření otevřeného panelu.
- Přepnutí **Čeština / English** je v menu i při hraní.
- **Tábor:** bezpečná oblast bez útoků nepřátel. Kliknutím na NPC nebo tlačítkem v deníku úkolů lze zahájit rozhovor a přijmout úkol.
- **Úvodní úkol:** Po přijetí poraz 3 nepřátele a vrať se ke strážkyni pro odměnu. Postup se automaticky ukládá.
- **Obchod a kovář:** Klikni na NPC ve světě nebo použij tlačítka „Prohlédnout zboží“ / „Navštívit kováře“ v táboře. U Brama lze nakupovat a prodávat předměty z batohu, u Odana vylepšovat **nasazené** zbraně a zbroj.
- **Krypta Duté koruny:** Klikni na kamenný portál za táborem nebo na tlačítko „Vstoupit do krypty“. Poraz tři strážce, poté vládce krypty a jeho doprovod. Tlačítko „Vrátit se do tábora“ funguje také během boje.

### Základy podle implementačních promptů

Převod pokračuje **v pořadí 63 promptů** ze souboru `2d_arpg_implementation_prompts.md`. V současnosti se dokončuje **Prompt 02 – Player Entity and Character Core**: jsou oddělené odvozené statistiky, vytvoření hráče a pravidla života/zdrojů a přibyl přehled postavy na klávese C. Souboj nyní používá typované fyzické a elementální poškození, výpočet úhybu, bloku a kritických zásahů; části sekundárních statistik (magické odolnosti pro budoucí útoky, štíty, life steal) zůstávají pro budoucí rozšíření. Přesný přehled dokončení základů je v `docs/IMPLEMENTATION_STATUS.md`.

## Současná architektura

| Složka | Účel |
| --- | --- |
| `web/src/game/core` | Herní simulace, příkazy, XP, boj, kořist |
| `web/src/game/skills` a `web/src/game/combat` | Schopnosti, cooldowny, stavové efekty a výpočty poškození |
| `web/src/game/data` | Definice tříd, předmětů, afixů a výbavy |
| `web/src/game/stats` a `web/src/game/entities` | Odvozené statistiky, vznik hráče a pravidla života/zdrojů |
| `web/src/game/enemies` | Skupiny nepřátel, nezávislé útoky, varování a parametry AI |
| `web/src/game/quests` | Trvalé questové stavy, cíl úkolu a definice odměny |
| `web/src/game/trade` | Ceník obchodu, výkupní ceny, kovářské vylepšení a pravidla transakcí |
| `web/src/game/world` | Seedovaná divočina a dungeon, přechody oblastí, bezpečný tábor, kolize a A* navigace |
| `web/src/game/phaser` | Phaser scéna, vykreslování a ovládání |
| `web/src/game/bridge` | Typovaný most mezi simulací a Svelte |
| `web/src/ui` | Svelte komponenty pro výběr třídy, inventář, dialogy NPC, obchod, kováře, deník úkolů a HUD |
| `web/src/i18n` | Překlady `cs` a `en` přes svelte-i18n |
| `web/src/persistence` | Automatické i ruční ukládání trvalých dat postavy (v8), bez migrace starých pozic |
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

Vlastní kód a originální herní assety mají mít GPL-3.0; externí assety si zachovávají vlastní licence a vyžadují patřičné uvedení zdroje. Před přijetím cizích assetů ověřte licenční kompatibilitu.

## Vývojový plán

Kompletní posloupnost 63 implementačních kroků: [`2d_arpg_implementation_prompts.md`](./2d_arpg_implementation_prompts.md).

Současná verze je **v rané fázi převodu**. Ukládání nyní funguje po vzoru Diabla: do IndexedDB se zapisují jen **trvalá data hrdiny** (povolání, úroveň, XP, zlato, statistika porážek, inventář, výbava včetně kovářských vylepšení a stav úkolu). Po opětovném načtení se postava objeví s plným zdravím v **bezpečném táboře**. Vznikne nová divočina s jiným seedem a nepřátelé, předměty na zemi, stavové efekty i cooldowny začínají znovu. Rozmístění části ruin a překážek se obměňuje; plnohodnotné biomy, další města a rozsáhlé dungeony zatím chybějí. **Postava se automaticky ukládá při změně trvalého postupu**, při spuštění nové postavy a při odchodu do menu; ruční tlačítko „Uložit“ zůstává dostupné. Původní uložené hry a předchozí vývojové formáty se **nepřevádějí**.
