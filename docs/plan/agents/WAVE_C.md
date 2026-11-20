# Vlna C — paralelní agenty pro Prompty 12–17

**Cíl:** šest nekolizních datových modulů pro progres, předměty, affixy, inventář, loot a elity. Plné runtime zapojení a UI provádí až koordinátor, nikoli agenti.

**Stav:** dokumentace připravena; žádný agent nebyl spuštěn, žádné PR od nich nevytvořeno. Start až po úspěšném dokončení PR #21 a zeleném `main`.

## Exkluzivní write-sety

| Agent | Původní prompt | Jediný zdrojový soubor | Jediný testovací soubor |
|---|---|---|---|
| [16](16/TASK.md) | 12 | `web/src/game/progression/progressionRules.ts` | `web/tests/unit/Agent16ProgressionRules.test.ts` |
| [17](17/TASK.md) | 13 | `web/src/game/items/itemCatalog.ts` | `web/tests/unit/Agent17ItemCatalog.test.ts` |
| [18](18/TASK.md) | 14 | `web/src/game/items/affixGeneration.ts` | `web/tests/unit/Agent18AffixGeneration.test.ts` |
| [19](19/TASK.md) | 15 | `web/src/game/inventory/equipmentRules.ts` | `web/tests/unit/Agent19EquipmentRules.test.ts` |
| [20](20/TASK.md) | 16 | `web/src/game/loot/lootTables.ts` | `web/tests/unit/Agent20LootTables.test.ts` |
| [21](21/TASK.md) | 17 | `web/src/game/enemies/eliteModifiers.ts` | `web/tests/unit/Agent21EliteModifiers.test.ts` |

Všechny výše uvedené cesty musí být při dispatchi nové. Každý agent smí změnit **pouze** své 2 soubory. Má-li při startu cesta existovat, koordinátor musí zadání přeplánovat; nepřepisovat soubor. Žádný společný `types.ts`, `GameSimulation.ts`, `data/items.ts`, `web/src/i18n/**`, `web/src/ui/**`, `persistence/**`, package/lockfiles, CI, AGENTS.md, dokumentace nebo testy jiných agentů.

## Start, pravidla a izolace

1. Koordinátor ověří CI posledního `main`, zapíše **jediný přesný BASE_SHA** a tento SHA předá všem agentům. Může nasadit paralelně šest nezávislých worktree/branches, **nikdy jeden sdílený worktree**.
2. Každý agent dostane plné zadání z `NN/TASK.md` a celou repo specifikaci. Vlastní branch `agent/NN-prompt-PP`.
3. Přístup RED→GREEN (Vitest), pure typed TS, seedový RNG, serializace, validace, žádná mutace vstupů, 100% reproducibility pro stejné seed.
4. Cross-agent importy jsou zakázané. Veřejné návrhy rozhraní se pouze popisují v PR; koordinátor je sjednotí až po čistém merge.
5. Originální code/asset GPL-3.0-only, žádné nové npm balíčky ani cizí art bez provenience.
6. `npm ci --no-audit --no-fund`, `npm run check`, `npm run test`, `npm run build`; povinný výpis výsledků (PASS/FAIL/NOT RUN).
7. Každý agent vytvoří **draft PR**, nikdy neprovede merge, změny podmíněné UI/save/runtime ponechá koordinátorovi.

## Dependencies (výslovné, bez porušení write-setů)

- **16** zcela nezávislý; integrace XP křivky ovlivňuje `CharacterProgress`, proto až koordinátor navrhne kompatibilní v8 save migrační politiku.
- **17** definuje model itemů v novém katalogu. **18** nezávisle generuje afixy z lokálních vstupních typů bez importu 17.
- **19** pracuje jen s existujícími `data/items.ts` typy, nikoli novým modulem 17. Obouruční kompatibilitu vysvětlí ve výstupu.
- **20** vrací pouze plánované loot odkazy a váhy, ne hotové item instance. **21** izolovaně definuje elitní efekty; teprve integrátor je propojí s lootem 20.

## Handoff / finální kontrola

Koordinátor zkontroluje diff exact paths, revue změn, běh testů, validace a kompatibilitu save; merge připravených PR v pořadí **16 → 17 → 18 → 19 → 20 → 21**. Následují samostatné integrační PR v pořadí Promptů 12–17 a teprve po jejich CI + browser potvrzení se aktualizuje status jednotlivých promptů.

Pro postup a kritéria viz [INTEGRATION_C.md](INTEGRATION_C.md). Zadání po jednom viz `16/TASK.md` až `21/TASK.md`.
