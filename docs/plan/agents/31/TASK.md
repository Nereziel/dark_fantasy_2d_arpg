# Agent 31 — Wave G / Prompt 26: Corrupted Crypt Theme

**PŘIDĚLENÁ ROLE: Agent 31.** Původní [Prompt 26](../../../../2d_arpg_implementation_prompts.md) = kompletní dungeonové téma Corrupted Crypt: modulární vizuály, hrobky, rozbitné kontejnery, pasti, nemrtví, ambient hooky, treasure a secret rooms. Tvůj výstup je **čistý typovaný plán tématu + TDD**, nikoli hotový Phaser renderer.

## Jediné dva povolené soubory

1. `web/src/game/world/cryptTheme.ts` (nový)
2. `web/tests/unit/Agent31CryptTheme.test.ts` (nový)

**NESAHEJ na žádný další soubor**, zejména `proceduralDungeon.ts`, `dungeonRuntime.ts`, `generator.ts`, `navigation.ts`, `FrontierScene.ts`, `GameSimulation.ts`, `GameBridge.ts`, `App.svelte`, CSS, lokality CS/EN, assets, save, AI, loot, jiné agenty, CI či package-lock. Neimportuj rozpracované moduly Agent32/33. Kompozici gameplay a Phasera řeší integrátor.

## Instrukce a start

Přečti celé `AGENTS.md`, `docs/plan/agents/README.md`, `WAVE_G.md`, `INTEGRATION_G.md`, `WORKFLOW_CACHE.md` a původní Prompt 26. Přečti aktuální public API:
- `web/src/game/world/proceduralDungeon.ts`: `generateProceduralDungeon`, `validateProceduralDungeon`, `ProceduralDungeonResult`, `DungeonRoomType`, `DungeonRoom`, `DungeonFeature`, `DungeonDoor`.
- `web/src/game/world/dungeonRuntime.ts`: `buildCryptWorld` je canonical runtime adapter; **nesmíš měnit jeho spawny ani geometrii**.
- `web/src/game/world/navigation.ts`: `ACTOR_RADIUS`, `canOccupy`, `findPath`, boundaries 2200×1400.
- `web/src/game/world/interactables.ts`, `enemies/enemies.ts`, `loot/lootTables.ts`: pouze čti; konverze na gameplay autoritu je až integrace.

Všichni agenti použijí stejné **40-char BASE_SHA** sdělené integrátorem po merge plánovacího PR; nezačínej z historického `5db517...`. Izolovaný checkout:
```bash
bash scripts/agent-bootstrap.sh agent/31-prompt-26 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-31
cd ../worktrees/agent-31
```

## Implementace čistého tématického manifestu

1. **Vstup/výstup**: doporučená signatura `buildCryptTheme(dungeon: Readonly<ProceduralDungeonResult>): CryptThemePlan`, explicitně dokumentovaný failure pro chybný dungeon. Vrací immutable / defensive-copy serializovatelnou projekci: `themeId='corrupted_crypt'`, `seed`, `roomVisuals`, `props`, `interactables`, `traps`, `encounterHints`, `audioCues`, `secretHints`, volitelné `validation`.
2. **Úplné prostorové rozložení**: pro všechny `entrance, corridor, combat, elite, event, treasure, trap, boss` místnosti alespoň jeden výrazný typ dekorace a odlišné layer/palette/material/asset keys. Pokud seed obsahuje `secret`, vytvořit stabilní secret hint; nedeklarovat neexistující místnost jako objevenou. Vizuální `assetKey`/ `ambientCueKey` slouží jako resource handoff, ne jako tvrzení, že soubory existují. Přidat fallback `Phaser Graphics` paint hints a depth layer pro případ chybějících atlasů.
3. **World props**: urny, náhrobky, sarkofágy, rakve, lucerny, svícny, kostnice, event runy, pokladnice. Stabilní `roomId` + `propId`, typ a gameplay capabilities: `decorative | breakable | lootContainer | trap | secretReveal`; pro breakable/loot/trap navrhnout `onInteractHookId`, nezapojovat drop ani HP přímo. Volitelné chest/treasure eventy pouze v navštívených místnostech, bez loot na render.
4. **Pasti a bezpečnost**: spike/poison/runic hazard manifest s typovanou trigger oblastí, arming/telegraph/recovery hints a bounded damage/status keys, aby integrátor použil autoritativní combat. Pasti nesmí pokrýt celý vchod/východ ani povinný boss/melee spawn; path `CRYPT_EXIT → encounterSpawns → bossSpawn → exit` musí zůstat průchozí s `ACTOR_RADIUS`. Nezasahuj do `DungeonTile` ani `Obstacle` a neumisťuj fyzické kolize mimo existující mapu.
5. **Nemrtví a atmosféra**: typované `encounterHints` pouze pro existující `EnemyType` (např. skeleton/wraith/crypt_lord), bez přidání runtime enemy. Ambient cue IDs a room-specific intensity/lighting; deterministic no time/hidden Math.random; audio nevydávat za dodané.
6. **Failure policy/DoS**: odmítnout null, untrusted dungeon s falešnou `validation.valid`, wrong seed, duplicitní room/prop IDs, out-of-world coords, invalid API input a nepřiměřené počty. Před budováním velkých výstupů použít `validateProceduralDungeon`, bounded max props per room, deterministic local PRNG seeded by dungeon seed+room identity. Nevyvolávat nevázanou rekurzi, nikdy nevracet modifikovanou input mapu.

## Povinné RED→GREEN testy

- Validní seedy `0,1,2,42,8712,0xffffffff` a generátor fallback `generateProceduralDungeon(seed,{maxAttempts:0})`; vždy deterministicky shodný theme plan a odlišná seed data.
- Všech 8 mandatory typů má theme meta, encounter hints odpovídají undead rosteru, treasure/trap/event mají konkrétní idempotent integration hooks. Secret only if physically present.
- Každý interactable/trap/prop má stabilní unikátní ID, pozice na podlaze a bezpečný radius; nic neblokuje vchod, exit, guard ani bossa. Reference guard v `dungeonRuntime.ts` neměnit.
- Immutable/frozen output a vstup, JSON roundtrip, wrong dimensions/seed, fake passed validation, NaN/Infinity, malformed objects a bounded množství.
- Žádné duplicate loot/reward vykonání: manifest obsahuje **jen** hooky; žádné pokusy volat `rollItem` nebo XP v pure modulu.

## Validace, PR a handoff

```bash
bash scripts/verify.sh targeted tests/unit/Agent31CryptTheme.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
```

Otevři **jen draft PR** z `agent/31-prompt-26`, žádný merge/rebase main a žádné nevyžádané soubory. V PR uveď RED/ GREEN, přesný two-file diff, targeted+full výsledky, CI run pro exact HEAD, exported API, všechna validovaná id/seed invariants, chybějící renderer/ambient asset handoff a návrh jak mapovat interaction hooks. Jsi hotový teprve po GREEN a předání, **nikoli po zapojení do hry**.
