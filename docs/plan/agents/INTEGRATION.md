# Integrátor — bezpečné sloučení paralelní vlny A

Tento dokument patří **koordinátorovi**, ne souběžně pracujícím agentům.

## Zmrazené kontrakty po dobu vlny

Read-only pro všechny agenty:
- `web/src/game/core/GameSimulation.ts`, `web/src/game/core/types.ts`, `web/src/game/bridge/GameBridge.ts`
- `web/src/game/phaser/FrontierScene.ts`, `web/src/App.svelte`, veškerý `web/src/ui/`
- `web/src/game/data/classes.ts`, `web/src/game/data/items.ts`, `web/src/game/enemies/`, `web/src/game/skills/`
- `web/src/persistence/`, `web/src/i18n/`, `web/package*.json`, `.github/`
- všechny existující `web/tests/` **kromě výhradně přiděleného nového testu** pro každého agenta
- `docs/`, `README.md`, `AGENTS.md`, původní seznam 63 promptů

Existující exporty v `deriveStats.ts`, `player.ts`, `navigation.ts` musí zachovat signatury. Změna veřejné signatury či původních hodnot chování je integrační návrh, ne samostatné rozhodnutí agenta.

## Start vlny

- [ ] Ujistit se, že `main` je zelený (TypeScript, Vitest, build, Chromium).
- [ ] Zapsat startovní SHA: `git rev-parse origin/main`.
- [ ] Vytvořit oddělené `agent/01-player-stats`, `agent/02-navigation`, `agent/03-context`, `agent/04-bindings`, `agent/05-typed-damage` všechny ze stejného SHA.
- [ ] Založit každému agentu samostatný worktree, předat jen jeho `TASK.md`.
- [ ] Zamezit agentům přístup k automatickému push/merge do main a deployment oprávněním.
- [ ] Nepřidělovat druhému agentu nové úpravy stejného souboru během vlny.

## Kontrolní brána každého PR

- [ ] PR vychází ze schváleného základního commitu; žádný rebase obsahující neověřené úpravy ostatních agentů.
- [ ] Zobrazit `git diff --name-only <BASE_SHA>...HEAD`, porovnat **položku po položce** s write-setem v README; libovolný jiný soubor → vrátit k opravě.
- [ ] Srozumitelné testy nejprve prokazatelně selhaly před opravou; výsledek opravy má smysluplné asserty.
- [ ] Stabilní a kompatibilní exporty, žádné změny kontraktů GameCommand/GameSnapshot/savů.
- [ ] Determinismus, žádné skryté časovače/události, neschválené knihovny ani cizí assety.
- [ ] `cd web && npm ci --no-audit --no-fund && npm run check && npm run test && npm run build && npm run test:e2e`.
- [ ] `node tests/site.test.mjs` z rootu.
- [ ] Review: správnost hranic, finite/edge-case ošetření, výkonnost a absence změn mimo scope.
- [ ] PR nesmí automaticky označit celý původní prompt jako hotový: zatím jde o modulární přípravu.

## Integrace se provádí **až po skončení souběžné práce**

1. Vzít agent 01, ověřit a integrovat modulární model postavy do runtime podle **Promptu 02**. Dovršení Promptu 02 lze označit až po ověření zbývajících modularizačních a akceptačních bodů.
2. Vzít agent 02, integrovat pomocníka dosažitelnosti do pohybu a klikání podle **Promptu 03**. Zde koordinátor sám vlastní změny `GameSimulation.ts` a `FrontierScene.ts`, testy držení LMB, kolizí a UI kliků.
3. Vzít agent 03 a jako další integrační změnu zapojit centrální `contextResolver` podle **Promptu 04**. Doplnit hover/cursor indikátory, vzdálenost interakcí a soulad kliknutí s typovanými `GameCommand`.
4. Vzít agent 04 a teprve poté připojit mapování vstupu do Phaser adaptéru podle **Promptu 05**. Zařadit force move, hold position a směrované skilly; rozšíření `GameCommand` připadá výhradně integrátorovi.
5. Vzít agent 05 a připojit typovanou damage pipeline podle **Promptu 06**, s konkrétními testy přes simulaci, bojové události, cílové odolnosti, heal/shield a bez regressí.
6. **Po každé jednotlivé integraci:** přepustit kompletní typovou kontrolu + testy + build + Chromium. Následně upravit `docs/IMPLEMENTATION_STATUS.md` se skutečným stavem.
7. Až po zeleném `main` a ověřeném Pages deploymentu se může začít další vlna (Prompt 07 a výš).

### Ochrana před falešným paralelismem

- Žádné dvě osoby neupravují `GameSimulation.ts` současně, a to ani v oddělených větvích.
- Zelené individuální unit testy nejsou důkaz hotové integrace.
- Pozdější prompt lze **připravit** dřív, než je dokončen předchozí, ale nesmí se aktivovat v runtime ani označit jako hotový.
- Když PR vyžaduje rozšíření společného typu, agent dodá návrh v popisu PR; samotnou změnu udělá až integrátor po předchozích PR.
- Při neočekávaném zásahu do cizích souborů je jediný bezpečný postup agentův PR vrátit a izolovat změnu.
- Když nelze spustit všech pět agentů nebo nemají oddělené worktree, spusť méně agentů; nikdy je nepouštěj do jedné pracovní kopie.

## Release pravidla

Character-only save v8, nemigrovat staré save; neukládat mapu, nepřátele, boss fight, cooldowny ani dočasné efekty. Zachovat CS/EN, determinismus simulace, dosavadní ovládání a navigaci, statickou base path GitHub Pages. Licence vlastního kódu GPL-3.0-only, externí zdroje pod vlastními licencemi.

Pokud produktové testy nebo release CI selžou, **nezobrazuj výsledek jako nasazený**; oprav a znovu ověř.
