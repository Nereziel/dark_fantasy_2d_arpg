# Agent 14 — Undead and Beast monster families (Wave B, Prompt 11)

**Goal:** Define eight Act I monsters in typed, serializable gameplay data.

**Exclusive write-set (create only these two files):**
- `web/src/game/enemies/families/undeadBeasts.ts`
- `web/tests/unit/Agent14UndeadBeasts.test.ts`

## Copy-paste prompt for the agent

You are **Agent 14** implementing an isolated, testable foundation for **Prompt 11** in Aether & Ruin. Respect the exact write-set, do not implement runtime integration or change shared interfaces.

- Read AGENTS.md, docs/plan/agents/README.md, WAVE_B.md, this TASK.md, the original numbered implementation prompt, and the existing related source.
- Use your own agent/NN-slug branch and isolated git worktree from the coordinator's common BASE_SHA after plan merge. Do not use a shared checkout.
- Write ONLY the two allocated paths below; everything else is read-only, including GameSimulation.ts, core/types.ts, skills/skills.ts, entities/playerAnimation.ts, status/effectStack.ts, enemies/enemies.ts, FrontierScene.ts, all UI/i18n/persistence, package files, workflows, docs and existing tests. Do not import new files developed concurrently by other agents.
- Test-first: commit a meaningful RED regression before implementing GREEN. TypeScript strict, immutable finite input/output, deterministic timing, no Math.random/Date.now, DOM/Phaser mutation in game rules, or unapproved dependencies/assets. Use existing public types as read-only imports only; define local interfaces if needed.
- Preserve character-only v8 save, localization boundaries (no hardcoded player-facing strings), current gameplay and GPL-3.0-only original code. No asset creation or new licenses under an isolated module task.
- PR only, no merge/main push/deployment. Include BASE_SHA, exactly two changed paths, RED/GREEN evidence, exported API, real test results and coordinator handoff. The isolated deliverable is NOT full prompt acceptance.

## Tasks (test-driven)

- [ ] **Task 1 — API contract:** Export UNDEAD_BEAST_MONSTERS and getUndeadBeastMonster(id), plus local definition type with fields specified by WAVE_B.
- [ ] **Task 2 — RED tests:** IDs: skeleton, skeletonArcher, skeletonMage, ghoul, zombie, wolf, spider, corruptedBoar; tactical melee/ranged/caster/ambush/charge differences.
- [ ] **Task 3 — GREEN implementation:** Test eight unique IDs, finite stats, stable archetype IDs, abilities, sprite/animation reference keys only, unknown ID behavior.
- [ ] **Task 4 — Edge and regression cases:** No import from Agent 15/13, no actual sprites, no spawn changes. Integrator unifies schema and adds runtime spawns.
- [ ] **Task 5 — Handoff:** undefined

## Required verification before PR

- [ ] `cd web && npm ci --no-audit --no-fund`
- [ ] `cd web && npm run test -- tests/unit/Agent14UndeadBeasts.test.ts`
- [ ] `cd web && npm run check && npm run test && npm run build`
- [ ] `cd web && npx playwright install chromium && npm run test:e2e`
- [ ] `node tests/site.test.mjs` (from repository root)
- [ ] `git diff --name-only BASE_SHA...HEAD` contains exactly the two files above.
- [ ] Mark every step PASS/FAIL/NOT RUN truthfully and submit a PR. In PR explicitly state that original Prompt 11 remains incomplete until sequential coordinator integration.
