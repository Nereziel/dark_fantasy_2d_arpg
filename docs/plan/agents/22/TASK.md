# Agent 22 — Prompt 18: První trvalé město

**Vlna D | izolovaný doménový modul | stav: ZADÁNO, NESPŮŠTĚNO.** Pracuješ pouze ve vlastní větvi `agent/22-prompt-18` vytvořené ze společného BASE_SHA, které ti sdělí integrátor. **Neimplementuj propojení runtime.**

## Přesný write-set (pouze tyto 2 nové soubory)

1. `web/src/game/world/townManifest.ts`
2. `web/tests/unit/Agent22TownManifest.test.ts`

Nepřidávej ani neupravuj třetí soubor. Zvláště chráněny: `world/generator.ts`, `world/npcs.ts`, `world/navigation.ts`, `core/types.ts`, `GameSimulation.ts`, scény, UI, i18n, save, dokumentace, CI a lockfile. Při kolizi s již existující cestou STOP a kontaktuj integrátora.

## Východisko

- Původní Prompt 18 v `2d_arpg_implementation_prompts.md` chce seedově stálé město, safe zone, quest NPC, kováře, zbrojního obchodníka, potion vendor, healera, stash, waypoint a civilisty.
- Současný `world/generator.ts` již nabízí seedově stabilní `CAMP = {x:390,y:470}` a `CAMP_RADIUS = 165`; `world/npcs.ts` obsahuje stabilní `WARDEN_ID` (`warden_vesna`), `MERCHANT_ID` (`merchant_bram`), `BLACKSMITH_ID` (`smith_odan`) a `NPC_POSITIONS`. **Nepřepisuj ani nepřestavuj existující identitu a pozice.**
- `GameSimulation.ts` a Phaser již implementují klik→přiblížení→NPC dialog pro stávající NPC. Tvým úkolem jsou **data a validace**, ne nové příkazy a renderer.

## Dodávka

Vytvoř čistý TypeScript modul s typy a exporty obdobnými:

- `TownServiceRole`: `quest | weaponMerchant | blacksmith | potionVendor | healer | stash | waypoint | civilian`. Jediná stabilní role a ID pro službu; dostatek civilistů na vizuálně živé město.
- `TownEntry`: stabilní ASCII ID, role, pozice v world units, interactionRange, collisionRadius, `nameKey`/`descriptionKey` pro lokální CS/EN UI; žádné české/anglické texty v doménových datech.
- `getTownManifest()` nebo konstantní manifest a čistý getter, `townEntry(id)`, `townServiceFor(id)`, `isTownSafePoint(point)`, `canInteractTownEntry(hero, id)`, `validateTownLayout(layout)` vracející chyby, ne mutující mapu.
- Pro stávající tři NPC čerpej skutečné pozice z `NPC_POSITIONS`, ne duplikovaná čísla. Pro další služby zvol nové stabilní ID bez přepsání `NpcId`. Sloty pro služby lze v této fázi označit jen jako **capability**, nezaváděj falešně funkční stash, healer nebo fast travel.
- Všechny vytvořené body musí být rozumně uvnitř trvalé safe zone, dosažitelné dle existujících překážek; validuj rozestupy, spawn/obstacle overlaps, hranice a negativní či non-finite hodnoty. Chování stejné pro libovolný seed; nevytvářej nové náhodné souřadnice.
- Externí mutable objekty nikdy nesmějí měnit originální manifest; vracej kopie nebo zmraz data, přímo validuj untrusted ID.

## TDD a acceptance testy ve vlastním souboru

1. Existence každé požadované role včetně min. 2 civilistů, stabilní ID, jedinečnost, pozice 3 historických NPC beze změny.
2. `generateWorld(seed)` pro více seedů (včetně 0, 1, max uint32) — město stále stejné; service body neblokují `canOccupy`. Ověř i modelované nevalidní blokování.
3. Reálné dosahy pro kliknuté body; NPC mimo dosah není okamžitě interaktivní; mimo safe zone škodlivé akce nemá manifest rozhodovat.
4. Žádná mutace vráceného manifestu a žádné mutace předaného layoutu; unknown ID, `NaN`, Infinity, null a nevalidní pozice bezpečně zamítnuty.
5. Žádný přímý import Phaser/Svelte/browser DOM, žádná změna stávajícího first questu nebo world generation.

## Pracovní postup a PR

1. Přečti `AGENTS.md`, `docs/plan/agents/README.md`, `WAVE_D.md`, `INTEGRATION_D.md` a originální Prompt 18.
2. Vytvoř izolovaný worktree z **stejného BASE_SHA** jako agenti 23–24, zapiš SHA do PR. Nepracuj přímo v `main`.
3. Nejprve vlastní červené testy, pak minimální implementace, pak zelené testy (RED→GREEN).
4. V `web/` spusť `npm ci --no-audit --no-fund`, `npm run check`, `npm run test` a `npm run build`. V PR uveď každé PASS/FAIL/NOT RUN a případný nedostatek prostředí.
5. `git diff --name-only BASE_SHA...HEAD` musí ukázat **přesně tyto 2 soubory**. Otevři **draft PR do main** s exportovaným API, důkazem TDD, testy a integračním handoffem. **Neslučuj PR ani nedeployuj.**

## Handoff integrátorovi

Jediný integrátor rozšíří NPC typy/picker v `world/npcs.ts`, napojí manifest na simulaci a scény, přidá Svelte služby, lokalizace a E2E. Zvlášť posoudí perzistenci stash a úplnost Promptu 18. **Samostatný manifest nesplňuje dokončený Prompt 18.**

## Prompt pro samostatného agenta

> Jsi **Agent 22 (Wave D, Prompt 18)** pro `Nereziel/dark_fantasy_2d_arpg`. Nejprve přečti celé `docs/plan/agents/22/TASK.md`, `WAVE_D.md`, `INTEGRATION_D.md`, `AGENTS.md` a původní Prompt 18. Ze společného BASE_SHA integrátora založ vlastní branch `agent/22-prompt-18` a vlastní worktree. TDD vytvoř **jen** `web/src/game/world/townManifest.ts` a `web/tests/unit/Agent22TownManifest.test.ts`. Zachovej stávající NPC ID, CAMP, souřadnice a safe zone; dodej deterministický městský manifest s kategoriemi služeb, validací a neblokovanou navigací. Nepřipojuj `GameSimulation`, UI, save, lokalizaci ani nové závislosti. Spusť check/test/build, otevři pouze **draft PR** s přesným dvousouborovým diffem a detailním handoffem. **Neprováděj merge.**
