<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import type { GameSnapshot } from '../game/core/types';
  import { SKILLS, SKILL_SLOTS } from '../game/skills/skills';
  import { CLASSES } from '../game/data/classes';
  import { POTION_IDS } from '../game/consumables/potionRules';
  import { WARRIOR_ABILITIES, type WarriorAbilityId } from '../game/skills/warriorKit';
  import { PALADIN_EXTRA_IDS, PALADIN_EXTRA_SKILLS, type PaladinAbilityId } from '../game/skills/paladinKit';
  import { MAGE_EXTRA_IDS, MAGE_EXTRA_SPELLS, type MageExtraSpellId } from '../game/skills/mageKit';
  import { NECRO_EXTRA_IDS, NECRO_EXTRA_SPELLS, type NecroExtraSpellId } from '../game/skills/necromancerKit';
  import { projectEquippedSkill } from '../game/skills/skillModifiers';
  import { projectTalentBonuses } from '../game/progression/talentTree';
  const extraWarriorSkills = ['groundSlam', 'warCry', 'whirlwind', 'execute', 'basicAttack'] as const;
  const warriorShortcuts: Record<typeof extraWarriorSkills[number], string> = {
    groundSlam: '2', warCry: '3', whirlwind: '4', execute: '5', basicAttack: '6'
  };

  let { bridge, view }: { bridge: GameBridge; view: GameSnapshot } = $props();
  let mageCostDiscount = $derived(projectTalentBonuses(view.talentRanks ?? {}).manaEfficiency);

  function castWarrior(id: WarriorAbilityId): void {
    bridge.command({ type: 'warriorAbility', id, targetId: view.selectedTargetId ?? view.enemy.id });
  }
  function castPaladin(id: PaladinAbilityId): void {
    bridge.command({type:'paladinAbility',id,targetId:view.selectedTargetId??view.enemy.id});
  }

  function castMage(id: MageExtraSpellId): void {
    const position = bridge.pointerPosition();
    bridge.command({ type: 'mageAbility', id,
      targetId: view.selectedTargetId ?? view.enemy.id,
      ...(position ? { position } : {}) });
  }

  function castNecro(id: NecroExtraSpellId): void {
    const position = bridge.pointerPosition();
    bridge.command({ type: 'necroAbility', id,
      targetId: view.selectedTargetId ?? view.enemy.id,
      ...(position ? { position } : {}) });
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
        <span class="skill-shortcut">{slot === 'rmb' ? 'RMB' : '1'}</span>
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
        {@const modified = projectEquippedSkill(
          id, ability.radius ?? 0, view.talentRanks ?? {}, view.equipment
        )}
        {@const remaining = view.warriorCooldowns?.[id] ?? 0}
        <button class="skill-button extra" class:cooldown={remaining > 0}
          disabled={view.paused || !view.player.alive || remaining > 0
            || view.warriorAction !== null && view.warriorAction !== undefined
            || view.resource + 0.001 < ability.rageCost}
          aria-label={$t('skills.' + id + '.name')}
          title={$t('skills.' + id + '.desc') + ' · ' + ability.rageCost + ' ' + $t('resource.rage')
            + (modified.modifierIds.length > 0
              ? ' · ' + $t('skillModifiers.radius') + ': ' + Math.round(modified.radius)
                + (modified.pullDistance > 0
                  ? ' · ' + $t('skillModifiers.pull') + ': ' + modified.pullDistance : '')
                + (modified.statuses.some(status => status.id === 'bleeding')
                  ? ' · ' + $t('skillModifiers.bleeding') : '') : '')}
          onclick={() => castWarrior(id)}
        >
          <span class="skill-shortcut">{warriorShortcuts[id]}</span>
          <span class="skill-icon" aria-hidden="true">{id === 'warCry' ? '✦' : id === 'groundSlam' ? '✹' : id === 'whirlwind' ? '⟳' : id === 'execute' ? '⚔' : '✧'}</span>
          <span class="skill-title">{$t('skills.' + id + '.name')}</span>
          {#if modified.modifierIds.length}
            <span class="skill-modified" data-testid={'modified-' + id}>
              {$t('skillModifiers.enhanced')}
            </span>
          {/if}
          <span class="skill-cost">{ability.rageCost === 0 ? '—' : ability.rageCost}</span>
          {#if remaining > 0}<span class="skill-cooldown">{Math.ceil(remaining)}s</span>{/if}
        </button>
      {/each}
    {/if}
    {#if view.classId === 'PALADIN'}
      {#each PALADIN_EXTRA_IDS as id,index (id)}
        {@const skill=PALADIN_EXTRA_SKILLS[id]}
        {@const remaining=view.paladinCooldowns?.[id]??0}
        <button
          class="skill-button extra"
          class:cooldown={remaining>0}
          data-paladin-ability={id}
          disabled={view.paused || !view.player.alive || remaining>0 ||
            !!view.classAction || view.resource + 0.001 < skill.cost}
          aria-label={$t('skills.'+id+'.name')}
          title={$t('skills.'+id+'.desc')+' · '+skill.cost+' '+$t('resource.faith')}
          onclick={() => castPaladin(id)}
        >
          <span class="skill-shortcut">{index+2}</span>
          <span class="skill-icon" aria-hidden="true">{skill.icon}</span>
          <span class="skill-title">{$t('skills.'+id+'.name')}</span>
          <span class="skill-cost">{skill.cost}</span>
          {#if remaining>0}
            <span class="skill-cooldown">{Math.ceil(remaining)}s</span>
          {/if}
        </button>
      {/each}
    {/if}
    {#if view.classId === 'MAGE'}
      {#each MAGE_EXTRA_IDS as id,index (id)}
        {@const skill = MAGE_EXTRA_SPELLS[id]}
        {@const remaining = view.mageCooldowns?.[id] ?? 0}
        {@const actualCost = Math.max(1, Math.ceil(skill.cost * (1 - mageCostDiscount)))}
        <button
          class="skill-button extra"
          class:cooldown={remaining > 0}
          data-mage-ability={id}
          disabled={view.paused || !view.player.alive || remaining > 0 ||
            !!view.classAction || view.resource + 0.001 < actualCost}
          aria-label={$t('skills.'+id+'.name')}
          title={$t('skills.'+id+'.desc')+' · '+actualCost+' '+$t('resource.mana')}
          onclick={() => castMage(id)}
        >
          <span class="skill-shortcut">{index+2}</span>
          <span class="skill-icon" aria-hidden="true">{skill.icon}</span>
          <span class="skill-title">{$t('skills.'+id+'.name')}</span>
          <span class="skill-cost">{actualCost}</span>
          {#if remaining > 0}<span class="skill-cooldown">{Math.ceil(remaining)}s</span>{/if}
        </button>
      {/each}
    {/if}
    {#if view.classId === 'NECROMANCER'}
      {#each NECRO_EXTRA_IDS as id,index (id)}
        {@const skill = NECRO_EXTRA_SPELLS[id]}
        {@const remaining = view.necroCooldowns?.[id] ?? 0}
        <button class="skill-button extra" class:cooldown={remaining>0}
          data-necro-ability={id}
          disabled={view.paused || !view.player.alive || remaining>0
            || !!view.classAction || view.resource + 0.001 < skill.cost
            || id === 'summonGolem' && (view.summons ?? []).some(a=>a.kind==='golem')}
          aria-label={$t('skills.'+id+'.name')}
          title={$t('skills.'+id+'.desc')+' · '+skill.cost+' '+$t('resource.essence')}
          onclick={() => castNecro(id)}>
          <span class="skill-shortcut">{index+2}</span>
          <span class="skill-icon" aria-hidden="true">{skill.icon}</span>
          <span class="skill-title">{$t('skills.'+id+'.name')}</span>
          <span class="skill-cost">{skill.cost}</span>
          {#if remaining>0}<span class="skill-cooldown">{Math.ceil(remaining)}s</span>{/if}
        </button>
      {/each}
    {/if}
  </div>
  {#if view.classId === 'NECROMANCER'}
    <div class="necro-minions" data-testid="necromancer-minions"
      aria-label={$t('necromancer.minions')}>
      {$t('necromancer.minions')}: {(view.summons ?? []).length}/5
      · {$t('necromancer.corpses')}: {(view.corpses ?? []).length}
    </div>
  {/if}
  <div class="potion-row" aria-label={$t('potions.bar')}>
    <button class="potion-use" data-testid="use-potion"
      disabled={!view.potions || !view.player.alive || view.paused
        || view.potions.cooldown > 0 || view.potions.charges[view.potions.selected] <= 0
        || view.potions.selected === 'healing' && view.player.health >= view.player.maxHealth
        || view.potions.selected === 'resource' && view.resource >= view.stats.maxResource}
      aria-label={$t('potions.use') + ' ' + $t('potions.' + (view.potions?.selected ?? 'healing') + '.name')}
      onclick={() => bridge.command({ type: 'usePotion' })}>
      <span class="potion-key">Q</span>
      <span>{$t('potions.' + (view.potions?.selected ?? 'healing') + '.name')}</span>
      <strong>{view.potions?.charges[view.potions?.selected ?? 'healing'] ?? 0}</strong>
      {#if (view.potions?.cooldown ?? 0) > 0}
        <span class="potion-timer">{(view.potions?.cooldown ?? 0).toFixed(1)}s</span>
      {/if}
    </button>
    {#each POTION_IDS as potionId}
      <button class="potion-select" class:chosen={view.potions?.selected === potionId}
        data-potion-id={potionId} aria-pressed={view.potions?.selected === potionId}
        disabled={!view.player.alive || view.paused}
        aria-label={$t('potions.select') + ' ' + $t('potions.' + potionId + '.name')}
        title={$t('potions.' + potionId + '.description')}
        onclick={() => bridge.command({ type: 'selectPotion', potionId })}>
        {$t('potions.' + potionId + '.short')} {view.potions?.charges[potionId] ?? 0}
      </button>
    {/each}
  </div>
  {#if (view.potions?.buffs.resistance ?? 0) > 0 || (view.potions?.buffs.fury ?? 0) > 0}
    <div class="active-effects" aria-label={$t('combat.effects')}>
      {#if (view.potions?.buffs.resistance ?? 0) > 0}
        <span class="effect-chip beneficial">{$t('potions.resistance.name')} {Math.ceil(view.potions?.buffs.resistance ?? 0)}s</span>
      {/if}
      {#if (view.potions?.buffs.fury ?? 0) > 0}
        <span class="effect-chip beneficial">{$t('potions.fury.name')} {Math.ceil(view.potions?.buffs.fury ?? 0)}s</span>
      {/if}
    </div>
  {/if}
  {#if view.statusEffects?.player?.length}
    <div class="active-effects" aria-label={$t('combat.effects')}>
      {#each view.statusEffects.player as status (status.id)}
        <span class="effect-chip beneficial">{$t('effects.' + status.id)} {Math.ceil(status.remaining)}s</span>
      {/each}
    </div>
  {/if}
  {#if view.statusEffects?.enemies?.[view.enemy.id]?.length}
    <div class="active-effects" aria-label={$t('combat.effects')}>
      {#each view.statusEffects.enemies[view.enemy.id] as status (status.id)}
        <span class="effect-chip hostile">{$t('effects.' + status.id)} {Math.ceil(status.remaining)}s</span>
      {/each}
    </div>
  {/if}
  {#if view.effects.player.length > 0 || view.effects.enemy.length > 0}
    <div class="active-effects" aria-label={$t('combat.effects')}>
      {#each view.effects.player.filter(effect => !view.statusEffects?.player.some(status => status.id === effect.id)) as effect (effect.id)}
        <span class="effect-chip beneficial">{$t('effects.' + effect.id)} {Math.ceil(effect.remaining)}s</span>
      {/each}
      {#each view.effects.enemy.filter(effect => !view.statusEffects?.enemies?.[view.enemy.id]?.some(status => status.id === effect.id)) as effect (effect.id)}
        <span class="effect-chip hostile">{$t('effects.' + effect.id)} {Math.ceil(effect.remaining)}s</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .potion-row{display:flex;gap:5px;justify-content:center;align-items:center;pointer-events:none;flex-wrap:wrap;margin-top:7px}
  .potion-row button{pointer-events:auto;background:#201e21ed;border:1px solid #77674d;color:#e8d8ba;min-height:32px;padding:5px 9px;font-size:.72rem}
  .potion-row button:disabled{opacity:.5;cursor:default}
  .potion-row .potion-select.chosen{border-color:#e3b76e;background:#39302a}
  .potion-key{color:#e7b477;border:1px solid #8b7251;padding:0 4px;margin-right:5px}
  .potion-use strong{margin-left:8px}
  .potion-timer{margin-left:8px;color:#e7a6a6}
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
  .skill-modified{position:absolute;left:4px;bottom:3px;padding:1px 3px;
    font-size:.51rem;color:#f5d08b;background:#5d3146b7;border:1px solid #b77b87}
  .skill-cooldown{position:absolute;inset:0;background:#090d14c9;display:grid;place-items:center;font-size:1.05rem;color:#f1cf9e}
  .active-effects{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:8px;pointer-events:none}
  .effect-chip{border:1px solid #475960;padding:4px 8px;background:#10151bdd;color:#a9cbbc;font-size:.66rem}
  .effect-chip.hostile{border-color:#7c4e56;color:#e4a1a0}
  @media(max-width:720px){.skill-ui{bottom:115px;min-width:min(340px,94vw)}.skill-button{width:115px;min-height:64px;padding:7px}.skill-button.extra{width:60px;min-height:64px}.skill-icon{font-size:1.35rem}.skill-title{font-size:.65rem}.active-effects{margin-top:3px}}
</style>
