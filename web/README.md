# Aether & Ruin — Svelte / Phaser staging app

This is the **new, non-production** browser client. It is intentionally isolated from the root legacy HTML game. Do not publish `web/dist/` as the GitHub Pages artifact until functional parity has been demonstrated.

## Stack

Svelte 5, Phaser 4.2.1, TypeScript, Vite, svelte-i18n, Vitest. Language catalogs: `src/i18n/locales/{cs,en}.json`.

## Local development

```bash
cd web
npm ci
npm run dev
npm run check
npm run test
npm run build
```

This first slice is a **new architectural sandbox**, not a complete port of the legacy game. It includes click-to-move, a basic enemy, simple combat, HUD, runtime Czech/English toggle and IndexedDB save/load. Existing legacy saves are not yet migrated.

A fixed Vite base path (`/dark_fantasy_2d_arpg/`) is used for the planned Pages destination. Locally, the Vite development server serves the app at its configured base path; `VITE_BASE_PATH=/` may be used for a root-path preview.

## Layers

- `src/game/core`: renderer-agnostic fixed-step combat/movement state
- `src/game/bridge`: game commands and throttled read-only UI snapshots
- `src/game/phaser`: visual scene and camera/pointer adapter
- `src/ui`: Svelte HUD and menu
- `src/i18n`: Czech/English catalogs and preference
- `src/persistence`: independent browser-local save adapter

See `../docs/ARCHITECTURE.md` and `../2d_arpg_implementation_prompts.md` for the longer-term plan.
