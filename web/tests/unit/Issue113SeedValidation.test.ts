// Prompt 58 / Issue #113 — fast seed QA with opt-in thousands-of-seeds sweep.
// GPL-3.0-only. No renderer, network, persistent state or simulator fixtures.
import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { buildCryptWorld } from '../../src/game/world/dungeonRuntime';
import { ACT_I_DUNGEON_IDS, buildActIDungeonInterior, planActIDungeonEntrances } from '../../src/game/world/actIDungeonEntrances';
import { ACT_I_DUNGEON_ENTRANCE_SPACING } from '../../src/game/world/wildernessFeatures';
import { validateWildernessTerrain, generateWildernessTerrain } from '../../src/game/world/wildernessTerrain';
import { generateProceduralDungeon, validateProceduralDungeon } from '../../src/game/world/proceduralDungeon';
import { MANDATORY_FEATURE_IDS } from '../../src/game/world/wildernessFeatures';
import { CAMP, CRYPT_GATE } from '../../src/game/world/generator';
import { getTownManifest } from '../../src/game/world/townManifest';
import { ENVIRONMENT_IDS, SHRINE_BONUSES, planEnvironmentObjects } from '../../src/game/world/environmentInteractions';
import { planWorldEvents } from '../../src/game/world/worldEvents';
import { WAYPOINT_IDS, waypointDefinition, planWaypointTravel } from '../../src/game/world/waypointTravel';
import { planOptionalDungeonFeatures } from '../../src/game/world/optionalDungeonFeatures';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';

/**
 * Run many extra deterministic seeds locally:
 * SEED_SWEEP_START=100 SEED_SWEEP_COUNT=1000 npm test -- tests/unit/Issue113SeedValidation.test.ts
 * Output always includes the failing seed and a one-command replay.
 */
function checkedEnv(name: string, fallback: number, min: number, max: number): number {
  const input = process.env[name];
  if (input === undefined) return fallback;
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be integer [${min}, ${max}], got ${input}`);
  }
  return value;
}
const START = checkedEnv('SEED_SWEEP_START', 0, 0, 0xffffffff);
const COUNT = checkedEnv('SEED_SWEEP_COUNT', 24, 1, 5000);
const REQUIRE_VILLAGES = checkedEnv('SEED_SWEEP_REQUIRE_VILLAGES', 1, 0, 1) === 1;
const seeds = Array.from({ length: COUNT }, (_, i) => (START + Math.imul(i, 7919)) >>> 0);
// Regression: natural Act I evidence-search stall in main CI 45572861430.
const sample = [0, 1, 2, 3, 42, 99, 2683541248, 0x7fffffff, 0xffffffff];
const suiteSeeds = [...new Set([...sample, ...seeds])];

type SweepRegion = 'wilderness' | 'crypt' | 'mine' | 'cave';
function checkedSeed(seed: number, region: SweepRegion, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Procedural validation failed: seed=${seed} region=${region}\n` +
      `Replay: SEED_SWEEP_START=${seed} SEED_SWEEP_COUNT=1 npm test -- tests/unit/Issue113SeedValidation.test.ts\n` +
      reason
    );
  }
}
function criticalPath(
  seed: number, region: SweepRegion, id: string,
  start: { x: number; y: number }, point: { x: number; y: number },
  obstacles: readonly { id: string; x: number; y: number; width: number; height: number }[]
): void {
  if (!canOccupy(point, ACTOR_RADIUS, obstacles)) {
    throw new Error(`seed=${seed} region=${region} critical=${id} blocked at ${JSON.stringify(point)}`);
  }
  if (!findPath(start, point, ACTOR_RADIUS, obstacles).length) {
    throw new Error(`seed=${seed} region=${region} critical=${id} unreachable at ${JSON.stringify(point)}`);
  }
}

