# Reuse závislostí a výsledků validace

Tento postup platí pro další agentní vlny. Nemění existující historické work-sety ani roli integrátora.

## GitHub Actions

- `quality.yml` je jediný validační workflow pro PR i změny v `main`; **job `verify` zachovává existující název required checku**.
- `build` provede check, všechny unit testy, jediný produkční build a kontrolu historického HTML dle scope; uploadne stejný `web/dist` pro další joby. `pull_request` spustí kompletní sadu, PR nikdy nedeployuje.
- Chromium se dělí na dvě paralelní části běžných testů a samostatný průchod Aktu I (`--grep 'natural first Act I loop:'`). Komplementární `--grep-invert` a sharding zachovají úplné pokrytí, včetně touch-loot scénáře ze stejného souboru. Průchod Aktu I běží bez automatického retry, takže se jedna chyba neopakuje po celém průchodu. Běžné testy zachovávají svůj dosavadní retry.
- `verify` je povinná souhrnná brána: vyžaduje úspěch buildu a všech tří browser lanes. V případě selhání používej **Re-run failed jobs**, který znovu nespustí úspěšné části a využije výstup přesného buildu v témže runu. Trace neúspěšných browser testů jsou k dispozici jako artefakty jednotlivých lanes. Lokální cílený průchod: `cd web && npm run test:e2e -- --grep 'natural first Act I loop:' --workers=1 --retries=0` (po buildu).
- `push` do `main` validuje změny v `web/**`, `tests/**`, quality workflow a sdílených Actions. Publikace nastane při změně vstupů hry (`web/src`, `web/public`, hlavních konfigurací/dependencies nebo `.github/actions`) či samotného `quality.yml`. Dokumentace a testy bez změny hry nezpůsobí publikaci.
- `workflow_dispatch` provede plnou validaci a v případě úspěchu znovu publikuje.
- `verify` stáhne přesný produkční balíček z `build`, ověří base path a nahraje `web/dist` jako Pages balíček až po úspěchu všech E2E lanes. Název obsahuje SHA a číslo pokusu. Job `deploy` dostane přesný název z výstupu `verify` a publikuje jej pomocí `actions/deploy-pages`. Při opakování pouze nasazovacího jobu se použije již ověřený balíček.
- `setup-node` používá npm download cache podle `web/package-lock.json`; `npm ci` stále instaluje soubory z důvěryhodného lockfile. **Nekešovat a nesdílet `node_modules` mezi worktree**.
- Pro headless Chromium se instaluje jen shell (`npx playwright install --only-shell chromium`). Pokud budoucí E2E začnou vyžadovat headed browser, vraťte plnou instalaci.
- Při chybějícím push `before` commitu se nasazení raději povolí (fail-safe směrem k publikaci), stále až po GREEN. Cache ani artifact se nepoužívají jako důkaz úspěchu jiného SHA.

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
