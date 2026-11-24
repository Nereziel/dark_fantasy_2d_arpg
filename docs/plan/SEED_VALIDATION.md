# Procedural seed validation — Issue #113 (Act I baseline)

This is the renderer-free, deterministic seed validation harness for Aether & Ruin.
It exercises the **actual runtime assembly** in `buildWilderness` and
`buildCryptWorld`, not copies of the procedural generators.

## Quick regression (PR CI)

From `web/`:

```sh
npm test -- tests/unit/Issue113SeedValidation.test.ts
```

By default this checks 24 arithmetic seeds plus well-known boundary values,
covering the Act I town, NPC services, mandatory story locations, roads, encounters,
dungeon entrance, exit, guardian rooms and boss path.

## Exhaustive / scheduled sweep

From `web/`:

```sh
SEED_SWEEP_START=0 SEED_SWEEP_COUNT=1000 npm test -- tests/unit/Issue113SeedValidation.test.ts
SEED_SWEEP_START=100000 SEED_SWEEP_COUNT=1000 npm test -- tests/unit/Issue113SeedValidation.test.ts
```

Use batches rather than adding thousands of expensive navigation/pathfinding
checks to every PR. `SEED_SWEEP_COUNT` is bounded to 1–5000,
`SEED_SWEEP_START` to uint32. Traversal uses a deterministic jump of 7919
in modulo-uint32 space; the same command always samples the same seeds.

Failures report the exact **seed, region and critical target ID**, with a
single-seed replay command. The harness verifies:
- Safe camp, all NPC service points and unique obstacle IDs
- Reachable Act I mandatory quest points, crypt entrance and encounter spawns
- Visible roads with valid endpoints and clear navigation waypoints
- Dungeon entry/exit, boss and guards, required feature/encounter positions
- Generator self-validation and independent path/geometry checks
- Stable JSON-shaped output on exact seed replay
- Rejection of NaN, infinities, fractional, negative and out-of-range seeds
- Deterministic validated dungeon fallback at zero attempt budget

## Populated village acceptance (Issue #208)

The wilderness sweep validates each published village's residents, roles,
forge, building entrances and pedestrian paths. It logs a JSON
`[Act I village coverage]` report with the total, complete count and missing
seeds, distinguishing topology from population failure.

Both populated villages are required by default, including the 31-seed PR
baseline and the seven historical regression seeds. Larger sweeps are strict
by default as well; use `SEED_SWEEP_REQUIRE_VILLAGES=0` only for diagnostic
coverage collection (not acceptance). For a larger acceptance sample:

```sh
SEED_SWEEP_REQUIRE_VILLAGES=1 SEED_SWEEP_START=0 SEED_SWEEP_COUNT=1000 npm test -- tests/unit/Issue113SeedValidation.test.ts
```

A failed strict sweep reports the incomplete seeds and a replay command.
This is sampled evidence, not a mathematical guarantee across all uint32 seeds.
The replay includes the fixed boundary samples as in the original harness.

## Extended GitHub Actions sweep

The dedicated `.github/workflows/act1-seed-sweep.yml` workflow runs when
that workflow changes in a PR, or manually using **Actions → Act I extended
seed sweep → Run workflow** after it is merged. It is not added to the
normal per-PR acceptance job.

Four independent shards use start seeds 0, 1979750, 3959500 and 5939250,
each with count 250 and strict village acceptance enabled. This covers
1000 distinct arithmetic seeds plus the fixed boundary samples (replayed
in each shard). Fail-fast is disabled so one failing shard does not cancel
the remaining reports. Logs are uploaded even when a shard fails, with
seven-day retention; a nonzero test exit remains a failed CI job.

The extended sweep is sampled QA, not exhaustive uint32 validation.
A fatal invariant failure can stop its test early; a successful run
requires every shard to finish successfully.

## Scope and future acts

**This PR is the Act I subset of Issue #113, not the full Prompt 58 acceptance.**
Once Acts II–V (#104–#107) are implemented, expand the same harness with
biome/region/dungeon adapters. Leave Issue #113 open until all mandatory campaign
regions have been swept and replayed. No Phaser/Svelte or saved-game schema
is involved in the seed runner.
