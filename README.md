# Aether & Ruin

Dark fantasy 2D akční RPG v prohlížeči. Zachovává původní herní engine a opravuje neviditelné pixel-art sprity. Rozšiřuje svět o procedurální textury, dekorace, osvětlení a podporu HiDPI.

## Hrát online

https://nereziel.github.io/dark_fantasy_2d_arpg/

## Spuštění lokálně

V kořenové složce spusť `python3 -m http.server 8000` a otevři `http://localhost:8000/`. Nejsou potřeba npm, backend ani build. Původní Tailwind a fonty se načítají z CDN, proto je pro plný vzhled potřeba internet.

## Ovládání

Levé tlačítko myši: pohyb, útok nebo interakce. Pravé tlačítko: sekundární schopnost. Klávesy 1–4: další schopnosti (fungují i na české klávesnici). Inventář, talenty, mapa, pauza a ukládání jsou dostupné v HUD. Uložení využívá localStorage prohlížeče.

## Struktura projektu

- `index.html` – výchozí vstup pro GitHub Pages (přesměrování na engine)
- `dark_fantasy_2d_arpg_engine.html` – hra, opravy spritů a HiDPI
- `visuals.js` – předgenerované textury krajiny, scenérie, světla, dekorace a render objektů
- `visuals.css` – aktualizovaný vzhled menu, HUD a oken
- `tests/site.test.mjs` – základní statická validace JavaScriptu a propojení souborů
- `.github/workflows/pages.yml` – automatický deployment pouze při změně publikované hry
- `.github/workflows/quality.yml` – samostatná validace pro pull requesty a změny testů bez deploymentu
- `2d_arpg_implementation_prompts.md` – plán postupné migrace na Svelte 5 / Phaser 4 / TypeScript / Vite; nový projekt bude v `web/`

## Nasazení na GitHub Pages

1. V repozitáři otevři **Settings → Pages**.
2. V části **Build and deployment** vyber jako **Source** možnost **GitHub Actions**.
3. Workflow se spustí při pushi do `main` **jen když se změní publikovaná hra** (`index.html`, herní HTML, `visuals.js`, `visuals.css`, herní assety či deploy workflow). Změny `README.md`, implementačních promptů, `docs/**`, testů nebo dosud nepublikovaného `web/` projektu **nespustí Pages rebuild**. Ruční nasazení je dostupné přes **Actions → Deploy Aether & Ruin to GitHub Pages → Run workflow**.
4. Po úspěšném běhu bude hra dostupná na výše uvedené adrese.

## Technologie

**Aktuálně:** HTML5 Canvas, vanilla JavaScript, CSS a Tailwind CDN. GitHub Pages podporuje všechny součásti bez dalšího serveru.

**Plánovaná architektura:** Svelte 5 + Phaser 4 + TypeScript + Vite v samostatném `web/` projektu. Do vydání plnohodnotně hratelné verze běží současná HTML hra. Až bude migrace otestována, workflow přejde na publikování `web/dist/` a bude sledovat jen odpovídající zdrojové soubory a build konfiguraci.
