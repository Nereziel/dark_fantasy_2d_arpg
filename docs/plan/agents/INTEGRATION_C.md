# Integrátor — Prompty 12–17, Wave C

Tento dokument vlastní pouze integrátor. **Agenti 16–21 nesmějí měnit integraci, testovací fixtures, save ani UI.**

## Dispatch gate
- [ ] PR #21 pro Prompty 07–11 je merged, poslední CI main včetně Chromium + Pages GREEN.
- [ ] Zaznamenat společný BASE_SHA main a ověřit všech 12 exkluzivních cest Wave C ještě neexistuje.
- [ ] Požádat 6 agentů nezávisle přes plné `16/TASK.md` až `21/TASK.md`; každý vlastní branch/worktree z BASE_SHA.
- [ ] U každého ověřit 2-file diff, žádné cizí importy, prokazatelné TDD RED→GREEN, validace hranic, seed determinism a check/test/build.
- [ ] Všech šest PR musí zůstat draft; koordinátor je kontroluje a merguje postupně až po každém GREEN.

## Integrační brány (každý gate vlastní PR + testy)
### 12: Progres
Pure XP curve + per-level stat growth; GameSimulation.awardExperience, HUD progress, skill/talent points a character-only persistence. **Nevytvářet nekompatibilní tichou migraci v8.** U každého stávajícího save recordu buď podporovaná migrace, nebo zdokumentované explicitní rozhodnutí uživatele.
### 13: Item model
Katalog dat a stabilní instance IDs; 14 weapon types, obouruční/offhand konflikt, rarity, sockety, legendární powers, CS/EN lokální názvy. Srovnat s legacy Item, bez ztráty stávající kořisti či temperu.
### 14: Affixes
Vazba na Item Catalog a seedový rollItem; affix pool/tier gating, česká slovosledná pravidla, rarity; testovat 1000 seeded generování.
### 15: Inventář
Autoritativní typed command vybavit/odložit/prohodit/vyhodit/třídit/uzamknout/filtrovat, synchronizace UI, deriveStats, item locks, validace rukou a inventáře; 2h směna atomická.
### 16: Loot
Kontextové tabulky normal/elite/boss, guaranteed boss + rand, rarity beacon, pickup auto-approach, inventory full; nový loot nesmí obejít SaveRepository.
### 17: Elity
Složené modifikátory, životy/útok, on-hit/status/death/summon/hazard, telegraph/UI, vyšší loot; stabilní spawn a kompatibilita wave/crypt ID.

## Smoke suite + merge
- [ ] Full `web/: npm ci && npm run check && npm run test && npm run build && npx playwright install chromium && npm run test:e2e`.
- [ ] Root `node tests/site.test.mjs`.
- [ ] XP / level-up save→reload, item equip/unequip/2h/offhand, seed→loot replay, elite affixes/loot, CS↔EN, mobile pointer focus, browser rendering and GitHub Pages prefix.
- [ ] Rozlišit RED/AMBER/GREEN v `docs/IMPLEMENTATION_STATUS.md`; agent helper alone nesplňuje runtime acceptance.
- [ ] Merge jen integrátorem; `main` zůstává release reference.

## Wave C integration execution record — PR #28

All six isolated agent PRs (#22, #27, #23, #26, #24, #25) passed their own validation and were merged in prompt order **12 → 13 → 14 → 15 → 16 → 17**. They were not labeled as complete game systems until the coordinator linked them in PR #28.

- [x] Integrate XP, skill/talent balances, derived stats, activity rewards and character-only v9 save with explicit v8 migration
- [x] Connect complete item catalog, 14 weapon kinds, two-handed/offhand rules, all six rarities, sockets and legendary powers
- [x] Seed affixes and locale-specific Czech/English item-name composition without rerolling instances
- [x] Route equip, unequip, swap, sort, drop, lock/favorite and comparisons through the authoritative TypeScript simulation
- [x] Use weighted zone/species/tier/elite/boss loot and guaranteed boss drops; render labeled colored drops and pickup
- [x] Execute elite shields, statuses, auras, teleportation, regeneration, summoning and death explosions through shared simulation combat
- [x] Regression checks for save migration, atomic two-handed swaps with full inventory, deterministic loot, affixes, elite effects and bilingual labels
- [x] Full integration CI [#44705749684](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44705749684): 0 Svelte errors, 440 unit tests, production build, 12 Chromium Playwright tests and root legacy site test
- [ ] Post-merge GitHub Pages deployment verification (must be performed against the final merged SHA)

Future gem insertion, active talent-tree spending and extended campaign content are outside the original Wave C core gate and must not be mistaken for already deployed features.
