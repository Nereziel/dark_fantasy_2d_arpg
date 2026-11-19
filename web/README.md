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

Six classes with original base stats/resources, mouse movement/targeting, basic attacks, **two active skills per class** (Q/right mouse and 1), cooldowns, damage-over-time and buffs, combat feedback, XP/gold/level progression, deterministic loot, inventory/equipment and runtime Czech/English switching. Three enemy archetypes (wraith / skeleton / corrupted wolf) spawn **together in groups of three**, with separate AI, health, damage effects, cooldowns and dodgeable telegraphs. Target opponents directly in Phaser or with the accessible enemy list. World navigation uses collision-aware movement and bounded A* around fixed obstacles. **Character-only v8** IndexedDB saves are supported. Save records contain only class, level, XP, gold, cumulative kills, inventory, equipment (including item temper levels) and permanent quest progress. On load, the hero returns to the safe start position with full health and a new session; monsters, dropped loot, combat cooldowns, active effects and world-state snapshots are not restored. The starter camp is a safe sanctuary. Each session regenerates the surrounding wilderness from a new seed, changing the placement of some ruins and obstacle geometry; full biome generation is still planned. Character changes are autosaved with debounce as well as manually. No legacy/demo save import.

The original HTML game remains in the repository for reference, but is not in the Pages build. This does **not** mean that the original full game content has been migrated.

## First quest: Ashes at the Gate

Warden Vesna stands in the safe Emberwatch camp. Click the NPC or use the quest journal's **Speak to the warden** button to open bilingual dialogue. Accept the quest, defeat three enemies **after accepting**, then return to the warden for a one-time reward of **150 gold and 100 XP**. Quest state (`available`, `active`, `ready`, `completed`) and kill progress survive reloading the character; temporary combat and world state do not. Saves use the current character-only format **v8**; no migration of older demo saves is provided.

## Camp trading and forging

Merchant Bram offers a small fixed stock of basic equipment. Items have fixed buy prices and lower resale values; buying checks gold and backpack capacity, while selling removes exactly one owned backpack item. The blacksmith Odan can permanently temper **equipped** weapons and armor up to **three times**, improving their item stats for increasing gold costs. Unsupported slots, insufficient funds, missing items, remote transactions and attempted fourth upgrades are rejected by the simulation, not only the UI. The player can reach either NPC by clicking in the world or use camp service buttons. Trading pauses the combat simulation while the panel is open.

Item `upgrades` values (0–3), gold, inventory and equipped items are preserved in **character-only v8 saves**. Merchant stock, active dialogs, world state and current combat are not serialized. Pre-v8 demo saves are deliberately not migrated.

## First dungeon: Crypt of the Hollow Crown

An interactable stone gateway just beyond the starter camp leads to a **separate, seed-generated crypt map**. Players may click the gateway or press **Enter the crypt** in the dungeon panel; the hero walks into portal range. Inside, three tougher guardians spawn first. After they are defeated, a stronger **Crypt Lord** and two retainers appear, with larger telegraphed melee danger zones. Clearing that final encounter awards gold and XP in addition to normal drops. A visible return portal (or the **Return to camp** button) takes the hero back at any time.

The crypt uses its own seeded collision obstacles and Phaser floor graphics. Area, dungeon stage, boss state, enemy positions, current battle and uncollected drops are **session-only**; the existing v8 save stores only durable character progression. Reloading the hero starts in the safe camp with a regenerated wilderness. This is a first dungeon prototype, not a full room-and-corridor procedural generator or finished campaign.
