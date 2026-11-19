# Agent 11 — Status timer and stacking runtime (Wave B, Prompt 09)

**Goal:** Implement a pure deterministic status reducer with expiry, ticks, stacking, dispel and immunity.

**Exclusive write-set (create only these two files):**
- `web/src/game/status/statusRuntime.ts`
- `web/tests/unit/Agent11StatusRuntime.test.ts`

## Copy-paste prompt for the agent

You are **Agent 11** implementing an isolated, testable foundation for **Prompt 09** in Aether & Ruin. Respect the exact write-set, do not implement runtime integration or change shared interfaces.

- Read AGENTS.md, docs/plan/agents/README.md, WAVE_B.md, this TASK.md, the original numbered implementation prompt, and the existing related source.
- Use your own agent/NN-slug branch and isolated git worktree from the coordinator's common BASE_SHA after plan merge. Do not use a shared checkout.
- Write ONLY the two allocated paths below; everything else is read-only, including GameSimulation.ts, core/types.ts, skills/skills.ts, entities/playerAnimation.ts, status/effectStack.ts, enemies/enemies.ts, FrontierScene.ts, all UI/i18n/persistence, package files, workflows, docs and existing tests. Do not import new files developed concurrently by other agents.
- Test-first: commit a meaningful RED regression before implementing GREEN. TypeScript strict, immutable finite input/output, deterministic timing, no Math.random/Date.now, DOM/Phaser mutation in game rules, or unapproved dependencies/assets. Use existing public types as read-only imports only; define local interfaces if needed.
- Preserve character-only v8 save, localization boundaries (no hardcoded player-facing strings), current gameplay and GPL-3.0-only original code. No asset creation or new licenses under an isolated module task.
- PR only, no merge/main push/deployment. Include BASE_SHA, exactly two changed paths, RED/GREEN evidence, exported API, real test results and coordinator handoff. The isolated deliverable is NOT full prompt acceptance.

## Tasks (test-driven)

- [ ] **Task 1 — API contract:** Export local StatusRule/StatusInstance types, applyStatus, advanceStatuses, dispelStatuses, getStatusModifiers. Tick results are structured events; never apply HP directly.
- [ ] **Task 2 — RED tests:** Test refresh/add/replace/strongest, max stacks, immunity, duration expiry, repeated periodic ticks, status query and source preservation.
- [ ] **Task 3 — GREEN implementation:** Handle one large tick vs multiple smaller ticks, invalid/nonfinite values and cap generated periodic events.
- [ ] **Task 4 — Edge and regression cases:** Do not import Agent 10. Integrator unifies local types with canonical status catalog and removes double ticking.
- [ ] **Task 5 — Handoff:** undefined

## Required verification before PR

- [ ] `cd web && npm ci --no-audit --no-fund`
- [ ] `cd web && npm run test -- tests/unit/Agent11StatusRuntime.test.ts`
- [ ] `cd web && npm run check && npm run test && npm run build`
- [ ] `cd web && npx playwright install chromium && npm run test:e2e`
- [ ] `node tests/site.test.mjs` (from repository root)
- [ ] `git diff --name-only BASE_SHA...HEAD` contains exactly the two files above.
- [ ] Mark every step PASS/FAIL/NOT RUN truthfully and submit a PR. In PR explicitly state that original Prompt 09 remains incomplete until sequential coordinator integration.
