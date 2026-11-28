# Reuse závislostí a výsledků validace

## Úsporný režim GitHub Actions

Cíl: méně runner-minut a méně souběžných strojů, ne skrývání neúspěšných testů.

| Událost | Hosted joby | Rozsah |
|---|---:|---|
| Draft PR / iterace | 0 | Cílené testy lokálně |
| Ready PR / změna ready PR | 1 | `verify`: workflow kontrakty, legacy, typecheck, všechny unit testy, build a skutečný browser smoke |
| Push do main | 1–2 | Publish scope; build a Pages pouze při potřebě publikace |
| Ruční quality, mode=full | 1 | Všechny unit a browser testy včetně přirozeného průchodu Aktem I |
| Ruční quality, mode=publish | 1–2 | Obnova Pages, pouze main |
| Ruční seed sweep | 1 | Čtyři sekvenční dávky po 250 seedech |
| Ruční Act I diagnostics | 1 | Zvolený diagnostický rozsah |

- Připrav všechny související změny v draftu. Teprve finální commit označ Ready for review. Neslučuj podle skipped checku: musí existovat skutečný úspěšný job `verify` na aktuálním PR head/merge tree. Při změně headu se ověření opakuje, starý běh se zruší. Bez funkčních Actions se integrace zastavuje; nepřepínej ochranu větve ani neobcházej limity.
- Automatický smoke (`ci-smoke.spec.ts`) ověřuje vytvoření hrdiny, start hry, izometrický canvas a pohyb. Není náhradou plných E2E. Všechny existující testy zůstávají. Při kritické změně simulace, save, navigace, rendereru nebo před přejímkou etapy spusť `full` jednou na finálním SHA (ne na každém malém PR); pokud není rozpočet, plný test lokálně s doloženým SHA a výsledkem. Nespouštěj redundantní ruční diagnostiku po úspěšném full.
- `full` používá jeden Chromium worker, žádný automatický retry, komplementární grep běžných scénářů a natural Act I. Žádný test result cache. Ruční běh nepublikuje, i když je spuštěný z main. Fail nebo timeout nejsou úspěch. Původní `validation-scope.sh` a jeho regresní testy jsou zachované jako historický klasifikátor, nikoli jako spouštěč matice.
- Zachovej dočasný playtest deploy: `build` na main rozhodne publish scope; při shodném již úspěšně publikovaném stromu se npm instalace, build i deploy přeskočí. Při nejasné historii se nasazení obnoví. `deploy` bere výhradně přesný úspěšný build artifact a ověřuje base path. Žádný PR deploy, žádné opakování kompletních testů po merge. Publikace není přejímka.
- Npm download cache podle lockfile, nikdy sdílené `node_modules`. Jediná instalace na runner. Jen headless Chromium shell. Úspěšné testy se neukládají jako velké artefakty, failure trace má retenci dva dny. Produkční bundle/Pages artifact má retenci jeden den; po expiraci proveď ruční publish recovery místo použití jiného SHA.
- Ruční 1000seedová kontrola zachovává všechny čtyři původní disjunktní dávky a povinné kontroly osad; povinná na finálním SHA etapy měnící generování světa. Nemá automatický PR trigger.
- Měř skutečné runner-minuty z prvních srovnatelných běhů. Pokud GitHub omezil Actions, správce musí nejdřív znovu povolit workflow v Actions nebo Settings → Actions → General; respektuj případné omezení GitHubu.

## Lokální agenti

Ze společného konkrétního BASE_SHA a v čistém kořenovém checkoutu:

```bash
bash scripts/agent-bootstrap.sh agent/25-prompt-21 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-25
bash scripts/verify.sh targeted tests/unit/Agent25Example.test.ts
bash scripts/verify.sh agent
```

- Bootstrap vytvoří **vlastní branch/worktree** agenta a jednou v něm provede `npm ci --prefer-offline`; běžná `~/.npm` cache je sdílená, pracovní `node_modules` nikoliv.
- `targeted` zrychlí RED→GREEN iteraci. Před draft PR je stále povinné `agent` (typecheck, **všechny** unit testy, build). Není povoleno prohlásit celý Prompt za hotový jen na základě targeted testů.
- Integrátor na finálním SHA významné změny nebo před přejímkou použije `bash scripts/verify.sh full` (navíc E2E a legacy reference test). Před spuštěním `full` musí být v daném worktree nainstalovaný Chromium browser; v CI se instaluje automaticky.
- Pro PR kontroluj skutečný GREEN pro přesný HEAD; před přejímkou navíc plnou regresi a aktuální deploy. Při změně lockfile, Node verze nebo runtime rozhraní nesmíš přenést staré výsledky testů.

## Diagnostika

```bash
bash scripts/verify.sh act-i-diagnostic evidence
bash scripts/verify.sh act-i-diagnostic crypt
bash scripts/verify.sh act-i-diagnostic story
bash scripts/verify.sh act-i-diagnostic all
bash scripts/verify.sh act-i-browser
```

Ruční workflow `Act I targeted diagnostics` nabízí stejné rozsahy. Diagnostika nenahrazuje required verify nebo kompletní regresi. Natural browser zachovává skutečný průchod s náhodným seedem a normální rychlostí.
