# Integrátor — vlna D: Prompty 18–20 (agenti 22–24)

Tento soubor je **runbook pro koordinátora**; žádný agent jej nesmí měnit. Původně šlo o plán; následuje skutečný záznam integračního provedení. Nezaškrtané historické položky zachovávají původní acceptance checklist. Primární zadání [WAVE_D.md](WAVE_D.md).

## 0. Dispatch gate

- [ ] Ověřit poslední `main` SHA + GREEN Actions validate a Pages po dokončení Wave C.
- [ ] Ověřit, že dokumentační PR s Wave D je na `main`, a zaznamenat **nový přesný `BASE_SHA`**; neuvádět původní `2f347e1` jako aktuální po dokumentačním merge.
- [ ] Prověřit, že šest cílových cest v `WAVE_D.md` v BASE_SHA neexistuje, i že všechny 3 rozhraní mají funkční současné základy.
- [ ] Start max. tří izolovaných agentů 22–24, každý z BASE_SHA, bez práva zapisovat do `main`.
- [ ] Každý vrátí draft PR s přesným **dvousouborovým** diffem a čitelným API handoffem; při změně jiných souborů REJECT.

## 1. Agent PR review a bezpečný merge (bez runtime integrace)

Pořadí **22 → 23 → 24**; po každém merge aktualizovat výchozí `main`. Protože se moduly nevzájemně importují a mají oddělené cesty, není nutné slučovat větve mezi sebou. V případě nových změn v `main` agent rebase/aktualizuje jen vlastní branch, bez zásahu do sdílených souborů.

- [ ] **22 / TownManifest:** zachování historických NPC ID a souřadnic, nové role, seed-invariant safe zone, dosažitelné neblokované služby, nemutující návratové hodnoty, neplatné vstupy.
- [ ] **23 / EconomyRules:** shoda s existujícími `SHOP_OFFERS`, `sellPrice`, `temperCost` nebo výslovně bezrozporová cenová politika; neklesající ceny při levelování bez exploitu; zásada buy > sell, full-bag/insufficient-gold/locked-item a overflow atomicky odmítnuty; deterministický stock.
- [ ] **24 / QuestDialogue:** validní DAG prerequisit, branch gating, konečné počty cílů, idempotentní accept/progress/complete/reward, typed localization keys, správná izolace stavu a výslovná kompatibilita prvního questu.
- [ ] Pro každý PR: min. `npm run check`, `npm run test`, `npm run build`, zelená GitHub Actions quality; žádné nové deps ani assety; potvrzené exact-write-set.
- [ ] Agent PR merge **pouze koordinátorem** a pouze na GREEN, žádný deploy izolovaných knihoven mimo pravidla workflow.

## 2. Integrační gate 18 — trvalé město (jeden malý PR)

- [ ] Napojit manifest na stávající seedově stabilní `CAMP` a NPC picker/click→walk→interact i interakční vzdálenosti.
- [ ] Zachovat stávající 3 NPC, quest a obchod bez přerušení; přidat potion vendor, healer, stash, waypoint a civilisty s rolí a viditelnými CS/EN názvy. Interakce nesmí aktivovat world click pod dialogem.
- [ ] Safe zone kontroluje **simulace** (hráč ani nepřátelé neaplikují damage uvnitř); Phaser pouze vykresluje.
- [ ] Waypoint má stabilní ID a zatím jen připravené připojení pro budoucí fast travel Prompt 36; neohlašovat funkční cestování bez runtime. Stash vyžaduje skutečné a bezpečné přendávání předmětů v charakterovém save; pokud nelze dokončit bez většího save refaktoru, označit Prompt 18 **partial** a oddělit to před další vlnou.
- [ ] Dodatečný browser E2E pro click-to-NPC ze vzdálenosti, bezpečnou zónu, překážky, CS↔EN a save→reload tam, kde se mění charakterová data.

## 3. Integrační gate 19 — ekonomika (jeden malý PR)

- [ ] Zapojit `economyRules` do `commerce.ts` / runtime příkazů **pouze jednou autoritativní cestou**; nenechávat zdvojené výpočty ceny.
- [ ] Udržet stávající stock ceny a chování nákupu/prodeje/temperu, pokud není výslovně testovaná změna. Gold jen jeden source of truth, atomicita gold + inventory v `GameSimulation`.
- [ ] Nabídka vendorů, kategorie a refresh deterministicky z kontextu; žádné serverové časy ani `Math.random()`; položky s chráněnými příznaky locked/favorite se nesmí prodat.
- [ ] Obě jazykové varianty pro měnu, volby, neplatné transakce a potvrzení; čísla formátovat podle locale.
- [ ] Příjmy gold za kills/quests/dungeon musí zůstat; budoucí crafting/enchanting/repair/respec jen cenové adaptéry, dokud jejich gameplay prompty neexistují.

## 4. Integrační gate 20 — dialogy a úkoly (jeden malý PR)

