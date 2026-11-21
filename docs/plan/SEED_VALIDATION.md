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

## Scope and future acts

**This PR is the Act I subset of Issue #113, not the full Prompt 58 acceptance.**
Once Acts II–V (#104–#107) are implemented, expand the same harness with
biome/region/dungeon adapters. Leave Issue #113 open until all mandatory campaign
regions have been swept and replayed. No Phaser/Svelte or saved-game schema
is involved in the seed runner.
