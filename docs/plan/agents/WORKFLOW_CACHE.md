# Reuse závislostí a výsledků validace

Tento postup platí pro další agentní vlny. Nemění existující historické work-sety ani roli integrátora.

## GitHub Actions

- `quality.yml` je jediný validační workflow pro PR i změny v `main`; **job `verify` zachovává existující název required checku**.
- `build` určí publish scope a vytvoří jediný produkční `web/dist`; `checks` běží souběžně (scope/gate regresní testy, typecheck, všechny unit testy a legacy dle scope). Browser lanes čekají jen na build. `pull_request` volí profil podle skutečného merge tree, PR nikdy nedeployuje.
- Chromium se dělí na šest paralelních shardů běžných testů a v plném profilu samostatný průchod Aktu I (`--grep 'natural first Act I loop:'`). Komplementární `--grep-invert` a sharding zachovají všechny běžné scénáře v obou profilech, včetně touch-loot scénáře ze stejného souboru. Průchod Aktu I běží bez automatického retry, takže se jedna chyba neopakuje po celém průchodu. Běžné testy zachovávají svůj dosavadní retry.
- `verify` je povinná souhrnná brána: vyžaduje úspěch buildu, `checks` a všech zvolených browser lanes (6 quick, případně Act I); samostatný shell gate odmítá failure/skipped/cancelled i neznámé výsledky. V případě selhání používej **Re-run failed jobs**, který znovu nespustí úspěšné části a využije výstup přesného buildu v témže runu. Trace neúspěšných browser testů jsou k dispozici jako artefakty jednotlivých lanes. Lokální cílený průchod: `cd web && npm run test:e2e -- --grep 'natural first Act I loop:' --workers=1 --retries=0` (po buildu).
- `push` do `main` validuje změny v `web/**`, `tests/**`, quality workflow a sdílených Actions. Publikace nastane při změně vstupů hry (`web/src`, `web/public`, hlavních konfigurací/dependencies nebo `.github/actions`) či samotného `quality.yml`. Test-only push s již úspěšně publikovanými shodnými vstupy hru znovu nepublikuje; chybějící/neúspěšná/neurčitá historie deploymentu nebo dosud nepublikovaná změna povolí publish úspěšného buildu podle dočasného playtest režimu.
- `validation-scope.sh` volí `quick` (6 shardů) nebo `full` (6 shardů + natural Act I). Quick povoluje výslovně vyjmenované panely inventáře, úschovny, obchodu, item art, globální CSS, překlady, známé mediální soubory, izolované unit/quick E2E testy a dokumentaci. App, NPC dialogy, renderer, navigace, simulace, save, sdílené E2E helpery, natural test, závislosti, CI a neznámé cesty vyžadují full. Smíšený rozsah je full. PR musí mít očekávané rodiče syntetického merge commitu; main musí mít úspěšný poslední Pages deploy a quick diff vůči němu i předchozímu commitu. Nejasnost znamená full. Profil je zaznamenán v job summary. Žádný test result cache; dočasný playtest deploy nenahrazuje validaci.
- `workflow_dispatch` provede plnou validaci a po úspěšném buildu znovu publikuje pouze z `main`.
- **Dočasný playtest režim (PR #276):** `deploy` závisí jen na úspěšném `build` a publish scope pro `main`. Stáhne přesný artifact z buildu, ověří base path a nahraje Pages balíček se SHA a číslem pokusu. `verify` zůstává striktní a červené testy jsou stále červené. PR se nikdy nenasazuje. Návrat k release režimu: změnit `deploy.needs` na `[build, verify]`, přidat `needs.verify.result == 'success'` do podmínky a upravit test dočasného workflow kontraktu.
- `setup-node` používá npm download cache podle `web/package-lock.json`; `npm ci` stále instaluje soubory z důvěryhodného lockfile. **Nekešovat a nesdílet `node_modules` mezi worktree**.
- Pro headless Chromium se instaluje jen shell (`npx playwright install --only-shell chromium`). Pokud budoucí E2E začnou vyžadovat headed browser, vraťte plnou instalaci.
- Při chybějícím push `before` commitu se nasazení raději povolí (fail-safe směrem k publikaci), po úspěšném buildu; přejímka stále vyžaduje GREEN. Cache ani artifact se nepoužívají jako důkaz úspěchu jiného SHA.

## Lokální agenti

Ze společného konkrétního BASE_SHA a v čistém kořenovém checkoutu:

```bash
bash scripts/agent-bootstrap.sh agent/25-prompt-21 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-25
bash scripts/verify.sh targeted tests/unit/Agent25Example.test.ts
bash scripts/verify.sh agent
```

- Bootstrap vytvoří **vlastní branch/worktree** agenta a jednou v něm provede `npm ci --prefer-offline`; běžná `~/.npm` cache je sdílená, pracovní `node_modules` nikoliv.
- `targeted` zrychlí RED→GREEN iteraci. Před draft PR je stále povinné `agent` (typecheck, **všechny** unit testy, build). Není povoleno prohlásit celý Prompt za hotový jen na základě targeted testů.
- Integrátor po runtime změnách použije `bash scripts/verify.sh full` (navíc E2E a legacy reference test). Před spuštěním `full` musí být v daném worktree nainstalovaný Chromium browser; v CI se instaluje automaticky.
- CI a deploy jsou autoritativní: kontroluj GREEN pro přesný HEAD. Při změně lockfile, Node verze nebo runtime rozhraní nesmíš přenést staré výsledky testů.

## Doporučené sledování přínosu

Porovnávat délku `verify` a `deploy` jobu před/po změně; nezaměňovat odhady za měření. Pokud `npm ci` nebo Playwright instalace zůstávají bottleneckem, profilovat jednotlivé kroky z Actions.


## Rychlá diagnostika Aktu I

```bash
bash scripts/verify.sh act-i-diagnostic evidence
bash scripts/verify.sh act-i-diagnostic crypt
bash scripts/verify.sh act-i-diagnostic story
bash scripts/verify.sh act-i-diagnostic all
bash scripts/verify.sh targeted tests/unit/Issue125SealEvidenceInteraction.test.ts tests/unit/WaveGHollowKingCombat.test.ts
bash scripts/verify.sh act-i-browser
```

- Stejné skupiny nabízí ruční workflow `Act I targeted diagnostics` (scope `evidence`, `crypt`, `story`, `all`, `natural-browser`). Nejsou required check, nemají deploy a jejich zelený výsledek nikdy nenahrazuje `verify`. Natural browser stále hraje celý Akt I normální rychlostí, s náhodným seedem, bez retry.
- Osm etap natural E2E loguje `[act-i-stage]` se stavem a skutečným trváním, včetně selhání. Při přijetí optimalizace porovnat nejméně tři srovnatelné běhy (stejný runner a počet testů) s baseline; uložit run ID, kritickou cestu i součet runner-minut. Neporovnávat pouze trvání jobu `verify`, který běží až na konci.
- Dlouhý natural CI trace zachová DOM/action snapshots a finální failure screenshot, ale neukládá průběžné screenshoty ani zdrojové kopie. Quick a lokální traces se nemění. Při reprodukci vizuální chyby použít plný trace lokálně bez `LANE=act-i`.
- Baseline 45578481918: build 95 s (unit 59 s, check 9 s), browser test act-i 337 s, quick-1 252 s, quick-2 314 s. 45586129139 act-i 373 s, failure artifact 513923917 B. Paralelní build/checks by teoreticky odstranil cca 60–70 s z kritické cesty při stejném výkonu runnerů; reálný přínos není dosud změřený. Cena je jeden dodatečný runner a další npm ci.
- Aktuálně šest quick shardů; přínos změn profilu měřit proti full běhům. Zachovat disjunktní úplný seznam rychlých testů.
- Další fáze: na základě stage timings nahradit pevná čekání jen odpovídajícími pozorovatelnými podmínkami (route progress, quest transition, action readiness), s původními deadline a death/failure checks. Izolované browser fixtures pro evidence/boss až po ověření potřeby a existujících testů, striktně oddělené od plného natural průchodu. Nezrychlovat simulaci, nefixovat příznivý seed, nevynechávat save/load či boss kill. Profilovat instalaci/cache pouze pokud je skutečným bottleneckem. 1000-seed sweep zůstává samostatný a povinný v rozsahu roadmapy po změnách geometrie/populace.
- Přejímka: celý required `verify` v PR, shodný tree po merge, úspěšné CI na main a Pages, ověřený deployment recovery. Žádné nahrazování zeleného CI cache výsledků jiného SHA.
