# INTEGRATION_F — Hlavní integrátor, Wave F (Prompty 23–25)

**Status: připravený integrační runbook; není implementací ani spuštěním agentů.**
Repo: `Nereziel/dark_fantasy_2d_arpg`. Zadání/samostatné write-sety: [WAVE_F.md](WAVE_F.md), [28/TASK.md](28/TASK.md), [29/TASK.md](29/TASK.md), [30/TASK.md](30/TASK.md). Původní specifikace: `2d_arpg_implementation_prompts.md` Prompty 23, 24, 25.

## 0 — Dispatch gate / společný BASE_SHA

- [ ] Na `main` jsou všechny soubory Wave F a status záznam; poslední plánovací PR je merged, `git status --porcelain` je prázdný, `git rev-parse HEAD` je jednoznačný. Ověřit HEAD CI, poslední Pages deployment a aktuální stav otevřených PR.
- [ ] Zkontrolovat, že žádný ze **šesti** produkčních/testovacích souborů agentů 28/29/30 na dispatch-time main neexistuje; že `WORLD_WIDTH/HEIGHT`, `buildWilderness`, `WildernessTerrainResult`, `WildernessFeature`, `generateCrypt`, `CRYPT_EXIT`, `CRYPT_BOSS_POSITIONS` jsou kompatibilní.
- [ ] **BASE_SHA = aktuální `git rev-parse main`, 40 znaků, znovu načíst až po plánovacím merge.** Identické SHA poslat všem třem agentům. Žádné slepé použití historického `7bb783...`.
- [ ] Agentní větve: `agent/28-prompt-23`, `agent/29-prompt-24`, `agent/30-prompt-25`; každá ve vlastním `git worktree`, s bootstrap podle [WORKFLOW_CACHE.md](WORKFLOW_CACHE.md). Ne více než tři současně. **Neměnit společné soubory žádným agentem.**
- [ ] Wave E: autor manuálně prošel Akt I, nicméně plný automatický *no-debug* E2E a interaktivní volitelné treasure/event POI nejsou uzavřené. Integrátor tyto body nepovažuje za potvrzené jen proto, že Wave F začíná. Ošetřit samostatnými nezávislými integračními PR, pokud ovlivní přejímku F.

## 1 — Agentní review a pořadí merge

1. **28 → Prompt 23:** prokazatelně deterministický chunk index nad existujícím read-only světem, stable IDs/content seeds, správné hrany, geometrické překryvy multi-chunk, bounded load/unload delta a hysterese, serializovatelné immutable fact záznamy a jejich idempotence. V čistých funkcích žádný skutečný Phaser/IndexedDB/character save.
2. **29 → Prompt 24:** fog/reveal state neprozrazuje náhodné POI, objevené oblasti opravdu vycházejí z autoritativní hráčovy polohy, town od začátku známé, map/minimap projekce a validace chyb, žádný import nového chunk modulu. Nenahrazuje vlastní Svelte UI.
3. **30 → Prompt 25:** seedované room graph/topologie + skutečně spojená průchozí geometrie, potřebné místnosti a důsledná validace; boss/exit dosažitelný, seeded variace, bounded retry + explicitní safe fallback. Stávající `generateCrypt` se **nesmí** měnit v agentním PR.

Před merge každého PR:
- [ ] Porovnat `git diff --name-only BASE_SHA...HEAD` nebo GitHub compare: **přesně dva soubory ze zadání**, žádné vedlejší změny, žádné importy nových modulů jiných agentů.
- [ ] TDD RED→GREEN doložené v popisu, `bash scripts/verify.sh targeted ...`, `bash scripts/verify.sh agent`, GitHub Actions `verify` GREEN pro **přesné PR HEAD** (nikoliv starý commit).
- [ ] Code review: overflow/DoS/nekonečné smyčky, null/NaN/Infinity, neplatné seed/bounds, object aliasing, nekontrolovatelné API, jakákoliv autorita v Svelte/Phaser.
- [ ] Zkontrolovat change conflicts a merge sequential **28 → 29 → 30** jen hlavním integrátorem. Agentní merge je dokončení knihovny, ne Promptu.

## 2 — Integrační gate Prompt 23: skutečný streaming

