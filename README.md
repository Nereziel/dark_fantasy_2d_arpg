# Aether & Ruin

Dark-fantasy 2D ARPG pro prohlížeč. Hra se postupně převádí z původního monolitického HTML enginu na **Svelte 5 + Phaser 4 + TypeScript + Vite**.

## Hrát online

**https://nereziel.github.io/dark_fantasy_2d_arpg/**

Na GitHub Pages se nyní publikuje **nová Svelte/Phaser verze**, která je stále ve vývoji. Obsahuje výběr šesti tříd, skupinové souboje se třemi nezávislými nepřáteli, kolize a obcházení překážek, dvě aktivní schopnosti pro každou ze šesti tříd (Q / pravé tlačítko a 1), efekty, tři archetypy nepřátel (přízrak, kostlivec a vlk) s nezávislou skupinovou AI a viditelným varováním před útokem, kořist, inventář, výbavu, zkušenosti, zlato a uložení nové hry. V táboře lze promluvit se strážkyní Vesnou, přijmout úvodní úkol **Popel u bran**, porazit tři nepřátele a odevzdat úkol za zlato a XP. Další dungeony, questy, talenty a rozsáhlejší herní svět se teprve převádějí.

## Lokální spuštění

Vyžaduje Node.js 22+ a npm:

```bash
cd web
npm ci
npm run dev
```

Lokální adresa: http://localhost:5173/dark_fantasy_2d_arpg/

## Ovládání

- Levé tlačítko myši: pohyb po zemi, útok kliknutím na nepřítele, sebrání kořisti kliknutím na předmět.
- Klávesa **I**: inventář; Esc: zavření inventáře.
- **Q** nebo **pravé tlačítko myši**: první schopnost; **1**: druhá schopnost.
- Kliknutí na konkrétního nepřítele nebo položku v seznamu cílů: vybere nepřítele k útoku.
- Uhnutí před útokem: opusť červeně vyznačenou oblast před zásahem.
- Mezerník nebo Esc mimo inventář: pauza.
- Přepnutí **Čeština / English** je v menu i při hraní.
- **Tábor:** bezpečná oblast bez útoků nepřátel. Kliknutím na NPC nebo tlačítkem v deníku úkolů lze zahájit rozhovor a přijmout úkol.
- **Úvodní úkol:** Po přijetí poraz 3 nepřátele a vrať se ke strážkyni pro odměnu. Postup se automaticky ukládá.

## Současná architektura

| Složka | Účel |
| --- | --- |
| `web/src/game/core` | Herní simulace, příkazy, XP, boj, kořist |
| `web/src/game/skills` a `web/src/game/combat` | Schopnosti, cooldowny, stavové efekty a výpočty poškození |
| `web/src/game/data` | Definice tříd, předmětů, afixů a výbavy |
| `web/src/game/enemies` | Skupiny nepřátel, nezávislé útoky, varování a parametry AI |
| `web/src/game/quests` | Trvalé questové stavy, cíl úkolu a definice odměny |
| `web/src/game/world` | Seedovaná divočina, bezpečný tábor, kolize a A* navigace |
| `web/src/game/phaser` | Phaser scéna, vykreslování a ovládání |
| `web/src/game/bridge` | Typovaný most mezi simulací a Svelte |
| `web/src/ui` | Svelte komponenty pro výběr třídy, inventář, dialogy NPC, deník úkolů a HUD |
| `web/src/i18n` | Překlady `cs` a `en` přes svelte-i18n |
| `web/src/persistence` | Automatické i ruční ukládání trvalých dat postavy (v7), bez migrace starých pozic |
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

Současná verze je **v rané fázi převodu**. Ukládání nyní funguje po vzoru Diabla: do IndexedDB se zapisují jen **trvalá data hrdiny** (povolání, úroveň, XP, zlato, statistika porážek, inventář, výbava a stav úkolu). Po opětovném načtení se postava objeví s plným zdravím v **bezpečném táboře**. Vznikne nová divočina s jiným seedem a nepřátelé, předměty na zemi, stavové efekty i cooldowny začínají znovu. Rozmístění části ruin a překážek se obměňuje; plnohodnotné oblasti, města a dungeony zatím chybějí. **Postava se automaticky ukládá při změně trvalého postupu**, při spuštění nové postavy a při odchodu do menu; ruční tlačítko „Uložit“ zůstává dostupné. Původní uložené hry a předchozí vývojové formáty se **nepřevádějí**.
