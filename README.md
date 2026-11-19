# Aether & Ruin

Dark-fantasy 2D ARPG pro prohlížeč. Hra se postupně převádí z původního monolitického HTML enginu na **Svelte 5 + Phaser 4 + TypeScript + Vite**.

## Hrát online

**https://nereziel.github.io/dark_fantasy_2d_arpg/**

Na GitHub Pages se nyní publikuje **nová Svelte/Phaser verze**, která je stále ve vývoji. Obsahuje výběr šesti tříd, základní boj a pohyb kliknutím, dvě aktivní schopnosti pro každou ze šesti tříd (Q / pravé tlačítko a 1), efekty, kořist, inventář, výbavu, zkušenosti, zlato a uložení nové hry. Původní plný herní obsah (dungeony, questy, talenty a další systémy) se teprve převádí.

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
- Mezerník nebo Esc mimo inventář: pauza.
- Přepnutí **Čeština / English** je v menu i při hraní.

## Současná architektura

| Složka | Účel |
| --- | --- |
| `web/src/game/core` | Herní simulace, příkazy, XP, boj, kořist |
| `web/src/game/skills` a `web/src/game/combat` | Schopnosti, cooldowny, stavové efekty a výpočty poškození |
| `web/src/game/data` | Definice tříd, předmětů, afixů a výbavy |
| `web/src/game/phaser` | Phaser scéna, vykreslování a ovládání |
| `web/src/game/bridge` | Typovaný most mezi simulací a Svelte |
| `web/src/ui` | Svelte komponenty pro výběr třídy, inventář a HUD |
| `web/src/i18n` | Překlady `cs` a `en` přes svelte-i18n |
| `web/src/persistence` | IndexedDB uložení, migrace starší vývojové pozice |
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

Současná verze je **v rané fázi převodu**. Původní uložené hry a předchozí vývojové formáty se **nepřevádějí**. Nepodporované pozice je nutné nahradit novou hrou.