**Jedno malé runtime PR, případně oddělené simulace/renderer PR, po merge 28.** Odpovědnost integrátora: `GameSimulation.ts`, `FrontierScene.ts`, world-runtime adaptéry, `core/types.ts`, debug testy a případná vyhrazená perzistence.

- [ ] Jediný autor layoutu zůstává `buildWilderness(seed)`; Agent28 chunk index je jeho read-only partition/projekce. Celosvětový **lehký** collision/pathfinding index může zůstat dostupný, ale nevytvářej Phaser grafiku, aktivní AI, fyzické entities/loot a props ve všech chunkech najednou.
- [ ] Při pohybu přes hranici připrav nearby chunk set, async/rozpočtované load ve framích, unload vzdálených resource (Graphics/textures/objects/listeners) a hysterese; vykreslená okrajová geometrie nesmí blikat. Přechod `wilderness↔crypt`, reset, death, menu, reload vyčistí streamované zdroje i pending joby.
- [ ] Instance unikátních enemy, chest, event/POI navázat na stable feature IDs; po unload/reload v **témže světovém sezení** se žádná již otevřená truhla/reward či unique mini-boss neresetuje. Spawnové AI/inventory/gold/eventy zůstávají pouze pod autoritou simulace. Nepřiznávej gold/XP při mountu chunku.
- [ ] Performance test na skutečném renderu: sledovat počet načtených chunků a aktivních resource proti celkovému světu, maximální rozpočet práce na frame a memory cleanup. Prokázat změnu množství načítaných chunků, ne jen deklarovanou strukturu manifestu.
- [ ] **Řešení konfliktní perzistenční hranice explicitně před implementací:** dnes `CharacterProgress v11` obsahuje permanentní progres, ale v každém načtení postavy vzniká nové, seedované sezení a world seed se neukládá. Rozliš:
  1. *Session world facts*: truhla/unikátní nepřítel/náhodná událost v právě běžícím seedu — přežije unload/reload chunku, nikoli automaticky nový seed.
  2. *Permanentní charakterový postup*: quest/fog/landmarky a aktivace, pokud jsou přenositelná a mají stabilní ID — ukládat jen validovaný seznam faktů, nikdy enemy/loot/mapu jako snapshot; pro fog rozhodni, zda map discovery patří ke konkrétnímu world instance nebo je trvalé.
  3. Pokud plná acceptance vyžaduje **návrat do konkrétního světa i po restartu aplikace**, navrhni explicitní *oddělený, versionovaný world-instance store* a volbu resume world s invariantním world ID/seed; nesmí to potichu změnit existující character-only load. Dokud není tato volba schválena a otestována, netvrď persistent chest across sessions pro fresh-seed world.
- [ ] Testy hranic, stejných seedů, přechodu zóny, ztraceného eventu, reward double-claim, fallback layout a paměťové stability; `bash scripts/verify.sh full`, CI GREEN.

## 3 — Integrační gate Prompt 24: minimapa a fog

**Vlastní runtime/UI PR po merge 29 a stabilizaci chunk kontraktu 23.**

- [ ] `GameSimulation` vlastní jediné `MapDiscoveryState` a ověřuje posun hráče; Svelte/Phaser pouze dostávají read-only snapshot a volají existující/nové bezpečné akce. Při path-follow / teleportu reveal jen po skutečné navštívené trase (nikoliv přes přeskočené neznámé oblasti).
- [ ] V Svelte samostatná **minimapa** + otevřitelná **world map**, klávesnice/ESC, zoom, legendy, zobrazovat towns, objevené dungeony a landmarky, quest marker, aktivované waypointy bez implementace travel. Přizpůsobit viewport/mobilu, žádné UI overlay pointer bleed.
- [ ] Fog nad skutečnými seed tiles + current player position. Při startu vidět pouze známý camp a bezprostředně již navštívené místo; **nepředvídat náhodné POI podle manifestu**, neukazovat jejich obsah mimo fog. Quest text může nápovědou vést, nesmí odkrýt celé místo. Při reload state odpovídá navržené lifetime politice (world-specific neaplikovat na jiné seed).
- [ ] Save má verzi **v11** a zůstává character-only. Pokud přidáš trvalý mapový pokrok do `CharacterProgress`, jedině integrátor provede **v12 či další explicitní bump**, migrace v8/v9/v10/v11, whitelist, validaci, bound na velikost, anti-forgery a lossless gold/XP/item/stash/quest tests. Nevolit levný `localStorage` world-state workaround.
- [ ] CS/EN celý UI, live switch, Playwright: camp known, unknown hidden, move reveals, marker appears only after discovery, reload verifies persistence, known waypoint cannot travel. Full CI + Pages.

