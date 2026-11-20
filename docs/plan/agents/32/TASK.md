# Agent 32 — Wave G / Prompt 27: Mini Boss Framework

**PŘIDĚLENÁ ROLE: Agent 32.** Původní [Prompt 27](../../../../2d_arpg_implementation_prompts.md): reusable mini-boss architecture, čtyři minibossové (Bandit Captain, Graveyard Warden, Brood Mother, Corrupted Knight), unique names, multi-abilities, HP/phases, advanced AI, guaranteed reward plans a intro/arena hooks.

## Jediné dva povolené soubory

1. `web/src/game/enemies/miniBossRules.ts` — **nový** pure TypeScript state/catalog/action planner.
2. `web/tests/unit/Agent32MiniBossRules.test.ts` — **nový** RED→GREEN test.

NEMĚŇ žádný další soubor. Zakázané jsou zvláště `GameSimulation.ts`, `core/types.ts`, `enemies.ts`, `monsterRuntime.ts`, `eliteModifiers.ts`, `lootTables.ts`, `questDialogue.ts`, `actIQuestChain.ts`, `wildernessFeatures.ts`, `FrontierScene.ts`, Svelte, i18n, save, assets, dependencie a soubory Agentů 31/33. Žádné importy z nových Agent31/33. Případné nové `EnemyType` / UI eventy dodělá výhradně integrátor po merge.

## Start / zdroje

Přečti celé `AGENTS.md`, `docs/plan/agents/README.md`, `WAVE_G.md`, `INTEGRATION_G.md`, `WORKFLOW_CACHE.md` a originální Prompt 27. Pro stávající kontrakty čti:
- `web/src/game/enemies/enemies.ts` (`EnemyType`, `EnemyUnit`, `ENEMY_DEFINITIONS`, `PACK_SIZE=3`), `behaviorPlanner.ts`, `monsterRuntime.ts`, `eliteModifiers.ts`.
- `web/src/game/core/GameSimulation.ts`: `spawnMorrow` přidává dosavadní Morrow `actor.id='morrow_gravebound'`, `defeatEnemy` zajišťuje jeho quest `morrow_gravebound_slain` a `uniqueEnemyDefeated` world fact. **Nerozbít identitu ani jednorázovost.**
- `web/src/game/quests/actIQuestChain.ts` pro `morrow_gravebound` a `forgotten_graves` a `world/wildernessFeatures.ts` pro `act1.grave_warden`.
- `web/src/game/loot/lootTables.ts`, `items/itemCatalog.ts`, `world/navigation.ts`: pouze read-only API a loot eligibility; už dnes existuje `bossGuaranteedLoot`.

Vlastní izolovaný worktree a větev:
```bash
bash scripts/agent-bootstrap.sh agent/32-prompt-27 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-32
cd ../worktrees/agent-32
```
Společný 40-char BASE_SHA sdělí integrátor AŽ PO merge plánovacího PR; staré `5db5179...` nepoužívej automaticky.

## Implementace reusable mini-boss datové vrstvy

1. **Čtyři bossové**: typed registry s `MiniBossId = 'bandit_captain' | 'morrow_gravebound' | 'brood_mother' | 'corrupted_knight'` (nebo jasně kompatibilní ekvivalent), stable `displayNameKey`, `family`, navázaný existující `EnemyType`/monster archetype, health multiplier a arena/intro/quest hook IDs. Morrow musí používat **existující `morrow_gravebound` ID**, ne nový save/quest ID; konkrétní world marker `act1.grave_warden`.
2. **Víc schopností a vynutitelné chování**: pro každého min. 2 skutečně odlišné schopnosti, s durations windup→strike→recovery, bezpečnými shape/radius/range, cooldowny a telegraph/hit hooky. Captain: banner/support + heavy cleave; Morrow: necrotic grasp + grave mist; Brood Mother: web control + bounded spawn; Knight: corrupted charge + shadow pulse (příklady, ne jediné řešení). Polovina různých minibossů nesmí být jen přebarvený `wraith`.
3. **Pure state machine**: doporučené `getMiniBossDefinition(id)`, `createMiniBossState(id, instanceId)`, `stepMiniBoss(state, input)`, `planMiniBossDefeat(state, context)`. Akce jsou pouze immutable `MiniBossActionPlan` (telegraph, targeted attack, summon request, hazard, phase transition, intro/death). Integrátor udělá skutečný `damage`, collision validation, actor spawn a quest event. Validuj input HP, HP max, alive, target pos/arena, time delta, cooldowns, phase a replay state. Bez DOM/Phaser, `Date.now`, `Math.random` ani hidden mutací.
4. **Phase/reward**: min. jeden HP-based phase threshold pro vhodné bossy a jejich změněné ability; boss state nesmí zregredovat při heal. `planMiniBossDefeat` se vykoná pouze jednou po skutečném alive→dead, vrací stabilní `defeatEventId` a `rewardProposalId` (guaranteed table hint/rarity), nikdy nevytvoří fyzický item/gold/XP. Reward proposal musí být kompatibilní s dosavadním `lootTables`; nesmí zdvojovat `defeatEnemy` a `questDialogue` odměny.
5. **Arena/quest**: arena metadata je suggestion/hook, žádné runtime locked doors ani teleport, bez vytváření nevstupitelných míst. `morrow_gravebound` quest hook má přesný event ID `morrow_gravebound_slain`; ostatní bossové mají future stable hook IDs, žádné přidání story questů.
6. **Bounded / immutable**: max steps a event count, no infinite tick, max summoned requests, validace `NaN/Infinity`, negative health, impossible phase, forged boss ID, duplicate occurrence, canonical state; serializovatelné immutable outputs bez aliasování caller state.

## Povinné TDD RED→GREEN acceptance

- Parametrický test všech čtyř definic: unique stable IDs, names, family mapping, 2+ abilities, distinct rotation/telegraphs, max HP above comparable normal unit (bez absurdního HP).
- Stage machine pro `0/epsilon/threshold/max` HP a delta `0`, `1/60`, bounded large delta; intro→cast→recovery→next, změna chování po phase transition, deterministic replay.
- Morrow `morrow_gravebound` preserved and `morrow_gravebound_slain` quest hook exactly-once, `act1.grave_warden` marker; žádné forged IDs.
- Bounded adds, safe summon plan, idempotent guaranteed reward/quest plan po porážce, replay a double-death žádné další reward.
- Invalid state/NaN/Infinity/negative/oversized cooldowns, malformed actor/arena, no silent coercion; input remains unchanged and JSON roundtrip stable.

## Test commands, PR a integrační handoff

```bash
bash scripts/verify.sh targeted tests/unit/Agent32MiniBossRules.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
```
Otevři **pouze draft PR** na větvi `agent/32-prompt-27`, nikdy neprováděj merge do main. Handoff popíše exported typy, call sequence, action schema, ID a quest mappings, states + death replay contract, tested seeds/ticks, RED→GREEN, exact 2 files + CI HEAD, a přesný seznam integrátorských runtime úkolů. Katalog je čistá logika; bez runtime napojení není Prompt 27 funkční ve hře.
