<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import type { GameSnapshot } from '../game/core/types';
  import { SKILLS, SKILL_SLOTS } from '../game/skills/skills';
  import { CLASSES } from '../game/data/classes';
  import { WARRIOR_ABILITIES, type WarriorAbilityId } from '../game/skills/warriorKit';
  const extraWarriorSkills = ['groundSlam', 'warCry', 'whirlwind', 'execute', 'basicAttack'] as const;
  const warriorShortcuts: Record<typeof extraWarriorSkills[number], string> = {
    groundSlam: '2', warCry: '3', whirlwind: '4', execute: '5', basicAttack: '6'
  };

  let { bridge, view }: { bridge: GameBridge; view: GameSnapshot } = $props();

  function castWarrior(id: WarriorAbilityId): void {
    bridge.command({ type: 'warriorAbility', id, targetId: view.selectedTargetId ?? view.enemy.id });
  }

  function cast(slot: 'rmb' | 'slot1'): void {
    const aim = bridge.skillAim(slot);
    bridge.command({ type: 'cast', slot, ...(aim ? { aim } : {}) });
  }
</script>

<div class="skill-ui">
  <div class="skill-toolbar" aria-label={$t('combat.skills')}>
    {#each SKILL_SLOTS as slot (slot)}
      {@const skill = SKILLS[view.classId][slot]}
      {@const remaining = view.cooldowns[slot]}
      <button
        class="skill-button"
        class:cooldown={remaining > 0}
        disabled={view.paused || !view.player.alive || remaining > 0 || view.resource + 0.001 < skill.cost}
        aria-label={$t('skills.' + skill.id + '.name')}
        title={$t('skills.' + skill.id + '.desc') + ' · ' + skill.cost + ' ' + $t('resource.' + CLASSES[view.classId].resourceId)}
        onclick={() => cast(slot)}
      >
        <span class="skill-shortcut">{slot === 'rmb' ? 'Q / RMB' : '1'}</span>
        <span class="skill-icon" aria-hidden="true">{skill.icon}</span>
        <span class="skill-title">{$t('skills.' + skill.id + '.name')}</span>
        <span class="skill-cost">{skill.cost === 0 ? '—' : skill.cost}</span>
        {#if remaining > 0}
          <span class="skill-cooldown">{Math.ceil(remaining)}s</span>
        {/if}
      </button>
    {/each}
    {#if view.classId === 'WARRIOR'}
      {#each extraWarriorSkills as id (id)}
        {@const ability = WARRIOR_ABILITIES[id]}
        {@const remaining = view.warriorCooldowns?.[id] ?? 0}
        <button class="skill-button extra" class:cooldown={remaining > 0}
          disabled={view.paused || !view.player.alive || remaining > 0
            || view.warriorAction !== null && view.warriorAction !== undefined
            || view.resource + 0.001 < ability.rageCost}
          aria-label={$t('skills.' + id + '.name')}
          title={$t('skills.' + id + '.desc') + ' · ' + ability.rageCost + ' ' + $t('resource.rage')}
          onclick={() => castWarrior(id)}
        >
          <span class="skill-shortcut">{warriorShortcuts[id]}</span>
          <span class="skill-icon" aria-hidden="true">{id === 'warCry' ? '✦' : id === 'groundSlam' ? '✹' : id === 'whirlwind' ? '⟳' : id === 'execute' ? '⚔' : '✧'}</span>
          <span class="skill-title">{$t('skills.' + id + '.name')}</span>
          <span class="skill-cost">{ability.rageCost === 0 ? '—' : ability.rageCost}</span>
          {#if remaining > 0}<span class="skill-cooldown">{Math.ceil(remaining)}s</span>{/if}
        </button>
      {/each}
    {/if}
  </div>
  {#if view.statusEffects?.player?.length}
    <div class="active-effects" aria-label={$t('combat.effects')}>
      {#each view.statusEffects.player as status (status.id)}
        <span class="effect-chip beneficial">{$t('effects.' + status.id)} {Math.ceil(status.remaining)}s</span>
      {/each}
    </div>
  {/if}
  {#if view.effects.player.length > 0 || view.effects.enemy.length > 0}
    <div class="active-effects" aria-label={$t('combat.effects')}>
      {#each view.effects.player as effect (effect.id)}
        <span class="effect-chip beneficial">{$t('effects.' + effect.id)} {Math.ceil(effect.remaining)}s</span>
      {/each}
      {#each view.effects.enemy as effect (effect.id)}
        <span class="effect-chip hostile">{$t('effects.' + effect.id)} {Math.ceil(effect.remaining)}s</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .skill-ui{position:absolute;z-index:3;left:50%;bottom:144px;transform:translateX(-50%);pointer-events:none;width:min(930px,96vw)}
  .skill-toolbar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;pointer-events:none}
  .skill-button{pointer-events:auto;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:170px;min-height:83px;padding:9px 8px;border:1px solid #88704e;background:linear-gradient(#222b36eb,#10141be9);box-shadow:0 10px 25px #000c}
  .skill-button.extra{width:90px;min-height:80px}
  .skill-button.extra .skill-icon{font-size:1.3rem}
  .skill-button.extra .skill-title{font-size:.65rem}
  .skill-button:hover:not(:disabled){border-color:#e6bd81;background:#343642ed}
  .skill-button:disabled{opacity:.6;cursor:default}
  .skill-shortcut{position:absolute;left:7px;top:6px;font-size:.6rem;color:#b6a185}
  .skill-icon{font:1.8rem Georgia,serif;color:#e1bf81}
  .skill-title{font: .77rem Georgia,serif;color:#eee4d2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .skill-cost{position:absolute;right:8px;top:6px;color:#8ec9ef;font-size:.64rem}
  .skill-cooldown{position:absolute;inset:0;background:#090d14c9;display:grid;place-items:center;font-size:1.05rem;color:#f1cf9e}
  .active-effects{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:8px;pointer-events:none}
  .effect-chip{border:1px solid #475960;padding:4px 8px;background:#10151bdd;color:#a9cbbc;font-size:.66rem}
  .effect-chip.hostile{border-color:#7c4e56;color:#e4a1a0}
  @media(max-width:720px){.skill-ui{bottom:115px;min-width:min(340px,94vw)}.skill-button{width:115px;min-height:64px;padding:7px}.skill-button.extra{width:60px;min-height:64px}.skill-icon{font-size:1.35rem}.skill-title{font-size:.65rem}.active-effects{margin-top:3px}}
</style>