## 4 — Integrační gate Prompt 25: dungeon generator

**Po merge 30 a stabilitě Promptu 23/24 jako oddělené runtime PR.**

- [ ] Jediný náhradní dungeon layout autor se stane `generateProceduralDungeon(seed)` a **adaptér** na stávající `GameSimulation`/Phaser `WorldLayout`. Zachovat `CRYPT_GATE` v divočině, `CRYPT_EXIT`, první/třetí encounter pack a mechaniku bossa `crypt_lord`; žádný save dungeon runtime.
- [ ] Ve `FrontierScene` vykreslit room tiles, dveře, stěny, chodby a odlišné typy místností podle stejné kolizní geometrie, kterou používá `canOccupy/findPath`. Nemožnost vstoupit do boss místnosti nesmí zamknout Act I. Secret room neblokuje mandatory cestu.
- [ ] Každý dungeon seed projde grafovou i **skutečnou grid/pathfinding** validací: vstup, combat/elite/mandatory objective, boss, exit. Spawn/AI/dodge/cast musí respektovat stěny a nové dveře. Bounded retry a známý fallback; nesmí vzniknout softlock nebo se hráč spawnout v překážce.
- [ ] Příběh Aktu I: `crypt_descent` a `crypt_lord_fallen` zůstanou autoritativní a exactly once, bez ztráty `vesnas_report`. Dungeon při novém sezení nový, **nikdy nezapsat enemy/wave/room snapshot do character save**. Plně hratelný souboj s existujícím bossem před budoucím Promptem 28 (Hollow King phases).
- [ ] Stejný seed = stejné room/door/tiles, různé seed = skutečné varianty, seed matrix [0,1,2,42,0xffffffff], nevalidní input/fallback tests, unload/reload chunku i přechody wilderness↔crypt, Playwright průchod dungeonem a návrat do města, CS/EN a Pages.

## 5 — Release gates, stop signály, pokračování

- [ ] Každý runtime integrační PR musí uvést přesný diff, testy a CI SHA; `bash scripts/verify.sh full` v izolovaném integrátorském worktree. CI `verify` musí být GREEN, až poté merge.
- [ ] Po finálním merge zkontrolovat **`main` verify pro aktuální SHA a Pages deploy pro stejný SHA**. K publikaci game-source změny použij již existující cache/reuse workflow, ne duplikované buildy. V případě docs-only změny se Pages správně nepřepublikuje.
- [ ] Zaznamenat konkrétní PR/SHA, testy a naměřenou render/resource úsporu do `docs/IMPLEMENTATION_STATUS.md`; status `agent module done` nepovyšovat na `prompt complete` bez runtime acceptance.
- [ ] Zachovat CS/EN, GPL-3.0-only, original pixel art a existující char save migrace, pravidla boss odměn, quest ledger a význam `ashes_at_gate`.
- [ ] **STOP** při duplicitech loot/gold/XP, migraci která ztratí stash/quests, revealed undiscovered POI, povolení fast travel před Promptem 36, dungeon softlock, nedosažitelné NPC/portal, chybějícím resource cleanup, nereprodukovatelném seedu, neúplné v11 migraci, fail testů nebo skrytém sdíleném agentním diffu. Neignorovat CI / nevypínat selhávající testy.
- [ ] Další samostatná Wave G: Prompt 26 dungeon theme, Prompt 27 mini-boss framework, Prompt 28 three-phase Act I boss. Nedělat ji současně s izolovanou Wave F bez jasné integrační hranice.

### Předávací protokol

Agenti v draft PR předávají název/exportované signatury funkcí, invariants a předpoklady integrátora, seed/geometry test matrix, přesný seznam souborů, RED→GREEN, cílené a plné agentní testy, CI odkaz a chybějící propojení. Integrátor u každého gate vyplní PR URL, merged SHA, `main` verify SHA, Pages deploy SHA a zbývající acceptance; dokumentační změny plán nesmějí samy spouštět runtime merge.
