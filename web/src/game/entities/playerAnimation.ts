import type { GameSnapshot } from '../core/types';

export type HeroAnimation = 'idle' | 'running' | 'attacking' | 'evading' | 'stunned' | 'dead';

/** Pure animation projection. All authoritative motion/combat remains in simulation. */
export function playerAnimation(state: GameSnapshot): HeroAnimation {
  if (!state.player.alive) return 'dead';
  if (state.effects.player.some(effect => effect.id === 'stunned')) return 'stunned';
  if (state.evadeCooldown > 2.1) return 'evading';
  if (state.status === 'moving' || state.moveDestination !== null) return 'running';
  if (state.status === 'combat') return 'attacking';
  return 'idle';
}
