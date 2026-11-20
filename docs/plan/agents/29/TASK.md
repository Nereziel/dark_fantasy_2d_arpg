# Agent 29 — Wave F / Prompt 24: World Map, Minimap, Fog of War

**PŘIDĚLENÁ ROLE: Agent 29.** Tato práce je pouze samostatná čistá datová vrstva pro budoucí integraci. Zdroj: \`2d_arpg_implementation_prompts.md\`, **PROMPT 24 — Map, Minimap, and Fog of War**. Dokončený modul sám o sobě neznamená hotové mapové UI.

## Přesně dva povolené soubory

- \`web/src/game/world/mapDiscovery.ts\`
- \`web/tests/unit/Agent29MapDiscovery.test.ts\`

Oba nové, oba výhradně tvé. Zakázáno měnit \`GameSimulation.ts\`, \`FrontierScene.ts\`, \`App.svelte\`, \`core/types.ts\`, \`SaveRepository.ts\`, současné generátory v \`web/src/game/world/\`, i18n, assets, docs, package-lock/CI a testy ostatních. **Neimportuj nový \`chunkStreaming.ts\` od Agenta 28 ani \`proceduralDungeon.ts\` od Agenta 30**.

## Podklady a start

Nejprve celé \`AGENTS.md\`, \`docs/plan/agents/README.md\`, [WAVE_F.md](../WAVE_F.md), [INTEGRATION_F.md](../INTEGRATION_F.md), [WORKFLOW_CACHE.md](../WORKFLOW_CACHE.md), původní Prompt 24. Přečti existující \`web/src/game/core/types.ts\` (\`Point\`), \`world/navigation.ts\` (\`WORLD_WIDTH=2200\`, \`WORLD_HEIGHT=1400\`), \`world/generator.ts\` (\`CAMP\`, \`CRYPT_GATE\`), \`world/wildernessTerrain.ts\` (\`TerrainTile\`), \`world/wildernessFeatures.ts\` (\`WildernessFeature\` s \`mandatory\` a \`presentationKey\`) a \`world/townManifest.ts\`. Nesmíš měnit data jiné domény.

Od integrátora převezmi stejné \`<FULL_40_CHAR_BASE_SHA>\` jako Agenti 28/30 a vytvoř worktree:

\`\`\`bash
bash scripts/agent-bootstrap.sh agent/29-prompt-24 <FULL_40_CHAR_BASE_SHA> ../worktrees/agent-29
cd ../worktrees/agent-29
\`\`\`

## Požadované čisté API

1. **Fog & discovery state**:
   - Definuj \`MapDiscoveryState\` a pojmenované typy \`FogCellId\`, \`DiscoveredLandmark\` či ekvivalenty s verzí/namespace world instance, serializovatelnou readonly strukturou. Doporučené \`MAP_CELL_SIZE=80\` (může být explicitně zdůvodněná jiná hodnota kompatibilní s terénem).
   - \`createMapDiscovery(...)\`: na novém světě vše neprozkoumané kromě **dříve známé** pozice města a případné skutečné startovní blízkosti hráče. Známé město jako značka ≠ odhalená celá mapa. Žádný import React/Phaser/Svelte nebo \`Math.random\`.
   - \`revealAtPosition(state, position, radius, world)\` a případně \`revealTravelSegment(...)\`: odhalí pouze skutečně pozorované buňky podle dodaných souřadnic/intervalů. Integrátor bude reducer volat po ověřených pohybech z \`GameSimulation\`, ne po pouhém kliknutí do oblasti. Teleport, kliknutí na minimapu či změna quest markeru nesmí odkrytím spojnice podvodně odhalit neprozkoumaný prostor.
   - Fog může rozlišovat \`unexplored\`, \`discovered\`, volitelně \`currentlyVisible\`. Aktualizace je **idempotentní**, nemutuje vstup, nikdy neprozradí mimo bounds.
2. **Map/minimap projection**:
   - Pure \`projectMap(state, readonly world/feature data, playerPosition, questHints, options)\`, který poskytuje mapové podklady v **world coords** a typované marker IDs pro UI. Výstup nemá textové řetězce tvrdě zakódované v češtině/angličtině; používej existující \`presentationKey\`, \`markerId\` a stable IDs.
   - Rozlišení typů: player, town, known landmark, quest objective, dungeon entrance, waypoint (prozatím pouze zobrazení), optional POI. **Všechny neobjevené procedurální body skryté** v projekci, včetně pokladů a náhodných eventů. Objevený krypťák/dungeon a prozkoumané lokace se ukáží jen v odpovídajícím stavu.
   - Město může být známé i před průzkumem. Quest marker na neznámém místě nesmí prozradit přesné souřadnice neodkrytého procedurálního POI; maximálně typovaný přibližný hint bez geolokace. Podporuj aktivní/complete quest UI jako readonly vstup, ale **neimportuj** nové moduly agentů.
   - Minimap má stejné authoritative discovery jako velká mapa, pouze jiný viewport/zoom transform. Validuj world bounds, crop, zoom, důležité marker IDs, bez renderování grafiky v tomto modulu.
3. **Safe validation / persistence boundary**:
   - Funkce validace \`validateMapDiscovery(unknown)\` nebo ekvivalent fail-closed, bounded počty buněk a ID, bez unbounded allocations a bez mutace vstupních objektů. Stabilní serializace pro integrátora; nedovolit import state s jinou world instance / seed a tím odhalit cizí náhodný svět.
   - Pokud mapa má být perzistentní přes reload charakteru, integrátor musí výslovně schválit a provést její uložení dle [INTEGRATION_F.md](../INTEGRATION_F.md): **současný save v11 je character-only**, nový world seed vzniká při load; map state může být world-instance scoped. Ty **nepíšeš IndexedDB, localStorage ani save migraci**.
   - \`waypointActivated\` je případně pouze již známý fakt pro ikonku. **Nikdy neimplementuj fast travel**, to je Prompt 36.

## Povinné RED→GREEN testy

- Nová hra: neznámé buňky zůstávají neznámé; camp marker je známý, 80px grid/části okrajových buněk nevynášejí mimo mapu.
- Aktuální hráčova pozice reveal omezený dosahem; opakovaný reveal identický; reálná krátká trasa odkrývá průběžné body, ale teleport přes půl světa neodkryje mezilehlé buňky.
- Viditelnost z více poloh, crop/zoom mapy a mini projekce; stejná data jako zdroj, stejné marker IDs, různý viewport. Seedově stabilní pořadí markerů.
- Procedurální \`wild.poi.*\`, \`wild.treasure.*\`, \`wild.event.*\` skryté do objevení; vyhledat a ověřit skutečné \`buildWilderness(0/1/42)\` manifesty. Město viditelné od začátku, dungeon pouze v povoleném discovery stavu. Neznámý quest marker neprozradí souřadnice.
- Invalid \`NaN, Infinity\`, negativní/frakční/mimo-world coords, příliš vysoký radius, forged ID, nevalidní \`worldInstanceId\`, změna seed/namespace, nekonzistentní obdélníky, nadměrné pole. API vrací řízené failure, žádné crash/uncaught.
- JSON round-trip, immutable snapshots, nezávislost na locale a pořadí volání; žádné kopírování referencí přes update.
- \`0,1,42,0xffffffff\` seeds, start, return, discovered state a přenos jen podle explicitního policy.

## Ověření / draft PR

1. Udělej RED testy, teprve pak GREEN implementaci v rámci dvou souborů.
2. Spusť:

\`\`\`bash
bash scripts/verify.sh targeted tests/unit/Agent29MapDiscovery.test.ts
bash scripts/verify.sh agent
git diff --name-only <FULL_40_CHAR_BASE_SHA>...HEAD
\`\`\`

3. Otevři výhradně **draft PR** do \`main\`, \`Agent 29 — Wave F / Prompt 24 — Map Discovery\`. Popis: exact two-file diff, BASE_SHA, exportované API, všechna pravidla visibility, RED→GREEN, testy, CI, známé limity a přesný integrační handoff pro snapshot/CS+EN UI/save.
4. Nepokoušej se opravit chybějící GameSimulation/UI/save změnou cizího souboru. **Nikdy nemerguj a nedeployuj**.

## Prompt připravený ke zkopírování

> Jsi Agent 29 projektu Aether & Ruin, Wave F, Prompt 24 — Map, Minimap and Fog of War. Přečti celé \`docs/plan/agents/29/TASK.md\`, \`WAVE_F.md\`, \`INTEGRATION_F.md\`, \`AGENTS.md\`, originální Prompt 24 a související kód. Ze společného integrátorského BASE_SHA založ \`agent/29-prompt-24\` v izolovaném worktree. RED→GREEN TDD vytvoř čistý fog/reveal a map/minimap projection engine se stabilními buňkami, validací a per-world discovery identitou; město je známé, ale procedurální POI neprozrazuj, dokud nejsou skutečně objevena. Změň jen \`web/src/game/world/mapDiscovery.ts\` a \`web/tests/unit/Agent29MapDiscovery.test.ts\`. Neimportuj nové moduly jiných agentů, neměň Phaser/Svelte/GameSimulation/save, neimplementuj fast travel. Spusť cílené a kompletní agentní testy, vytvoř pouze draft PR s přesným diffem, výsledky a handoffem; nikdy nemerguj do main.
