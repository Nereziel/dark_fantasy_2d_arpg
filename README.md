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
- `.github/workflows/pages.yml` – automatický deployment

## Nasazení na GitHub Pages

1. V repozitáři otevři **Settings → Pages**.
2. V části **Build and deployment** vyber jako **Source** možnost **GitHub Actions**.
3. Workflow se spustí automaticky při každém pushi do `main`. Ručně jej lze spustit v **Actions → Deploy Aether & Ruin to GitHub Pages → Run workflow**.
4. Po úspěšném běhu bude hra dostupná na výše uvedené adrese.

## Technologie

HTML5 Canvas, vanilla JavaScript, CSS a Tailwind CDN. GitHub Pages podporuje všechny součásti bez dalšího serveru.