describe('Issue #113 — renderer-free Act I procedural seed sweep', () => {
  it(`validates wilderness roads, town services, quests and encounters for ${suiteSeeds.length} seeds`, () => {
    const missing: {seed:number; stage:'topology'|'population'; villages:string[]}[]=[];
    const failures:{seed:number;reason:string}[]=[];
    for (const seed of suiteSeeds) {
      try { checkedSeed(seed, 'wilderness', () => {
      const world = buildWilderness(seed);
      const { layout, terrain, features } = world;
      expect(terrain.validation.valid).toBe(true);
      expect(validateWildernessTerrain(terrain)).toEqual([]);
      expect(layout.seed).toBe(seed);
      expect(layout.camp).toEqual(CAMP);
      expect(new Set(layout.obstacles.map(o => o.id)).size).toBe(layout.obstacles.length);
      expect(new Set(features.map(f => f.id)).size).toBe(features.length);
      const mandatory = features.filter(f => f.mandatory);
      expect(mandatory.map(f => f.id).sort()).toEqual([...MANDATORY_FEATURE_IDS].sort());
      for (const npc of getTownManifest()) {
        criticalPath(seed, 'wilderness', npc.id, layout.camp,
          npc.position, layout.obstacles);
      }
      criticalPath(seed, 'wilderness', 'crypt-gate', layout.camp, CRYPT_GATE, layout.obstacles);
      for (const feature of mandatory) {
        criticalPath(seed, 'wilderness', feature.id, layout.camp,
          feature.position, layout.obstacles);
      }
      for (const [index, point] of layout.encounterPositions.entries()) {
        criticalPath(seed, 'wilderness', 'encounter-' + index, layout.camp,
          point, layout.obstacles);
      }
      // Validate published gameplay manifests, not just their underlying POIs.
      const environment=planEnvironmentObjects(seed,layout,features);
      expect(environment.map(o=>o.id),'Incomplete environment catalog').toEqual([...ENVIRONMENT_IDS]);
      expect(environment.filter(o=>o.kind==='shrine').map(o=>o.shrineBonus))
        .toEqual([...SHRINE_BONUSES]);
      for(const object of environment){
        criticalPath(seed,'wilderness',object.id,layout.camp,object.position,layout.obstacles);
        if(object.requiresId)expect(environment.some(o=>o.id===object.requiresId)).toBe(true);
      }
      const events=planWorldEvents(seed,layout,features);
      expect(events.map(e=>e.id),'Incomplete playable event catalog').toEqual(['wild.event.1','wild.event.2']);
      for(const event of events){
        criticalPath(seed,'wilderness',event.id,layout.camp,event.position,layout.obstacles);
        expect(event.enemySpawns).toHaveLength(2);
        expect(new Set(event.enemySpawns.map(e=>e.id)).size).toBe(2);
        for(const spawn of event.enemySpawns){
          criticalPath(seed,'wilderness',spawn.id,layout.camp,spawn.position,layout.obstacles);
          criticalPath(seed,'wilderness',spawn.id+'-local',event.position,spawn.position,layout.obstacles);
        }
      }
      for(const from of WAYPOINT_IDS){
        const source=waypointDefinition(from)!;
        const to=WAYPOINT_IDS.find(id=>id!==from)!;
        const target=waypointDefinition(to)!;
        criticalPath(seed,'wilderness',from,layout.camp,source.position,layout.obstacles);
        expect(planWaypointTravel({world:layout,zone:'wilderness',
          player:{...source.position,alive:true},activated:WAYPOINT_IDS},to))
          .toEqual({from,to,position:target.position});
      }
      // Full Act I must publish all three portals, not just the story crypt.
      const portals=planActIDungeonEntrances(world);
      expect(portals.map(p=>p.id), 'Missing Act I dungeon entrance').toEqual([...ACT_I_DUNGEON_IDS]);
      expect(new Set(portals.map(p=>p.interiorSeed)).size).toBe(3);
      expect(new Set(portals.map(p=>p.sourceId)).size).toBe(3);
      const reserved=[CRYPT_GATE,...['wild.poi.2','wild.poi.3'].map(id=>{
        const feature=features.find(f=>f.id===id&&f.kind==='poi');
        if(!feature)throw new Error('Missing reserved dungeon POI '+id);
        return feature.position;
      })];
      for(let i=0;i<reserved.length;i++){
        for(let j=0;j<i;j++)expect(Math.hypot(reserved[i]!.x-reserved[j]!.x,
          reserved[i]!.y-reserved[j]!.y)).toBeGreaterThanOrEqual(ACT_I_DUNGEON_ENTRANCE_SPACING);
      }
      for(const [i,entry] of portals.entries()){
        expect(entry.returnPosition).toEqual(entry.position);
        criticalPath(seed,'wilderness','portal-'+entry.id,layout.camp,entry.position,layout.obstacles);
        for(let j=0;j<i;j++)expect(Math.hypot(entry.position.x-portals[j]!.position.x,
          entry.position.y-portals[j]!.position.y)).toBeGreaterThanOrEqual(ACT_I_DUNGEON_ENTRANCE_SPACING);
        if(entry.id==='crypt')continue;
        const id=entry.id;
        checkedSeed(seed,id,()=>{
          const interior=buildActIDungeonInterior(seed,id);
          expect(interior.seed).toBe(entry.interiorSeed);
          expect(validateProceduralDungeon(interior).valid).toBe(true);
          const spawn=interior.playerSpawn, walls=interior.obstacles;
          criticalPath(seed,id,'exit',spawn,interior.exitPosition,walls);
          criticalPath(seed,id,'boss',spawn,interior.bossSpawn,walls);
          const content=planOptionalDungeonFeatures(interior,id);
          expect(content.chest.oneShot).toBe(true);
          expect(content.trap.oneShot).toBe(true);
          expect(content.gold).toBeGreaterThan(0);
          expect(content.trap.telegraphSeconds).toBeGreaterThan(0);
          criticalPath(seed,id,content.chest.id,spawn,content.chest.position,walls);
          criticalPath(seed,id,content.trap.id,spawn,content.trap.trigger.center,walls);
          for(const [guard,position] of interior.bossGuardSpawns.entries())
            criticalPath(seed,id,'guard-'+guard,spawn,position,walls);
          for(const encounter of interior.encounterSpawns)
            criticalPath(seed,id,encounter.id,spawn,encounter.position,walls);
          for(const room of interior.rooms)
            if(room.required&&room.feature)
              criticalPath(seed,id,room.feature.id,spawn,room.feature.position,walls);
        });
      }
      const villages=world.villages??[];
      const villageIds=villages.map(v=>v.id);
      expect(new Set(villageIds).size).toBe(villageIds.length);
      if(villages.length!==2)missing.push({seed,stage:world.region?'population':'topology',villages:villageIds});
      for(const village of villages){
        expect(village.structures.length).toBeGreaterThan(0);
        expect(village.residents.map(n=>n.role)).toEqual(village.id==='north-village'
          ?['healer','civilian']:['blacksmith','quest']);
        if(village.id==='east-village')expect(village.structures.some(s=>s.kind==='smithy')).toBe(true);
        for(const resident of village.residents)
          criticalPath(seed,'wilderness',resident.id,layout.camp,resident.position,layout.obstacles);
        for(const structure of village.structures)
          criticalPath(seed,'wilderness',structure.id,layout.camp,structure.approach,layout.obstacles);
      }
      const side = terrain.roads.find(road => road.id === 'road-forest-side');
      const trail = terrain.roads.find(road => road.id === 'road-story-corruption_site');
      expect(side, 'Missing forest side trail').toBeDefined();
      expect(trail?.points).toContainEqual(side?.from);
      expect(trail?.points).toContainEqual(side?.to);
      for (const road of terrain.roads) {
        expect(road.points.length).toBeGreaterThan(0);
        expect(road.points[0]).toEqual(road.from);
        expect(road.points.at(-1)).toEqual(road.to);
        for (const point of road.points)
          expect(canOccupy(point, ACTOR_RADIUS, layout.obstacles)).toBe(true);
      }
      // Pure generation with the same inputs must preserve every item ID and position.
      expect(buildWilderness(seed)).toEqual(world);
      }); } catch(error) {
        failures.push({seed,reason:error instanceof Error?error.message:String(error)});
      }
    }
    const failedSeeds=new Set([...missing.map(m=>m.seed),...failures.map(f=>f.seed)]);
    console.info('[Act I village coverage] '+JSON.stringify({
      total:suiteSeeds.length,complete:suiteSeeds.length-failedSeeds.size,missing,failures
    }));
    if(failures.length)throw new Error('Act I wilderness invariant failures: '+JSON.stringify(failures));
    // Full population is now required by default. Only explicit diagnostic
    // sweeps may opt out to inspect additional incomplete seeds.
    if(REQUIRE_VILLAGES&&missing.length)
      throw new Error('Incomplete Act I villages: '+JSON.stringify(missing)
        +'\nReplay: SEED_SWEEP_REQUIRE_VILLAGES=1 SEED_SWEEP_START='+missing[0]!.seed
        +' SEED_SWEEP_COUNT=1 npm test -- tests/unit/Issue113SeedValidation.test.ts');
  }, Math.max(15000, suiteSeeds.length * 1000));

  it(`validates crypt entrance, reachable encounters, boss guards and exit for ${suiteSeeds.length} seeds`, () => {
    for (const seed of suiteSeeds) checkedSeed(seed, 'crypt', () => {
      const world = buildCryptWorld(seed);
      const { layout, dungeon } = world;
      expect(validateProceduralDungeon(dungeon).valid).toBe(true);
      expect(dungeon.validation.valid).toBe(true);
      expect(layout.seed).toBe(seed);
      expect(dungeon.seed).toBe(seed);
      criticalPath(seed, 'crypt', 'entrance', layout.camp,
        dungeon.playerSpawn, layout.obstacles);
      criticalPath(seed, 'crypt', 'exit', layout.camp,
        dungeon.exitPosition, layout.obstacles);
      criticalPath(seed, 'crypt', 'boss', layout.camp,
        dungeon.bossSpawn, layout.obstacles);
      for (const [i, position] of dungeon.bossGuardSpawns.entries())
        criticalPath(seed, 'crypt', 'guard-' + i, layout.camp, position, layout.obstacles);
      for (const encounter of dungeon.encounterSpawns)
        criticalPath(seed, 'crypt', encounter.id, layout.camp,
          encounter.position, layout.obstacles);
      for (const room of dungeon.rooms) {
        if (!room.required || !room.feature) continue;
        criticalPath(seed, 'crypt', room.feature.id,
          layout.camp, room.feature.position, layout.obstacles);
      }
      expect(buildCryptWorld(seed)).toEqual(world);
    });
  }, Math.max(15000, suiteSeeds.length * 1000));

  it('rejects invalid generation inputs without unsafe partial layouts', () => {
    for (const seed of [-1, NaN, Infinity, -Infinity, 0.25, 0x100000000]) {
      expect(() => generateWildernessTerrain(seed)).toThrow(RangeError);
      expect(() => generateProceduralDungeon(seed)).toThrow(RangeError);
    }
    expect(() => generateProceduralDungeon(42, { maxAttempts: -1 })).toThrow(RangeError);
    expect(() => generateProceduralDungeon(42, { maxAttempts: 100000 })).toThrow(RangeError);
    const fallback = generateProceduralDungeon(0, { maxAttempts: 0 });
    expect(fallback.source).toBe('fallback');
    expect(validateProceduralDungeon(fallback).valid).toBe(true);
  });
});
