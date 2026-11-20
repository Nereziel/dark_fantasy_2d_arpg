# Agent 23 — Prompt 19: Ekonomika a obchodní pravidla

**Vlna D | izolovaný doménový modul | stav: ZADÁNO, NESPŮŠTĚNO.** Větev `agent/23-prompt-19`, vlastní worktree, přesné BASE_SHA od integrátora. Runtime a UI nesmíš měnit.

## Přesný write-set (pouze tyto 2 nové soubory)

1. `web/src/game/trade/economyRules.ts`
2. `web/tests/unit/Agent23EconomyRules.test.ts`

Chráněné jsou `trade/commerce.ts`, `data/items.ts`, `core/types.ts`, `GameSimulation.ts`, inventory, save, UI, i18n, AGENTS, docs, CI, package/lockfile a všechny soubory ostatních agentů. Pokud je nutná jejich změna, STOP a popiš požadavek v draft PR.

## Východisko

- Původní Prompt 19: zdroje a výdaje gold, buy/sell, cenové vzorce, inventář obchodníka, obnovování nabídky, položkové kategorie a odolnost proti inflaci.
- Existující `web/src/game/trade/commerce.ts` nabízí `SHOP_OFFERS`, `getOffer`, `createShopItem`, `sellPrice`, `temperCost`, `temperItem`. `GameSimulation.ts` autoritativně mění gold a bag při buy/sell/temper, `TradePanel.svelte` vykresluje ceny.
- **Nesmíš vytvořit paralelní zdroj pravdy pro existující ceny.** Kde je starý výpočet autoritativní, pouze ho použij a ověř, integrátor jej později centralizuje. Existující cenová čísla/quest reward nesmí být bez schválení narušena.

## Dodávka

V jediném produkčním modulu implementuj srozumitelné typed API obdobné:

- `EconomyContext` (vendor/category, class-neutral level, epoch/refresh seed, stav gold), `EconomyQuote` (integer price, kind, currency, reason), `TransactionPlan` diskriminovaný `ok / rejected` s reason bez mutace vstupního bag/gold.
- `quotePurchase(offer)`, `quoteSale(item)`, `quoteTempering(item)` nebo kompatibilní jednotný `quoteTownService`; kompatibilní s dnešními `SHOP_OFFERS`, `sellPrice`, `temperCost`.
- `planPurchase(quote, gold, freeSlots)`, `planSale(quote, gold, itemFlags)`, `planService(quote, gold)`: atomické **plány**, nikoli provedení. Integrátor vykoná efekty přes existující authoritative command, ne ruční měnění snapshotů. Zkontroluj chybějící item, level gates, plný batoh, nedostatek gold, ochranu locked/favorite, gold cap a integer overflow.
- Deterministický a data-driven `selectVendorStock(context)` / `refreshOffers(...)`: vyjádři kategorie a refresh pravidla bez wall-clock time a `Math.random()`; pro stávající merchant nabídku ponech stejné stabilní ID a ceny. Nové typy vendorů lze podporovat jako datové kapacity, ne tvrzení, že jsou již runtime dostupné.
- Ošetři buy/sell arbitráž: ekvivalentní item nelze prodat dráž, než stojí nové; tempering nezvětšuje gold sám o sobě.
- Nedefinuj novou reálnou mechaniku repair, enchanting, crafting nebo respec, které příslušné budoucí prompty neimplementovaly. Můžeš vymezit bezpečné cenové kategorie a validační kontrakt; v PR označ pending gameplay.

## TDD — minimální testová matice

1. Současné 5 `SHOP_OFFERS` zachovává ID a ceny, quote kompatibilní s `getOffer` a `sellPrice`; valid Item včetně vysokých rarit/level a upgrade.
2. 0 gold, max-safe gold, záporná čísla, `NaN`, nekonečno, podhodnocený/overflow price, neplatný level, null, duplicate stock nebo unknown vendor => odmítnutí bez mutace.
3. Nedostatek měny, plná inventory, zamčená/favorite věc, nedostupná položka a level gate => deterministický rejection reason; platná transakce přesný budget delta.
4. Seed + refresh epoch reprodukuje stejné ceny/stock; jiná epocha se může měnit jen v povolených nabídkách, ale vždy pouze validní IDs a bez skrytého zdroje náhody.
5. Žádná cizí importovaná nová Wave D věc, žádný dom/Phaser/Svelte.

## Pracovní postup / PR

Přečti celé `AGENTS.md`, `WAVE_D.md`, `INTEGRATION_D.md`, vlastní `TASK.md` a originální Prompt 19. Startuj od koordinátorem potvrzeného BASE_SHA, samostatná branch/worktree. Nejdřív červené Vitest testy, potom minimální implementace a GREEN. V `web/` spusť `npm ci --no-audit --no-fund`, `npm run check`, `npm run test`, `npm run build`. `git diff --name-only BASE_SHA...HEAD` smí ukázat **přesně dva povolené soubory**. Otevři **draft PR**, reportuj RED→GREEN, výstupy validací, nové API a nutný integrační krok. **Neprováděj merge, žádný deployment.**

## Handoff integrátorovi

Jediný integrátor zavede `economyRules` jako **jediný** výpočet cen do `commerce.ts`, `GameSimulation` a `TradePanel`, doplní CS/EN čísla a hlášky, zavede vendor role a atomické transakce s ochrannými příznaky. Dokud to není ověřeno E2E a CI, Prompt 19 je pouze **isolated helper**.

## Prompt pro samostatného agenta

> Jsi **Agent 23 (Wave D, Prompt 19)** v `Nereziel/dark_fantasy_2d_arpg`. Přečti `docs/plan/agents/23/TASK.md`, `WAVE_D.md`, `INTEGRATION_D.md`, `AGENTS.md` a původní Prompt 19. Z přiděleného BASE_SHA vytvoř `agent/23-prompt-19` a samostatný worktree. Pomocí TDD dodej výlučně `web/src/game/trade/economyRules.ts` a `web/tests/unit/Agent23EconomyRules.test.ts`. Zachovej kompatibilitu existujících cen, připrav čisté quote/transakční plány, validované budgety a deterministické stock/refresh bez možnosti exploitu. Neměň obchodní UI, hlavní simulaci ani save. Proveď check/test/build; draft PR s přesným seznamem dvou souborů a handoffem; **nikdy nemerguj**.
