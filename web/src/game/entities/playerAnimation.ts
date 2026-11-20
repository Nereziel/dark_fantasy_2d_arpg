import type { GameSnapshot } from '../core/types';

export type HeroAnimation = 'idle' | 'running' | 'attacking' | 'casting' | 'channeling' | 'evading' | 'stunned' | 'dead';

/** Pure animation projection. All authoritative motion/combat remains in simulation. */
export function playerAnimation(state: GameSnapshot): HeroAnimation {
  if (!state.player.alive) return 'dead';
  if (state.effects.player.some(effect => effect.id === 'stunned')
    || state.statusEffects?.player.some(effect =>
      effect.id === 'stunned' || effect.id === 'frozen')) return 'stunned';
  if (state.evadeCooldown > 2.1) return 'evading';
  const action = state.warriorAction?.timeline ?? state.classAction?.timeline;
  if (action && action.phase !== 'complete' && action.phase !== 'cancelled') {
    if (action.animation === 'channel') return 'channeling';
    if (action.animation === 'cast') return 'casting';
    return 'attacking';
  }
  if (state.status === 'moving' || state.moveDestination !== null) return 'running';
  if (state.status === 'combat') return 'attacking';
  return 'idle';
}
