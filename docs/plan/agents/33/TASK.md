# Agent 33 — Wave G / Prompt 28: The Hollow King Boss Framework

**PŘIDĚLENÁ ROLE: Agent 33.** Původní [Prompt 28](../../../../2d_arpg_implementation_prompts.md) vyžaduje reusable boss engine, boss HP/phase projections, telegraphed attacks, arena, summons, hazards, death/loot a **Hollow King se třemi mechanicky odlišnými fázemi**.

## Jediné dva povolené soubory

1. `web/src/game/bosses/hollowKingPhases.ts` — nová čistá TypeScript phase machine (adresář vytvoř pouze s tímto souborem).
2. `web/tests/unit/Agent33HollowKingPhases.test.ts` — nový TDD test.

V žádném případě neměň soubory Agentů 31/32, `enemies.ts`, `GameSimulation.ts`, `core/types.ts`, `dungeonRuntime.ts`, `proceduralDungeon.ts`, `FrontierScene.ts`, `App.svelte`, `DungeonPanel.svelte`, `lootTables.ts`, `SaveRepository.ts`, questy, i18n, assets či build. Žádné nové importy Agent31/32, žádné runtime side effects, žádný `Math.random`, `Date.now` nebo Phaser.

## Start / současné hranice hry

Přečti celé `AGENTS.md`, `docs/plan/agents/README.md`, `WAVE_G.md`, `INTEGRATION_G.md`, `WORKFLOW_CACHE.md`, originální Prompt 28 a aktuální:
- `web/src/game/world/proceduralDungeon.ts` + `dungeonRuntime.ts`: boss arena, `bossSpawn`, `bossGuardSpawns`, wall geometry a `CRYPT_RUNTIME_BOSS_POSITIONS`. Boss musí být dostupný a exit nezablokovaný.
- `web/src/game/enemies/enemies.ts`: současný boss `EnemyType='crypt_lord'`, runtime actor `id='crypt_lord-4'`, encounter pack stage 1. **The Hollow King je jeho nový name/phase design, nikoli nový incompatible enemy ID**, přejmenování prezentace provede až integrátor.
- `web/src/game/core/GameSimulation.ts`: `dungeonStage=0/1`, `dungeonCleared`, `defeatEnemy`, `seedElitePack`, `statusEffects`, `GameSnapshot` validátor; character-only v11 a world session facts nesmí být měněny agentem.
- `web/src/game/quests/actIQuestChain.ts`: event `crypt_lord_slain` pro quest `crypt_lord_fallen` a navazující `vesnas_report`.
- `web/src/game/loot/lootTables.ts`: existing `bossGuaranteedLoot`, rarity a guaranteed reward semantics; nevolat roll bez integrátora.
- `web/src/game/world/navigation.ts`, `world/generator.ts`, `Dungeon.test.ts` jsou závazné geometry / legacy gameplay invariants.

Vytvoř oddělený worktree až po dodání společného 40-char BASE_SHA integrátorem (po merge plánovacího PR), nikoli `5db5179...`:
```bash
bash scripts/agent-bootstrap.sh agent/33-prompt-28 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-33
cd ../worktrees/agent-33
```

## Pure boss state / phase machine

1. **Stabilní API**: doporučené `createHollowKingState(encounterId, seed)`, `stepHollowKing(state, input)`, `planHollowKingDefeat(state)`, `validateHollowKingState(state)`, `projectHollowKingBossBar(state)`. Všechny plain JSON data, readonly result bez aliasingu inputu, explicitní `ok:false/error` nebo dokumentovaný `RangeError` na invalid inputs.
2. **Tři výrazně odlišné fáze**:
   - P1 (100–70 % HP): pomalejší čitelný frontal/melee cleave, výpad; žádný one-shot damage.
   - P2 (pod 70 % do 35 %): summon bounded undead adds a kontrola arény s vyznačeným bezpečným místem.
   - P3 (pod 35 %): zrychlená střídající se rotace, area/rune hazards a cílený závěrečný útok; nikdy nelze vrátit fázi po heal a po skoku HP 100→20 % se musí přejít přímo do validní třetí fáze.
   - Vynutitelné `windup/telegraph → impact → recovery` bez okamžitého neohlášeného damage; telegraph metadata shape/position/radius/angle + bounded positive duration. Attack pattern má cooldown, max burst/window, no player softlock.
3. **Akce/presenter**: návratové `HollowKingActionPlan` discriminated union pro `telegraph`, `hitWindow`, `spawnAdd`, `hazardStart`, `hazardExpire`, `phaseChanged`, `intro`, `death`. Zahrnout `bossUi` read-only projection (HP, max HP, stage, phase, localization keys, active warning/timer). State musí držet identitu a deterministickou ability rotation, bez runtime `GameEvent` importu z mutable ploch.
4. **Encounter/arena bounds**: použít externě validované souřadnice `bossSpawn`/arena pro bezpečný target/hazard plan (no wall clipping). `CRYPT_EXIT` nesmí být vynuceně uzamčen; žádný lock bránící úniku. Limit max současně aktivních hazards/add requests, limit duration, max health/delta bounds a max outputs per tick. Náhodnost pouze lokální seedované deterministic PRNG nebo pevná round-robin rotace.
5. **Death & reward**: přechod alive→dead pouze jednou; produce stable `defeatHookId='crypt_lord_slain'`, `questId='crypt_lord_fallen'`, `legacyActorId='crypt_lord-4'` a `rewardPlanId`, který integrátor jednou převede na `bossGuaranteedLoot`. Samotný modul **nesmí** přidat gold, XP, loot ani quest reward. Replay same/dead state vrací nulové nové reward actions. `dungeonCleared` patří do GameSimulation.
6. **Malicious input**: NaN/Infinity HP, negative dt/HP, out-of-bounds, forged actor or encounter IDs, stale state, impossible phase transitions, double action, too many hazards, zero windup, memory explosion, duplicated identifiers; explicitně fail closed a neměnit vstup. State serialization/restoration integrátorem bez duplicity.

## Povinné RED→GREEN testy

- `HP=100%, 70%, 69.999%, 35%, 34.999%, 1%, 0`; heal po progress nesmí vrátit fázi; skok threshold přes více fází; monotonic phase.
- Deterministický tick pro stejné seed/inputs, sekvence windup→hit→recovery, žádný instant untelegraphed damage, opacity/time readable warnings, 3 distinct ability patterns, bounded cooldowns.
- `P2` bounded summons, `P3` hazards expire a player escape route; effect shape in world bounds; no overlaps with mandatory safe spawn.
- Single death/quest hook, guaranteed loot plan exactly once, duplicate lethal hit/repeated `step` nemůže opakovat reward, stable IDs a JSON roundtrip.
- Invalid state/seed/target/time/health, `0xffffffff`, synthetic session IDs, corrupted phase, huge delta max bounded behavior, no mutation/cross-session state leakage.

## Validace / předání

```bash
bash scripts/verify.sh targeted tests/unit/Agent33HollowKingPhases.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
```

Otevři pouze **draft PR** `agent/33-prompt-28`, **nikdy nemerguj main**. Do PR zapiš BASE_SHA, přesný 2-file diff, exported API, event/time/action schema, phase ability table, tests a red→green evidence, CI SHA, integrátorský handoff s `crypt_lord`/quest mappingem a jasné upozornění, že boss HUD, Phaser warnings, authoritative damage/death a real boss duel browser E2E dodá až integrátor. Samotný pure module není kompletní Prompt 28.
