# Vlna D — tři nezávislí agenti, Prompty 18–20

**Stav:** pouze připravené zadání. Žádný agent vlny D nebyl spuštěn a žádný její herní systém není tímto plánem dokončen. **Maximální počet současně pracujících agentů: 3** (záměrně méně než požadovaný strop 5).

**Cíl:** nejprve stabilizovat město, ekonomiku a univerzální dialog/quest pravidla nad existující hratelnou vertikální ukázkou. Novou questovou linii (Prompt 21), procedurální divočinu (Prompt 22) a další obsah neposílat do této vlny; jejich integrace by vyžadovala společné změny v mnoha souborech.

**Základ:** po úspěšně nasazené Wave C (#28; main `2f347e16a4210d05acaec87b286db02ed6af98e2`). Skutečný `BASE_SHA` určí integrátor **až při dispatchi**, po merge tohoto dokumentačního PR a kontrole zeleného `main`.

## Exkluzivní write-sety (2 soubory na agenta)

| Agent | Původní prompt | Jediný povolený produkční soubor | Jediný povolený test |
| --- | --- | --- | --- |
| [22](22/TASK.md) | **18 — First Persistent Town** | `web/src/game/world/townManifest.ts` | `web/tests/unit/Agent22TownManifest.test.ts` |
| [23](23/TASK.md) | **19 — Gold Economy and Merchants** | `web/src/game/trade/economyRules.ts` | `web/tests/unit/Agent23EconomyRules.test.ts` |
| [24](24/TASK.md) | **20 — Dialogue and Quest Foundation** | `web/src/game/quests/questDialogue.ts` | `web/tests/unit/Agent24QuestDialogue.test.ts` |

**Průnik jakýchkoli dvou write-setů = prázdná množina.** K 20. 11. 2026 všech šest cílových cest na `main` neexistuje. Integrátor jejich neexistenci zopakuje proti skutečnému BASE_SHA. Pokud cesta existuje, **STOP a přeplánovat**, ne přepsat.

## Rozhraní a hranice odpovědnosti

- **22 / město:** datový manifest služeb a civilistů, fixní souřadnice, safe-zone, validace navigace a čisté vyhodnocení interakce. Reuse existující `CAMP`, `NPC_POSITIONS` a stabilní ID správkyně, obchodníka a kováře. *Žádný nový renderer, UI či rozšíření `NpcId`.*
- **23 / ekonomika:** čisté cenové nabídky, pravidla obchodního rozpočtu a nemutující návrh transakce, deterministické restock/refresh pravidlo. Reuse `commerce.ts`, `Item`, katalog a existující kupní/prodejní ceny tam, kde jsou již autoritativní. *Žádné zásahy do autoritativního gold/inventory stavu.*
- **24 / dialogy a questy:** datový model uzlů/voleb, podmínek, prerequisit, objektivních čítačů a jednorázových odměn; typované čisté evaluátory. Reuse stabilní `FIRST_QUEST_ID`, `WARDEN_ID` jako integrační fixture; *nepřepisovat existující první quest, save nebo NPC UI.*
- **Žádné vzájemné importy z nové trojice modulů.** Importy ze stávajícího `main` jsou povoleny a musí zachovávat kompatibilitu.
- **Pouze integrátor** propojí tři moduly do `GameSimulation.ts`, `core/types.ts`, `world/npcs.ts`, `trade/commerce.ts`, `firstQuest.ts`, Phaser scény, Svelte panelů, CS/EN katalogů, save/migračního kontraktu a UI testů. Ne všechno musí vyžadovat změnu každého souboru; držet malý diff.
- Vlastní tvorba GPL-3.0-only, cizí assety s platnou licencí; žádné nové závislosti, lockfile, externí grafika či konfigurace. Stávající UI a save zůstávají funkční.

## Pravidla paralelního běhu

1. Integrátor ověří GREEN na `main`, zapíše společný neměnný `BASE_SHA` a všem třem agentům předá tentýž commit; každý samostatná `agent/22-prompt-18`, `agent/23-prompt-19` nebo `agent/24-prompt-20` větev a worktree.
2. Agent čte `AGENTS.md`, tento dokument, `INTEGRATION_D.md`, vlastní `NN/TASK.md`, originální prompt 18/19/20 a odpovídající existující kód. Žádný souběžně sdílený worktree.
3. **TDD RED → GREEN** ve vlastním testu; pure TS bez DOM/Phaser/Svelte; neplatné vstupy, bounds, nezdvojené odměny, determinismus (případná náhoda jen předaný RNG). Změny přísně jen ve vlastních **2 souborech**.
4. Agent nevytváří ani neopravuje `GameSimulation.ts`, `App.svelte`, `web/src/ui/**`, `web/src/i18n/**`, `web/src/game/core/types.ts`, save, AGENTS/README/docs, test jiného agenta, CI, `package.json` nebo lockfile.
5. Pokud je potřeba nový sdílený typ či nepovolený soubor, agent to **oznámí v PR**, neobchází omezení.
6. Agent ověří v `web/` `npm ci --no-audit --no-fund`, `npm run check`, `npm run test`, `npm run build`, uvede PASS/FAIL/NOT RUN a důkaz vlastního RED→GREEN. Zveřejní **draft PR do main**, nikdy neslučuje ani nedeployuje.
7. Integrátor ověří diff každého PR proti BASE_SHA, skutečný seznam souborů a API kompatibilitu. Čisté PR mergeuje **22 → 23 → 24** vždy až po zelené CI. Mezi PR žádné agentem řízené runtime přepojování.
8. Integrátor teprve potom postupně realizuje **tři malé integrační kroky** (18 → 19 → 20), s vlastními runtime testy a GREEN po každém; žádný hromadný konfliktový merge.

## Definition of Done a čestné označování stavu

**Agent DONE:** přesně dvě povolené cesty, smysluplné exporty, validace, testy RED→GREEN, check/test/build, draft PR, integrační poznámky. **Agent DONE ≠ Prompt DONE.**

**Prompt DONE:** až po zapojení do živé hry, s funkčními NPC/obchody/questy, správným CS↔EN, správnou perzistencí pouze postavy, browser smoke testy, CI a úspěšným deploymentem `main`. Zatím označovat jako `planned / not integrated`.

Koordinátorův postup je v [INTEGRATION_D.md](INTEGRATION_D.md). **Další vlna E:** Prompt 21 (Act I quest chain) a Prompt 22 (wilderness) teprve po zprovoznění frameworků 18–20.
