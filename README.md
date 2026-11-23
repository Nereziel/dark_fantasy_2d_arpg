# Aether & Ruin

Dark-fantasy 2D akční RPG pro prohlížeč. Hra používá Svelte 5, Phaser 4, TypeScript a Vite a podporuje češtinu i angličtinu.

**[Hrát online na GitHub Pages](https://nereziel.github.io/dark_fantasy_2d_arpg/)**

Hratelný Akt I nabízí šest tříd, tábor s NPC a obchodníky, procedurální divočinu, úkoly a Kryptu Duté koruny s třífázovým bossem Hollow Kingem. Ve hře jsou talenty, loot, výbava, crafting, gemy a runy, úschovna, lektvary i více uložených postav. Akt II má příběhové odemčení po rozhovoru s Vesnou. Samotný region je další plánovaný obsah.

## Lokální spuštění

Vyžaduje Node.js **22.12 nebo novější** a npm.

```bash
cd web
npm ci
npm run dev
```

Hra běží na <http://localhost:5173/dark_fantasy_2d_arpg/>.

## Výchozí ovládání

| Vstup | Akce |
| --- | --- |
| Levé tlačítko myši | Kliknutí nebo podržení pro pohyb. Podle cíle útok, sebrání kořisti nebo interakce. |
| Prostřední tlačítko / Shift | Vynucený pohyb / útok na místě při držení Shiftu |
| Pravé tlačítko, 1–6 | Schopnosti třídy |
| Q / mezerník | Lektvar / úskok |
| I, C, S, T, M, J | Inventář, postava, schopnosti, talenty, mapa, deník |
| Esc | Zpět nebo pauza s nastavením a přemapováním ovládání |

Postavy se ukládají do IndexedDB. Každá má vlastní inventář, výbavu, úschovnu, talenty a stav úkolů. Samostatný záznam světa uchovává seed, odkrytou mapu, aktivované body a trvalé události. Po načtení začíná nová herní relace v bezpečném táboře.

## Testy a vývoj

```bash
cd web
npm run check
npm run test
npm run build
npx playwright install --only-shell chromium
npm run test:e2e
```

[GitHub Actions](.github/workflows/quality.yml) ověřuje PR a příslušné změny na `main`. Po změně publikovaných vstupů a úspěšné kontrole nasadí `web/dist/` na Pages. Ruční nasazení běží přes stejný workflow.

- [Roadmapa a přejímka](docs/ROADMAP.md)
- [Aktuální stav, CI a nasazení](docs/IMPLEMENTATION_STATUS.md)
- [Zadání a implementační prompty](2d_arpg_implementation_prompts.md)
- [Architektura](docs/ARCHITECTURE.md) · [Klient a uložení](web/README.md)

Původní HTML hra v kořeni slouží jako offline reference k převodu.

## Licence

Vlastní kód a originální herní assety jsou licencovány pod [GPL-3.0-only](LICENSE). Licence a zdroje externích součástí jsou v [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
