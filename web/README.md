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

Six classes with original base stats and resources, mouse movement/targeting, basic combat, XP/gold/level progression, deterministic item drops, click-to-pickup, inventory and equip/unequip, runtime bilingual UI, IndexedDB game saves and staged-v1 save migration.

The original HTML game remains in the repository for reference, but is not in the Pages build. This does **not** mean that the original full game content has been migrated.
