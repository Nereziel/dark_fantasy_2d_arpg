# Agent 12 — Enemy AI behavior planner (Wave B, Prompt 10)

**Goal:** Create pure deterministic AI decisions for nine tactical roles with no Phaser or live encounter changes.

**Exclusive write-set (create only these two files):**
- `web/src/game/enemies/behaviorPlanner.ts`
- `web/tests/unit/Agent12EnemyBehaviorPlanner.test.ts`

## Copy-paste prompt for the agent

You are **Agent 12** implementing an isolated, testable foundation for **Prompt 10** in Aether & Ruin. Respect the exact write-set, do not implement runtime integration or change shared interfaces.

- Read AGENTS.md, docs/plan/agents/README.md, WAVE_B.md, this TASK.md, the original numbered implementation prompt, and the existing related source.
- Use your own agent/NN-slug branch and isolated git worktree from the coordinator's common BASE_SHA after plan merge. Do not use a shared checkout.
- Write ONLY the two allocated paths below; everything else is read-only, including GameSimulation.ts, core/types.ts, skills/skills.ts, entities/playerAnimation.ts, status/effectStack.ts, enemies/enemies.ts, FrontierScene.ts, all UI/i18n/persistence, package files, workflows, docs and existing tests. Do not import new files developed concurrently by other agents.
- Test-first: commit a meaningful RED regression before implementing GREEN. TypeScript strict, immutable finite input/output, deterministic timing, no Math.random/Date.now, DOM/Phaser mutation in game rules, or unapproved dependencies/assets. Use existing public types as read-only imports only; define local interfaces if needed.
- Preserve character-only v8 save, localization boundaries (no hardcoded player-facing strings), current gameplay and GPL-3.0-only original code. No asset creation or new licenses under an isolated module task.
- PR only, no merge/main push/deployment. Include BASE_SHA, exactly two changed paths, RED/GREEN evidence, exported API, real test results and coordinator handoff. The isolated deliverable is NOT full prompt acceptance.

## Tasks (test-driven)

- [ ] **Task 1 — API contract:** Export planEnemyBehavior(context) giving idle/patrol/chase/attack/reposition/flee/return/heal/summon/cast/dead, with explicit origin, actor, target, cooldown, line-of-sight and navigation reachability.
- [ ] **Task 2 — RED tests:** Support meleeAggressor, rangedAttacker, defensive, healer, summoner, ambusher, charger, caster and support; at least three roles must act differently.
- [ ] **Task 3 — GREEN implementation:** Test player death, own death, leash return, blocked path, preferred range, healer/ally priorities and ID tie breaks.
- [ ] **Task 4 — Edge and regression cases:** No import from Agent 13; use explicit planner config. Integrator wires navigation and actions into GameSimulation.
- [ ] **Task 5 — Handoff:** undefined

## Required verification before PR

- [ ] `cd web && npm ci --no-audit --no-fund`
- [ ] `cd web && npm run test -- tests/unit/Agent12EnemyBehaviorPlanner.test.ts`
- [ ] `cd web && npm run check && npm run test && npm run build`
- [ ] `cd web && npx playwright install chromium && npm run test:e2e`
- [ ] `node tests/site.test.mjs` (from repository root)
- [ ] `git diff --name-only BASE_SHA...HEAD` contains exactly the two files above.
- [ ] Mark every step PASS/FAIL/NOT RUN truthfully and submit a PR. In PR explicitly state that original Prompt 10 remains incomplete until sequential coordinator integration.
