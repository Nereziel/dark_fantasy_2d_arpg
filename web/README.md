# Aether & Ruin — Browser client

Svelte 5 + Phaser 4 + TypeScript + Vite. This directory contains the static game served on GitHub Pages. The root HTML prototype is available as an offline reference.

See the [project README](../README.md) for startup, controls and test commands, the [roadmap](../docs/ROADMAP.md) for scope, and the [implementation status](../docs/IMPLEMENTATION_STATUS.md) for verification and deployment evidence.

## Browser storage

| Record | Contents |
| --- | --- |
| IndexedDB character v11 | Up to 12 saved characters. Each slot stores progression, inventory, equipment, stash and the quest ledger. Supported web character formats v8–v10 migrate explicitly. |
| IndexedDB world v1 | Per-character seed, map discovery, checkpoints and selected persistent facts. A valid record restores the hero’s discovered world in a fresh session. |
| Browser-local settings | Language, bindings, accessibility and audio preferences. |

Loading brings the hero back to camp with full health. The session rebuilds transient encounters, loot on the ground, effects and combat cooldowns. The old HTML prototype uses a separate format.

The production and development base path is `/dark_fantasy_2d_arpg/`. Build and test the client at this subpath when changing assets, navigation or deployment.
