<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import type { GameSnapshot } from '../game/core/types';
  import type { InputBinding } from '../game/input/bindings';
  import { dispatchHotbarAbility } from '../game/input/combatActionDispatcher';
  import { hotbarInputForAbility } from '../game/input/hotbarRegistry';
  import { shortcutHint } from '../game/ui/shortcutHints';
  import { SKILLS, SKILL_SLOTS } from '../game/skills/skills';
  import { CLASSES } from '../game/data/classes';
  import { POTION_IDS } from '../game/consumables/potionRules';
  import { WARRIOR_ABILITIES } from '../game/skills/warriorKit';
  import { PALADIN_EXTRA_IDS, PALADIN_EXTRA_SKILLS } from '../game/skills/paladinKit';
  import { MAGE_EXTRA_IDS, MAGE_EXTRA_SPELLS } from '../game/skills/mageKit';
  import { NECRO_EXTRA_IDS, NECRO_EXTRA_SPELLS } from '../game/skills/necromancerKit';
  import { ROGUE_EXTRA_IDS, ROGUE_EXTRA_SKILLS } from '../game/skills/rogueKit';
  import { WARLOCK_EXTRA_IDS, WARLOCK_EXTRA_SPELLS } from '../game/skills/warlockKit';
  import { projectEquippedSkill } from '../game/skills/skillModifiers';
  import { projectTalentBonuses } from '../game/progression/talentTree';
  const extraWarriorSkills = ['groundSlam', 'warCry', 'whirlwind', 'execute', 'basicAttack'] as const;
  let { bridge, view, bindings }: {
    bridge: GameBridge; view: GameSnapshot; bindings: readonly InputBinding[];
  } = $props();
  let mageCostDiscount = $derived(projectTalentBonuses(view.talentRanks ?? {}).manaEfficiency);

  function activate(id: string): void {
    dispatchHotbarAbility(bridge, id);
  }

  function abilityShortcut(id: string): string {
    const action = hotbarInputForAbility(view.classId, id);
    return action ? shortcutHint(bindings, action) : '—';
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
        onclick={() => activate(skill.id)}
      >
        <span class="skill-shortcut">{abilityShortcut(skill.id)}</span>
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
          onclick={() => activate(id)}
        >
          <span class="skill-shortcut">{abilityShortcut(id)}</span>
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
      {#each PALADIN_EXTRA_IDS as id (id)}
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
          onclick={() => activate(id)}
        >
          <span class="skill-shortcut">{abilityShortcut(id)}</span>
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
      {#each MAGE_EXTRA_IDS as id (id)}
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
          onclick={() => activate(id)}
        >
          <span class="skill-shortcut">{abilityShortcut(id)}</span>
          <span class="skill-icon" aria-hidden="true">{skill.icon}</span>
          <span class="skill-title">{$t('skills.'+id+'.name')}</span>
          <span class="skill-cost">{actualCost}</span>
          {#if remaining > 0}<span class="skill-cooldown">{Math.ceil(remaining)}s</span>{/if}
        </button>
      {/each}
    {/if}
    {#if view.classId === 'ROGUE'}
      {#each ROGUE_EXTRA_IDS as id (id)}
        {@const skill=ROGUE_EXTRA_SKILLS[id]}
        {@const remaining=view.rogueCooldowns?.[id]??0}
        <button class="skill-button extra" class:cooldown={remaining>0}
          data-rogue-ability={id}
          disabled={view.paused || !view.player.alive || remaining>0
            || !!view.classAction || view.resource+0.001<skill.cost
            || id==='trap' && (view.rogueTraps?.length??0)>=3}
          aria-label={$t('skills.'+id+'.name')}
          title={$t('skills.'+id+'.desc')+' · '+skill.cost+' '+$t('resource.energy')}
          onclick={()=>activate(id)}>
          <span class="skill-shortcut">{abilityShortcut(id)}</span>
          <span class="skill-icon" aria-hidden="true">{skill.icon}</span>
          <span class="skill-title">{$t('skills.'+id+'.name')}</span>
          <span class="skill-cost">{skill.cost}</span>
          {#if remaining>0}<span class="skill-cooldown">{Math.ceil(remaining)}s</span>{/if}
        </button>
      {/each}
    {/if}
    {#if view.classId === 'NECROMANCER'}
      {#each NECRO_EXTRA_IDS as id (id)}
        {@const skill = NECRO_EXTRA_SPELLS[id]}
        {@const remaining = view.necroCooldowns?.[id] ?? 0}
        <button class="skill-button extra" class:cooldown={remaining>0}
          data-necro-ability={id}
          disabled={view.paused || !view.player.alive || remaining>0
            || !!view.classAction || view.resource + 0.001 < skill.cost
            || id === 'summonGolem' && (view.summons ?? []).some(a=>a.kind==='golem')}
          aria-label={$t('skills.'+id+'.name')}
          title={$t('skills.'+id+'.desc')+' · '+skill.cost+' '+$t('resource.essence')}
          onclick={() => activate(id)}>
          <span class="skill-shortcut">{abilityShortcut(id)}</span>
          <span class="skill-icon" aria-hidden="true">{skill.icon}</span>
          <span class="skill-title">{$t('skills.'+id+'.name')}</span>
          <span class="skill-cost">{skill.cost}</span>
          {#if remaining>0}<span class="skill-cooldown">{Math.ceil(remaining)}s</span>{/if}
        </button>
      {/each}
    {/if}
    {#if view.classId === 'WARLOCK'}
      {#each WARLOCK_EXTRA_IDS as id (id)}
        {@const skill = WARLOCK_EXTRA_SPELLS[id]}
        {@const remaining = view.warlockCooldowns?.[id] ?? 0}
        <button class="skill-button extra" class:cooldown={remaining>0}
          data-warlock-ability={id}
          disabled={view.paused || !view.player.alive || remaining>0
            || !!view.classAction || view.resource + 0.001 < skill.cost
            || id==='demonSummoning' && (view.summons??[]).length>=3}
          aria-label={$t('skills.'+id+'.name')}
          title={$t('skills.'+id+'.desc')+' · '+skill.cost+' '+$t('resource.soul')}
          onclick={() => activate(id)}>
          <span class="skill-shortcut">{abilityShortcut(id)}</span>
          <span class="skill-icon" aria-hidden="true">{skill.icon}</span>
          <span class="skill-title">{$t('skills.'+id+'.name')}</span>
          <span class="skill-cost">{skill.cost}</span>
          {#if remaining>0}<span class="skill-cooldown">{Math.ceil(remaining)}s</span>{/if}
        </button>
      {/each}
    {/if}
  </div>
  {#if view.classId === 'WARLOCK'}
    <div class="necro-minions" data-testid="warlock-demons"
      aria-label={$t('warlock.demons')}>
      {$t('warlock.demons')}: {(view.summons??[]).filter(s=>s.kind==='demon').length}/3
    </div>
  {/if}
  {#if view.classId === 'NECROMANCER'}
    <div class="necro-minions" data-testid="necromancer-minions"
      aria-label={$t('necromancer.minions')}>
      {$t('necromancer.minions')}: {(view.summons ?? []).length}/5
      · {$t('necromancer.corpses')}: {(view.corpses ?? []).length}
    </div>
  {/if}
  {#if view.classId==='ROGUE'}
    <div data-testid="rogue-status" class="rogue-status">
      {$t('rogue.traps')}: {(view.rogueTraps??[]).length}/3
      · {$t('rogue.stealth')}: {(view.rogueStealthSeconds??0).toFixed(1)}s
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
      <span class="potion-key">{shortcutHint(bindings, 'POTION')}</span>
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
  /* Skills belong to the single bottom combat dock; never float over vitals. */
  .skill-ui { position:relative; z-index:1; display:flex; flex-direction:column;
    align-items:stretch; justify-content:center; width:100%; min-width:0; gap:3px;
    pointer-events:auto; }
  .skill-toolbar { display:flex; justify-content:center; align-items:stretch;
    gap:clamp(2px, .45vw, 6px); width:100%; min-width:0; flex-wrap:nowrap; }
  .skill-button, .skill-button.extra {
    position:relative; flex:1 1 0; width:0; min-width:0; max-width:86px;
    height:70px; min-height:0; padding:15px 3px 5px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:2px; border:1px solid #88704e; border-radius:3px;
    background:linear-gradient(#283340f5,#131921f5);
    box-shadow:inset 0 1px #b8a47d24,0 2px 9px #0008;
    pointer-events:auto; overflow:hidden;
  }
  .skill-button:hover:not(:disabled) { border-color:#e6bd81; background:#343d48; }
  .skill-button:disabled { opacity:.54; cursor:default; }
  .skill-shortcut { position:absolute; left:4px; top:3px; font:600 .59rem Inter,sans-serif; color:#e6c793; }
  .skill-icon,.skill-button.extra .skill-icon { font:1.55rem Georgia,serif; line-height:1; color:#e1bf81; }
  .skill-title,.skill-button.extra .skill-title { font: .56rem Georgia,serif;
    color:#eee4d2; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .skill-cost { position:absolute; right:4px; top:3px; color:#8ec9ef; font-size:.55rem; }
  .skill-modified { position:absolute; left:2px; bottom:1px; padding:1px 2px;
    font-size:.48rem; color:#f5d08b; background:#5d3146b7; border:1px solid #b77b87; }
  .skill-cooldown { position:absolute; inset:0; background:#090d14d8; display:grid;
    place-items:center; font:700 1rem Inter,sans-serif; color:#f1cf9e; }
  .potion-row { display:flex; gap:4px; justify-content:center; align-items:center;
    flex-wrap:nowrap; margin:0; width:100%; min-width:0; pointer-events:auto; }
  .potion-row button { min-width:0; min-height:23px; padding:3px 6px; overflow:hidden;
    text-overflow:ellipsis; white-space:nowrap; background:#201e21eb;
    border:1px solid #77674d; border-radius:2px; color:#e8d8ba; font-size:.6rem; }
  .potion-row .potion-use { display:flex; align-items:center; gap:3px; flex:0 1 auto; }
  .potion-row .potion-select { flex:0 1 auto; }
  .potion-row button:disabled { opacity:.5; cursor:default; }
  .potion-row .potion-select.chosen { border-color:#e3b76e; background:#39302a; }
  .potion-key { color:#e7b477; border:1px solid #8b7251; padding:0 3px; }
  .potion-use strong,.potion-timer { margin-left:3px; }
  .potion-timer { color:#e7a6a6; }
  .active-effects { display:flex; justify-content:center; gap:4px; min-width:0;
    margin:0; white-space:nowrap; overflow-x:auto; scrollbar-width:thin; }
  .effect-chip { flex:0 0 auto; border:1px solid #475960; padding:2px 5px;
    background:#10151bdd; color:#a9cbbc; font-size:.59rem; }
  .effect-chip.hostile { border-color:#7c4e56; color:#e4a1a0; }
  .necro-minions,.rogue-status { text-align:center; font-size:.6rem; color:#d5c3a5; line-height:1.2; }
  @media(max-width:1100px) {
    .skill-button,.skill-button.extra { height:60px; padding:15px 2px 3px; }
    .skill-title,.skill-button.extra .skill-title { display:none; }
    .skill-icon,.skill-button.extra .skill-icon { font-size:1.45rem; }
    .potion-row button { padding:2px 4px; min-height:22px; font-size:.57rem; }
    .potion-use span:nth-child(2) { display:none; }
  }
  @media(max-width:650px) {
    .skill-button,.skill-button.extra { height:46px; padding:12px 0 1px; }
    .skill-icon,.skill-button.extra .skill-icon { font-size:1.1rem; }
    .skill-shortcut,.skill-cost { font-size:.49rem; }
    .potion-row { gap:2px; }
    .potion-row button { padding:2px 3px; min-height:20px; font-size:.52rem; }
    .potion-timer { display:none; }
    .necro-minions,.rogue-status { font-size:.51rem; }
  }
</style>
