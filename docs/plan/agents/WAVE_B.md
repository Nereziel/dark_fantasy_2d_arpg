# Aether & Ruin — Wave B: independent agents 06–15

**Target:** prepare Prompts 07–11 concurrently; integrate gameplay sequentially in original prompt order, after verifying existing Prompts 02–06 baseline.
**Status:** planning only. No agent has been started, and none of these isolated tasks completes a prompt acceptance gate.
**Sources:** `2d_arpg_implementation_prompts.md`, `docs/IMPLEMENTATION_STATUS.md`, `AGENTS.md`.

## Exact exclusive write-sets

| Agent | Prompt | Source file | Unit test | Role |
| --- | --- | --- | --- | --- |
| [06](06/TASK.md) | 07 | `web/src/game/skills/warriorKit.ts` | `web/tests/unit/Agent06WarriorKit.test.ts` | Warrior skill catalog |
| [07](07/TASK.md) | 07 | `web/src/game/skills/warriorEconomy.ts` | `web/tests/unit/Agent07WarriorEconomy.test.ts` | Warrior resource and cooldown rules |
| [08](08/TASK.md) | 08 | `web/src/game/animation/combatTimeline.ts` | `web/tests/unit/Agent08CombatTimeline.test.ts` | Combat animation timeline |
| [09](09/TASK.md) | 08 | `web/src/game/phaser/combatVfxPlan.ts` | `web/tests/unit/Agent09CombatVfxPlan.test.ts` | Combat visual effects plans |
| [10](10/TASK.md) | 09 | `web/src/game/status/statusDefinitions.ts` | `web/tests/unit/Agent10StatusDefinitions.test.ts` | Status effect definitions |
| [11](11/TASK.md) | 09 | `web/src/game/status/statusRuntime.ts` | `web/tests/unit/Agent11StatusRuntime.test.ts` | Status timer and stacking runtime |
| [12](12/TASK.md) | 10 | `web/src/game/enemies/behaviorPlanner.ts` | `web/tests/unit/Agent12EnemyBehaviorPlanner.test.ts` | Enemy AI behavior planner |
| [13](13/TASK.md) | 10 | `web/src/game/enemies/archetypeCatalog.ts` | `web/tests/unit/Agent13EnemyArchetypes.test.ts` | Enemy archetype configurations |
| [14](14/TASK.md) | 11 | `web/src/game/enemies/families/undeadBeasts.ts` | `web/tests/unit/Agent14UndeadBeasts.test.ts` | Undead and Beast monster families |
| [15](15/TASK.md) | 11 | `web/src/game/enemies/families/banditsCultists.ts` | `web/tests/unit/Agent15BanditsCultists.test.ts` | Bandit and Cultist monster families |

Each of these 20 paths is new in the planning baseline. Every worker owns exactly two files, never a whole directory. No worker may write or import another worker's new file. If a path already exists at dispatch, stop and replan.

## Frozen integration surfaces

All workers must treat as read-only: `web/src/game/core/GameSimulation.ts`, `web/src/game/core/types.ts`, `web/src/game/skills/skills.ts`, `web/src/game/entities/playerAnimation.ts`, `web/src/game/status/effectStack.ts`, `web/src/game/enemies/enemies.ts`, `web/src/game/phaser/FrontierScene.ts`, `web/src/App.svelte`, `web/src/ui/**`, `web/src/i18n/**`, `web/src/persistence/**`, `web/package*.json`, `.github/**`, `AGENTS.md`, `docs/**`, `all existing web/tests/**`. Only the coordinator may modify these during sequential integration.

## Contracts shared by documentation (not cross-agent imports)

- Agents 06 and 07: exactly seven Warrior abilities including basicAttack, cleave, charge, groundSlam, warCry, whirlwind, execute. The skill catalog is independent of the economy/approach resolver. Existing runtime supports only rmb/slot1; coordinator expands command/binding/UI slots later.
- Agents 08 and 09: timeline controls authoritative hit timing in pure TS; VFX plan is a passive view descriptor. Neither module depends on the other or executes real damage/render effects on its own.
- Agents 10 and 11: registry and runtime each define local input types. The integrator will unify these into ONE status effect model and prevent duplicate tick processing.
- Agents 12 and 13 use exact AI IDs: `meleeAggressor`, `rangedAttacker`, `defensive`, `healer`, `summoner`, `ambusher`, `charger`, `caster`, `support`. Agent 12 accepts explicit config; Agent 13 provides independent data.
- Agents 14 and 15 provide a matching monster schema: `id`, `family`, `archetypeId`, `attackStyle`, `health`, `speed`, `baseDamage`, `aggroRange`, `attackRange`, `preferredDistance`, `lootTableId`, `spriteKey`, `animationKey`, `abilities`. Define it locally per module until coordinator creates a common definition. Reuse the nine AI IDs; no import of Agent 13. Asset keys are placeholders/references, not new visual assets.
- All modules use stable language-neutral IDs; no fake player-facing translations, no UI text, no new asset bundles, no Phaser imports in core logic. Existing character-only save v8, RNG/typed damage and current enemy encounters remain untouched.

## Dispatch and gates

1. Coordinator verifies current main CI passes: npm ci, check, Vitest, build, Playwright Chromium and legacy site test. A recent merge commit without a confirmed workflow result does not qualify as green.
2. Merge this documentation plan, then pin one BASE_SHA from main. Start up to ten isolated worktrees/branches `agent/06-warrior-kit` through `agent/15-bandits-cultists` from that SAME SHA; fewer if machine capacity is limited.
3. Paste the complete agent prompt from each `NN/TASK.md`. Require RED -> GREEN commits, correct write-set, strict TypeScript, deterministic unit tests and PRs; agents do not merge or deploy.
4. Each PR: inspect `git diff --name-only BASE_SHA...HEAD` and require only assigned source/test. Run `cd web && npm ci --no-audit --no-fund && npm run check && npm run test && npm run build && npx playwright install chromium && npm run test:e2e` and root `node tests/site.test.mjs`. If unavailable, mark NOT RUN; do not pretend PASS.
5. Integrate separate modules only after verified PRs. Activate runtime sequentially 07 -> 08 -> 09 -> 10 -> 11 using `INTEGRATION_B.md`. A merged helper is NOT prompt completion. Update status only when actual gameplay/UI/browser checks pass.
6. Documentation-only commits must not deploy Pages. Coordinator owns single merge/deploy pipeline and post-merge quality gate.
