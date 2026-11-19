# Wave B — coordinator-only integration plan

Read WAVE_B.md and original Prompts 07–11. No independent worker may edit shared integration surfaces or merge its own PR.

## Preflight
- [ ] Confirm green main baseline: Node 22 npm ci, check, Vitest, build, Playwright Chromium and legacy site tests. Check CI explicitly; no assumptions.
- [ ] Merge wave plan, record one BASE_SHA, validate the 20 new exclusive file paths and start each agent in an isolated worktree from that SHA.
- [ ] On every PR verify exact 2-file diff, RED->GREEN commits, deterministic tests, module independence, no imports from simultaneous worker PRs, no save or runtime changes.

## Sequential runtime gates (ONLY coordinator edits shared files)

### Gate 07: Warrior combat
- [ ] Integrate Agent 06 skill catalog and Agent 07 Rage/cooldown/approach policy into existing SkillSlot, GameCommand, GameSimulation and typed damage rather than creating a second authoritative system.
- [ ] Complete seven skills with live damage, buffs, Rage, resource/cooldown HUD, auto-approach and Shift hold, and preserve existing RMB/Q and 1 behavior.
- [ ] Add CS/EN names/descriptions, targeted effects, browser gameplay tests for each skill, range and invalid command cases; check compatibility with current weapon handling including two-handed equipment semantics before asserting support.

### Gate 08: attack timing and feedback
- [ ] Attach Agent 08 simulation timeline: damage only on deterministic hit tick; cancel, death, dodge, movement-lock and channel rules.
- [ ] Attach Agent 09 VFX plan to real Phaser visuals, hit flash/trails/impact/pooling and strong-hit feedback. Verify visual vs damage frame alignment and low-FPS behavior with browser tests.

### Gate 09: status effects
- [ ] Reconcile Agent 10 data and Agent 11 reducer with existing skills/effectStack; single canonical status instance and tick pipeline, no duplicated DoT/HoT.
- [ ] Integrate effects, expiry, immunity, dispel, stacking, visual hooks and CS/EN buff/debuff UI timer. Tests for multi-tick and source tracking.

### Gate 10: enemy AI
- [ ] Combine Agent 12 planner and Agent 13 archetype catalog. Integrate decisions into deterministic simulation and existing nav/collision, not Phaser.
- [ ] Demonstrate melee, ranged, healer/support differences in actual browser encounter; player death, leash and blocked navigation must stop invalid attacks. Preserve existing enemy packs and boss regression.

### Gate 11: monster families
- [ ] Unify Agent 14 and 15 definitions, extend EnemyType/spawn factory/renderer from canonical data; provide actual fallback sprites/asset licenses and CS/EN content.
- [ ] Test fourteen family definitions and runtime melee, ranged, charger and healing/support roles with stable IDs; original Act I world/quest fixtures must still work.

## Full acceptance after EACH gate
- [ ] `cd web && npm ci --no-audit --no-fund && npm run check && npm run test && npm run build && npx playwright install chromium && npm run test:e2e`
- [ ] `node tests/site.test.mjs` from root, plus Pages base-path/locale smoke tests.
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` honestly: isolated module merged != prompt Core complete.
- [ ] Preserve character-only save v8 (no temporary combat/world/status data), CS/EN and GPL-3.0-only original work with third-party notices.
- [ ] Coordinator alone controls merges, Pages publication and integration refactors. Docs-only changes never trigger deployment.

**Known blockers:** existing SkillSlot only RMB/slot1, ActiveEffect has fewer status IDs, EnemyType has only four entities, and Phaser scene mostly draws procedural graphics. Address these in coordinator PRs, not agent branches.
