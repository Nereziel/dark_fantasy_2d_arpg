<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import {
    allTalentsForClass, canSpendTalent, planRespecTalents, respecGoldCost,
    spentTalentPoints, type TalentBranch
  } from '../game/progression/talentTree';

  let { view, bridge, close }: {
    view: GameSnapshot; bridge: GameBridge; close: () => void
  } = $props();

  let branches:readonly TalentBranch[]=$derived(view.classId==='PALADIN'
    ? ['holyWarrior','paladinGuardian','auraMaster','holyCaster']
    : view.classId==='MAGE' ? ['fire','frost','lightning','arcane']
    : ['berserker','guardian','warlord']);
  let activeNodes=$derived(allTalentsForClass(view.classId));
  let invested = $derived(spentTalentPoints(view.talentRanks ?? {}));
  let price = $derived(respecGoldCost(view.level, view.talentRanks ?? {}));
  let canRespec = $derived(planRespecTalents(view.classId, view.level,
    view.talentPoints ?? 0, view.talentRanks ?? {}, view.gold).ok);
</script>

<div class="talent-backdrop">
  <div class="talent-dialog" role="dialog" aria-modal="true" aria-label={$t('talents.title')}>
    <header>
      <div>
        <div class="eyebrow">AETHER &amp; RUIN</div>
        <h2>{$t(view.classId==='PALADIN' ? 'talents.paladinTitle'
          : view.classId==='MAGE' ? 'talents.mageTitle' : 'talents.title')}</h2>
        <p>{$t('talents.available')}: <strong>{view.talentPoints ?? 0}</strong>
          · {$t('talents.invested')}: <strong>{invested}</strong>
          · {$t('hud.gold')}: <strong>{view.gold}</strong></p>
      </div>
      <button class="close" aria-label={$t('inventory.close')} onclick={close}>✕</button>
    </header>

    {#if view.classId !== 'WARRIOR' && view.classId !== 'PALADIN' && view.classId !== 'MAGE'}
      <p class="notice">{$t('talents.warriorOnly')}</p>
    {:else}
      <div class="talent-columns">
        {#each branches as branch (branch)}
          <section aria-label={$t('talents.branches.' + branch)}>
            <h3>{$t('talents.branches.' + branch)}</h3>
            {#each activeNodes.filter(node => node.branch === branch) as talent (talent.id)}
              {@const rank = view.talentRanks?.[talent.id] ?? 0}
              {@const check = canSpendTalent(view.classId, view.level,
                view.talentPoints ?? 0, view.talentRanks ?? {}, talent.id)}
              <article class:invested={rank > 0} data-talent-id={talent.id}>
                <div class="talent-heading">
                  <strong>{$t('talents.nodes.' + talent.id + '.name')}</strong>
                  <span class="ranks">{rank}/{talent.maxRank}</span>
                </div>
                <p>{$t('talents.nodes.' + talent.id + '.description')}</p>
                <div class="meta">
                  {$t('talents.unlockLevel')} {talent.unlockLevel}
                  {#if talent.prerequisites.length > 0}
                    · {$t('talents.prerequisite')}:
                    {#each talent.prerequisites as prereq, index (prereq.id)}
                      {#if index > 0}, {/if}{$t('talents.nodes.' + prereq.id + '.name')}
                      {prereq.minRank}+
                    {/each}
                  {/if}
                </div>
                <button
                  disabled={!check.ok || !view.player.alive}
                  onclick={() => bridge.command({type:'spendTalent',id:talent.id})}
                  aria-label={$t('talents.investIn', {values: {
                    talent: $t('talents.nodes.' + talent.id + '.name')
                  }})}>
                  {$t('talents.investPoint')}
                </button>
              </article>
            {/each}
          </section>
        {/each}
      </div>
      <footer>
        <p>{$t('talents.respecInfo')} <strong>{price} {$t('hud.gold')}</strong></p>
        <button disabled={!canRespec || invested === 0 || !view.player.alive}
          onclick={() => bridge.command({type:'respecTalents'})}>
          {$t('talents.respec')}
        </button>
      </footer>
    {/if}
  </div>
</div>

<style>
  .talent-backdrop{position:absolute;inset:0;z-index:11;background:#05080edc;
    display:grid;place-items:center;padding:15px}
  .talent-dialog{width:min(1080px,96vw);max-height:94vh;overflow:auto;
    border:1px solid #907658;background:linear-gradient(150deg,#202832,#0c121b);
    padding:20px 23px;box-shadow:0 25px 75px #000d;color:#d4d2ca}
  header{display:flex;justify-content:space-between;align-items:start;border-bottom:1px solid #514737;
    padding-bottom:14px;gap:16px}
  .eyebrow{letter-spacing:.2em;color:#bba17d;font-size:.67rem}
  h2{font:1.7rem Georgia,serif;color:#edd9b8;margin:7px 0}
  header p{font-size:.8rem;margin:5px 0;color:#bfc5c5}
  header strong{color:#f0cb8e}
  .close{padding:8px 13px}
  .talent-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;
    padding:16px 0}
  section{background:#101923;border:1px solid #384650;padding:12px;min-width:0}
  h3{font:1.24rem Georgia,serif;color:#e8bf84;border-bottom:1px solid #3d4045;
    padding-bottom:9px;margin:0 0 13px}
  article{padding:12px;margin-bottom:12px;background:#1a222c;border:1px solid #3f4650}
  article.invested{border-color:#b99a65;background:#242b31}
  .talent-heading{display:flex;gap:6px;justify-content:space-between;align-items:start;font-size:.88rem;color:#eed6af}
  .ranks{font-variant-numeric:tabular-nums;color:#f1bf75;font-size:.75rem}
  article p{font-size:.77rem;line-height:1.4;min-height:46px;color:#c0c5c5}
  .meta{font-size:.71rem;color:#bfae92;min-height:35px;margin-bottom:9px}
  article button{width:100%;font-size:.78rem;padding:7px 9px}
  button:disabled{opacity:.45;cursor:not-allowed}
  footer{border-top:1px solid #514737;display:flex;align-items:center;justify-content:space-between;
    gap:16px;flex-wrap:wrap;padding-top:13px;font-size:.8rem}
  footer strong{color:#f0c787}
  footer button{padding:8px 14px}
  .notice{padding:18px;color:#d0b68e}
  @media(max-width:770px){.talent-dialog{padding:10px}.talent-columns{grid-template-columns:1fr}
    article p,.meta{min-height:0}}
</style>
