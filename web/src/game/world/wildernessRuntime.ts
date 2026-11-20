/** Authoritative seed → walkable terrain → validated Act I landmarks.
 * Identical pure world assembly is used by simulation and renderer.
 * GPL-3.0-only.
 */
import { generateWildernessTerrain, type WildernessTerrainResult } from './wildernessTerrain';
import { planWildernessFeatures, type WildernessFeature } from './wildernessFeatures';
import type { WorldLayout } from './generator';

export interface WildernessRuntimeWorld {
  layout: WorldLayout;
  terrain: WildernessTerrainResult;
  features: readonly WildernessFeature[];
  usedFeatureFallback: boolean;
}

/** A failed optional forest generation never removes critical quest destinations. */
export function buildWilderness(seed: number): WildernessRuntimeWorld {
  const initial = generateWildernessTerrain(seed);
  const plan = planWildernessFeatures(seed, initial.layout);
  if (plan.ok) {
    return { layout: initial.layout, terrain: initial, features: plan.features,
      usedFeatureFallback: false };
  }
  // Deterministic tested seed-zero clearing, with the caller's session seed.
  // Revalidate the entire feature list on the fallback collision geometry.
  const safe = generateWildernessTerrain(0);
  const layout: WorldLayout = {
    seed, camp: { ...safe.layout.camp },
    obstacles: safe.layout.obstacles.map(wall => ({ ...wall })),
    encounterPositions: safe.layout.encounterPositions.map(point => ({ ...point }))
  };
  const retry = planWildernessFeatures(seed, layout);
  if (!retry.ok) throw new Error(
    'Wilderness has no reachable story layout: ' + plan.error.code + '/' + retry.error.code
  );
  return {
    layout, terrain: { ...safe, layout }, features: retry.features, usedFeatureFallback: true
  };
}
