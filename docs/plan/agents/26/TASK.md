# Agent 26 — Wave E / Prompt 22: Procedural Wilderness Terrain

**Stav: ZADÁNO, NESPŮŠTĚNO.** Branch `agent/26-prompt-22-terrain`, vlastní worktree `../worktrees/agent-26`, stejný konkrétní BASE_SHA jako 25/27.

## Přesný write-set (jen 2 nové soubory)

- `web/src/game/world/wildernessTerrain.ts`
- `web/tests/unit/Agent26WildernessTerrain.test.ts`

Nevstupuj do `generator.ts`, `navigation.ts`, `GameSimulation.ts`, Phaser, UI, `core/types.ts`, i18n, save, docs, `package.json`, testů jiných agentů. **Neimportuj soubory vznikající v Wave E.**

## Úkol

Vytvoř čistý deterministic generation plán biome **corrupted frontier / forest** pro stejný rozsah `WORLD_WIDTH × WORLD_HEIGHT`. Návrh API `generateWildernessTerrain(seed: number): WildernessTerrainResult`, obsahující `layout: WorldLayout` (kompatibilní `seed, camp, obstacles, encounterPositions`), typed terrain tiles/palette IDs, cesty a validadční report. Používej výhradně existující `CAMP`, `CAMP_RADIUS`, `OBSTACLES`, `WORLD_WIDTH/HEIGHT`, `ACTOR_RADIUS`, `canOccupy` a `findPath`. Zachovej existující pevné NPC pozice, `soul-shrine`, `field-chest`, přístup k `CRYPT_GATE`, městský přístup, všechny hero/monster spawny a historické tři encounter body i tam, kde se jejich pozice mění deterministicky. Nové překážky nepřekryjí bezpečnou zónu ani důležitý interakční dosah.

Generuj skutečně variabilní terén, komunikovatelné segmenty cest a překážek. Terrain/roads jsou **serializovatelná render data**, žádný Phaser/GameObject/Canvas a žádné uložení do character save. Udrž unikátní stabilní obstacle IDs. Seed policy (pro `NaN/Infinity`, záporná/necelá čísla) musí být explicitní, zdokumentovaná a otestovaná; neplatné vstupy bezpečně odmítej. Pokusy o položení překážek jsou omezené, deterministické, s validací průchodnosti a fallbackem nebo bezpečným návratem chyby; nedělej neomezený reroll. **Nesnaž se implementovat world chunking (Prompt 23) ani dungeon generator.**

## RED→GREEN acceptance

- Stejný seed = bitově/strukturálně identický layout/road/terrain (včetně JSON); rozdílné seedy v testovací matici = významně jiný wilderness, ale město invariantní.
- `seed 0, 1, 2, 42, 0xffffffff`: validní spawn, město a NPC, shrine/chest, 3 encounters, `CRYPT_GATE` a veřejně přístupné cesty, `canOccupy` + `findPath` v actor radius; nikde kolize required bodů a region bounds.
- Čistý read-only výsledek nebo bezpečně kopírovatelné fresh objekty; mutace jedné instance neovlivní nové volání; žádné `Math.random`, clock nebo skryté global state.
- Invalid input/bounds/NaN/Infinity, duplicate obstacle IDs a bounded retry jsou pokryty; vizualizační tile IDs nejsou locale text.
- Konzervativní kompatibilita s existujícím `generateWorld` flow a crypt. Integrace starého volání = práce integrátora.

## Postup a přímý prompt

Přečti `AGENTS.md`, `docs/plan/agents/WAVE_E.md`, `INTEGRATION_E.md`, `WORKFLOW_CACHE.md`, vlastní TASK a původní Prompt 22, k tomu `generator.ts`, `navigation.ts`, `townManifest.ts`, `interactables.ts`. Vlastní branch/worktree ze společného BASE_SHA (ne z jiného agenta). Test RED před GREEN. Z kořene svého worktree:

```bash
bash scripts/agent-bootstrap.sh agent/26-prompt-22-terrain <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-26
bash scripts/verify.sh targeted tests/unit/Agent26WildernessTerrain.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
```

**Draft PR**, přesně dva soubory, testy a API/fallback handoff. Neprováděj runtime změny ani merge.

> Jsi **Agent 26 (Wave E, Prompt 22 — terrain)** v `Nereziel/dark_fantasy_2d_arpg`. Přečti celé `docs/plan/agents/26/TASK.md`, `WAVE_E.md`, `INTEGRATION_E.md`, `WORKFLOW_CACHE.md`, `AGENTS.md` a původní Prompt 22. Ze společného BASE_SHA vytvoř izolovaný worktree a branch `agent/26-prompt-22-terrain`. TDD RED→GREEN implementuj **pouze** `web/src/game/world/wildernessTerrain.ts` a `web/tests/unit/Agent26WildernessTerrain.test.ts`: seedovaný dark forest terrain/roads/obstacle layout kompatibilní `WorldLayout`, validaci a bounded fallback s dosažitelným městem, NPC, shrine/chest, crypt gate a encounter spawny. Žádné importy z nových modulů jiných agentů, změny generator/GameSimulation/Phaser/UI/save ani závislosti. Spusť targeted + agent verifikaci, otevři **jen draft PR** s přesným dvousouborovým diffem a handoffem. **NEMERGUJ.**