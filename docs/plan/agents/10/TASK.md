# Agent 10 — Status effect definitions (Wave B, Prompt 09)

**Goal:** Define a typed data registry for fifteen gameplay statuses.

**Exclusive write-set (create only these two files):**
- `web/src/game/status/statusDefinitions.ts`
- `web/tests/unit/Agent10StatusDefinitions.test.ts`

## Copy-paste prompt for the agent

You are **Agent 10** implementing an isolated, testable foundation for **Prompt 09** in Aether & Ruin. Respect the exact write-set, do not implement runtime integration or change shared interfaces.

- Read AGENTS.md, docs/plan/agents/README.md, WAVE_B.md, this TASK.md, the original numbered implementation prompt, and the existing related source.
- Use your own agent/NN-slug branch and isolated git worktree from the coordinator's common BASE_SHA after plan merge. Do not use a shared checkout.
- Write ONLY the two allocated paths below; everything else is read-only, including GameSimulation.ts, core/types.ts, skills/skills.ts, entities/playerAnimation.ts, status/effectStack.ts, enemies/enemies.ts, FrontierScene.ts, all UI/i18n/persistence, package files, workflows, docs and existing tests. Do not import new files developed concurrently by other agents.
- Test-first: commit a meaningful RED regression before implementing GREEN. TypeScript strict, immutable finite input/output, deterministic timing, no Math.random/Date.now, DOM/Phaser mutation in game rules, or unapproved dependencies/assets. Use existing public types as read-only imports only; define local interfaces if needed.
- Preserve character-only v8 save, localization boundaries (no hardcoded player-facing strings), current gameplay and GPL-3.0-only original code. No asset creation or new licenses under an isolated module task.
- PR only, no merge/main push/deployment. Include BASE_SHA, exactly two changed paths, RED/GREEN evidence, exported API, real test results and coordinator handoff. The isolated deliverable is NOT full prompt acceptance.

## Tasks (test-driven)

- [ ] **Task 1 — API contract:** Export StatusId, StatusDefinition, STATUS_DEFINITIONS, getStatusDefinition. Fields: duration, magnitude, tickInterval, stackMode, maxStacks, refreshMode, dispelCategory, immunityGroup, visualHook, modifierKind.
- [ ] **Task 2 — RED tests:** Cover burning, chilled, frozen, poisoned, bleeding, stunned, slowed, rooted, silenced, cursed, vulnerable, fortified, shielded, regeneration, haste.
- [ ] **Task 3 — GREEN implementation:** Test unique IDs, valid finite durations, periodic ticks, CC immunity metadata, stack bounds and lookup of unknown ID.
- [ ] **Task 4 — Edge and regression cases:** Do not edit skills.ts or effectStack.ts; no import from Agent 11. Integrator connects runtime, localized UI and visual hooks.
- [ ] **Task 5 — Handoff:** undefined

## Required verification before PR

- [ ] `cd web && npm ci --no-audit --no-fund`
- [ ] `cd web && npm run test -- tests/unit/Agent10StatusDefinitions.test.ts`
- [ ] `cd web && npm run check && npm run test && npm run build`
- [ ] `cd web && npx playwright install chromium && npm run test:e2e`
- [ ] `node tests/site.test.mjs` (from repository root)
- [ ] `git diff --name-only BASE_SHA...HEAD` contains exactly the two files above.
- [ ] Mark every step PASS/FAIL/NOT RUN truthfully and submit a PR. In PR explicitly state that original Prompt 09 remains incomplete until sequential coordinator integration.