- [ ] Původní `ashes_at_gate` / `warden_vesna` převést přes adaptér bez změny ID, původních čítačů, gold/XP nebo jejich násobení.
- [ ] Svelte dialog volby z čistých snapshotů, commandy do simulace; branching, condition gating, stav NPC a questů; živé CS↔EN bez resetu.
- [ ] Typed datové definice/klíče v obou katalozích, quest objective events v simulaci. Žádný quest script nesmí přímo přidávat gold nebo XP mimo jediný reward executor.
- [ ] Trvalý postup patří do **character-only** save. Pokud je nutné změnit record formát v9, výslovně verzovat a poskytnout ověřenou bezeztrátovou migraci v9→nový; zachovat starý quest i itemy. World seed, pozice, enemy state/dialogue UI se neukládají.
- [ ] E2E: offer→accept→increment→ready→turn-in→reward exactly once, branching, disabled choice, save→reload, CS↔EN. **Prompt 21** (plná příběhová linie) není součástí této vlny.

## 5. Gate před každým integrátorským PR

- [ ] Rozsah malý a reviewable, žádné nově přidané externí balíčky.
- [ ] `cd web && npm ci --no-audit --no-fund && npm run check && npm run test && npm run build && npm run test:e2e` a v kořeni `node tests/site.test.mjs`.
- [ ] GitHub Actions quality **GREEN pro přesný HEAD**; merge pouze po GREEN.
- [ ] Po změně publikované hry ověřit úspěšné nasazení GitHub Pages pro finální SHA `main`. **Samotné docs-only změny nesmějí spouštět Pages deployment.**
- [ ] Aktualizovat `docs/IMPLEMENTATION_STATUS.md` pravdivě: isolated / integrated / full acceptance; nepovažovat samostatný helper za splnění promptu.

## 6. Stop conditions

STOP při překryvu write-setů, konfliktním API, neprocházející CI, chybějící lokalizaci, zdvojeném zdroji autority, ztrátě v9 charakterových dat, změně quest ID, exploitu ekonomiky nebo save dat obsahujících transient world/combat. Rozdělit integraci na menší PR; nepřekonávat zjištěný konflikt resetem či vypnutím testů.

### Další etapa
**E**: obsahové Prompty **21–22**, až stávající město/ekonomika/dialogy běží v prohlížeči. Zatím je nevydávat za dokončené.

## Záznam provedení — integrátor 20. 11. 2026

1. **Agentní PR**: #30 (Agent 22), #32 (Agent 23), #31 (Agent 24), všechny přesně dvousouborové, zelené a sloučené do `main` ve stanoveném pořadí.
2. **Town / #33**: Phaser/Svelte/simulation propojení deseti manifestových entit, safe-zone a dosah, léčitel za 15 gold a obnova resource za 12 gold, překlady. [CI #44716711079](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44716711079) GREEN. `stash_camp` zůstává připravený bez vlastního inventory/save executor; `waypoint_camp` je přístupná dekorativní služba bez fast travel. Proto **Prompt 18 PARTIAL**.
3. **Economy / #34**: autoritativní ceny a prodej / nákup / kování přes quote+plan, prověření levelu, kapacity, locked/favorite, gold cap, CS/EN a v9 save. [CI #44717393726](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44717393726) GREEN. **Prompt 19 CORE COMPLETE** (budoucí crafting jiné prompty).
4. **Quests / #35**: jeden authoritative v9 quest adaptovaný do `QuestLedger`, branching dialogue, objective events a přesně jeden reward plan pro `ashes_at_gate`; nezměněné ID/gold/XP/save, CS/EN live switch. Při TDD CI odstraněn regression, která omylem vyřadila `useTownService`. [CI #44719246543](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44719246543) GREEN; **488 unit, 12 Chromium, 0 typecheck errors/warnings**, build, legacy reference. **Prompt 20 CORE COMPLETE** pro reusable model a historický quest.
5. Finální merged runtime SHA **`70aa6df2747c7c637a5d9727edfacd4d8c152c0c`** (PR #35). Post-merge quality a Pages jsou nezávislé workflow; přesné výsledky zaznamenat až po GitHub Actions GREEN.

**Navazující closeout (PR #37, 20. 11. 2026):** Autoritativní 24slotová úschovna s atomickými deposit/withdraw plány, ochranou locked/favorite, kontrolami duplicit ID, Svelte UI a CS/EN byla dokončena. Save **v10** obsahuje úschovnu; migrace z v8 a v9 zachovávají staré předměty a quest. [PR #37](https://github.com/Nereziel/dark_fantasy_2d_arpg/pull/37) prošlo [CI #44729285374](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44729285374) a bylo sloučeno na `main` jako `c2dd29d7cd948b32ec98265ebfe934d4699def94`. **Prompt 18 CORE COMPLETE**, ale waypoint stále nemá fast travel (Prompt 36). Post-merge quality [#44729571084](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44729571084) **GREEN** (495/495 jednotkových testů v 52 souborech; 13/13 Chromium; typy 0 chyb/0 varování; build a legacy test) a GitHub Pages [#44729571089](https://github.com/Nereziel/dark_fantasy_2d_arpg/actions/runs/44729571089) **SUCCESS** na přesném `main` SHA `c2dd29d7cd948b32ec98265ebfe934d4699def94` uzavírají nasazovací bránu vlny D. **Další: Wave E, Prompty 21–22.**
