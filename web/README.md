# Aether & Ruin — Browser client

Svelte 5 + Phaser 4 + TypeScript + Vite. This is the **live GitHub Pages application**, still under active migration from the legacy HTML engine.

## Development

```bash
npm ci
npm run dev
npm run check
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Production base path: `/dark_fantasy_2d_arpg/` (also served by the Vite development server). Gameplay and translated display content are separate; the UI offers `cs` and `en`.

## Current functionality

Six classes with original base stats/resources, mouse movement/targeting, basic attacks, **two active skills per class** (Q/right mouse and 1), cooldowns, damage-over-time and buffs, combat feedback, XP/gold/level progression, deterministic loot, inventory/equipment and runtime Czech/English switching. Three enemy archetypes (wraith / skeleton / corrupted wolf) spawn **together in groups of three**, with separate AI, health, damage effects, cooldowns and dodgeable telegraphs. Target opponents directly in Phaser or with the accessible enemy list. World navigation uses collision-aware movement and bounded A* around fixed obstacles. Only **current-format v5** IndexedDB saves are supported; no legacy/demo save import.

The original HTML game remains in the repository for reference, but is not in the Pages build. This does **not** mean that the original full game content has been migrated.
