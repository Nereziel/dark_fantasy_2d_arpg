<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import type { EquipmentSlot, Item } from '../game/data/items';
  import {
    GEM_BASES, GEM_IDS, isGemId, socketBonus, socketCategory, tierOf,
    type GemBaseId, type GemId
  } from '../game/gems/gemCatalog';
  import { quoteGemRecipe } from '../game/gems/gemRules';
  import GemArt from './GemArt.svelte';

  let { view, bridge }: {view:GameSnapshot; bridge:GameBridge} = $props();

  type SocketTarget = { location:'inventory'; index:number; item:Item }
    | { location:'equipment'; slot:EquipmentSlot; item:Item };

  let targets:SocketTarget[] = $derived([
    ...view.inventory.flatMap((item,index):SocketTarget[]=>
      item?.sockets?.length ? [{location:'inventory',index,item}]:[]),
    ...Object.entries(view.equipment).flatMap(([slot,item]):SocketTarget[]=>
      item?.sockets?.length
        ? [{location:'equipment',slot:slot as EquipmentSlot,item}]:[])
  ]);
  let heldGems = $derived(GEM_IDS.filter(id=>(view.gems?.[id]??0)>0));

  function name(id:GemId):string {
    return $t('gems.names.'+id.slice(0,-2))+' '+$t('gems.tier')+' '+tierOf(id);
  }
  function gemCost(baseId:GemBaseId):string {
    const quote=quoteGemRecipe(baseId);
    if(!quote)return '';
    return [...Object.entries(quote.materials).map(([id,amount])=>
      amount+' '+$t('crafting.materials.'+id)),
      quote.gold+' '+$t('hud.gold')].join(', ');
  }
  function canForge(baseId:GemBaseId):boolean {
    const quote=quoteGemRecipe(baseId);
    const id=`${baseId}.1` as GemId;
    return !!quote && view.gold>=quote.gold && (view.gems?.[id]??0)<9999
      && Object.entries(quote.materials).every(([material,amount])=>
        (view.materials?.[material as keyof NonNullable<GameSnapshot['materials']>]??0)>=amount);
  }
  function insert(target:SocketTarget,index:number,id:GemId):void {
    if(target.location==='inventory') bridge.command({
      type:'socketGem',location:'inventory',index:target.index,socketIndex:index,gemId:id
    });
    else bridge.command({
      type:'socketGem',location:'equipment',slot:target.slot,socketIndex:index,gemId:id
    });
  }
  function remove(target:SocketTarget,index:number):void {
    if(target.location==='inventory') bridge.command({
      type:'unsocketGem',location:'inventory',index:target.index,socketIndex:index
    });
    else bridge.command({
      type:'unsocketGem',location:'equipment',slot:target.slot,socketIndex:index
    });
  }
  function bonusLabel(item:Item,id:GemId):string {
    const category=socketCategory(item);
    if(!category)return '';
    const bonuses=socketBonus(id,category);
    return Object.entries(bonuses).filter(([,amount])=>amount>0)
      .map(([stat,amount])=>'+'+amount+' '+$t('gems.bonuses.'+stat)).join(', ');
  }
</script>

<section class="gem-forge">
  <h3>{$t('gems.title')}</h3>
  <p class="gem-note">{$t('gems.description')}</p>
  <h4>{$t('gems.forgeTitle')}</h4>
  <div class="gem-catalog">
    {#each GEM_BASES as base (base.id)}
      {@const first = (base.id+'.1') as GemId}
      <div class="gem-entry" data-gem-base={base.id}>
        <div class="gem-entry-header">
          <GemArt gemId={first} />
          <strong>{$t('gems.names.'+base.id)}</strong>
        </div>
        <small>{$t('gems.tier')} 1 · {gemCost(base.id)}</small>
        <div class="gem-controls">
          <button disabled={!canForge(base.id)}
            onclick={()=>bridge.command({type:'forgeGem',baseId:base.id})}>
            {$t('gems.forge')}
          </button>
          <span>{$t('gems.held')}: <strong>{view.gems?.[first]??0}</strong></span>
        </div>
      </div>
    {/each}
  </div>

  <h4>{$t('gems.wallet')}</h4>
  <div class="gem-wallet" data-testid="gem-wallet">
    {#each GEM_IDS as gemId (gemId)}
      {#if (view.gems?.[gemId]??0)>0}
        <div class="gem-wallet-item" data-gem-id={gemId}>
          <span class="gem-wallet-preview"><GemArt {gemId} compact />{name(gemId)}</span>
          <strong>{view.gems?.[gemId]}</strong>
          {#if tierOf(gemId)<3}
            <button disabled={(view.gems?.[gemId]??0)<3 || view.gold<tierOf(gemId)*15
              || (view.gems?.[(gemId.slice(0,-1)+(tierOf(gemId)+1)) as GemId]??0)>=9999}
              onclick={()=>bridge.command({type:'upgradeGem',gemId})}>
              {$t('gems.combine')} (3:1 · {tierOf(gemId)*15} {$t('hud.gold')})
            </button>
          {/if}
        </div>
      {/if}
    {/each}
    {#if heldGems.length===0}<p class="gem-note">{$t('gems.emptyWallet')}</p>{/if}
  </div>

  <h4>{$t('gems.socketsTitle')}</h4>
  <div class="socket-list">
    {#each targets as target (target.item.id)}
      <div class="socket-item" data-testid={'socket-item-'+target.item.id}>
        <strong>{target.item.icon} {$t('item.base.'+target.item.templateId)}
          <small>({$t('gems.categories.'+(socketCategory(target.item)??'armor'))})</small>
        </strong>
        {#if view.itemFlags?.[target.item.id]?.locked || view.itemFlags?.[target.item.id]?.favorite}
          <p class="gem-note">{$t('crafting.protected')}</p>
        {:else}
          <div class="socket-rows">
            {#each target.item.sockets??[] as socket, index (index)}
              <div class="socket-row" data-socket-index={index}>
                <span class="socket-index">{$t('gems.socket')} {index+1}</span>
                {#if isGemId(socket)}
                  <span class="socket-filled">
                    <GemArt gemId={socket} compact />{name(socket)}
                    <small>{bonusLabel(target.item,socket)}</small>
                  </span>
                  <button disabled={view.gold<6*tierOf(socket) || (view.gems?.[socket]??0)>=9999}
                    onclick={()=>remove(target,index)}>
                    {$t('gems.remove')} ({6*tierOf(socket)} {$t('hud.gold')})
                  </button>
                {:else}
                  <span>{$t('gems.emptySocket')}</span>
                  {#each heldGems as gemId (gemId)}
                    <button onclick={()=>insert(target,index,gemId)}
                      aria-label={$t('gems.insert')+' '+name(gemId)}>
                      <GemArt {gemId} compact />
                      {$t('gems.insert')} {name(gemId)}
                      <small>{bonusLabel(target.item,gemId)}</small>
                    </button>
                  {/each}
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    {#if targets.length===0}<p class="gem-note">{$t('gems.noSocketedGear')}</p>{/if}
  </div>
</section>

<style>
  .gem-forge{border-top:1px solid #665039;margin-top:19px;padding-top:14px}
  h3{font:1.06rem Georgia,serif;color:#e4cc9c;margin:0 0 9px}
  h4{font:1rem Georgia,serif;color:#d6be8a;margin:16px 0 9px}
  .gem-note{font-size:.75rem;color:#b5c1bd;line-height:1.5}
  .gem-catalog{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
  .gem-entry,.gem-wallet-item,.socket-item{background:#111d27;border:1px solid #465563;padding:10px}
  .gem-entry{display:flex;flex-direction:column;gap:5px;font-size:.8rem}
  .gem-entry-header,.gem-wallet-preview{display:flex;align-items:center;gap:7px;min-width:0}
  .gem-entry-header strong{min-width:0;overflow-wrap:anywhere}
  .gem-entry strong,.socket-item strong{color:#e7d6b1}
  .gem-entry small,.socket-item small{font-size:.66rem;color:#afbcb8}
  .gem-controls{display:flex;gap:7px;justify-content:space-between;align-items:center;margin-top:auto}
  .gem-controls span{font-size:.72rem}
  .gem-wallet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
  .gem-wallet-item{display:flex;gap:8px;align-items:center;font-size:.74rem;flex-wrap:wrap}
  .gem-wallet-item strong{color:#eccc88}
  .socket-list{display:flex;flex-direction:column;gap:8px}
  .socket-item>strong{display:block;margin-bottom:8px;font-size:.82rem}
  .socket-rows{display:flex;flex-direction:column;gap:5px}
  .socket-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px;
    background:#1b2730;border:1px solid #36444e;font-size:.7rem}
  .socket-index{color:#d2a976}
  .socket-filled{color:#eed398;display:inline-block;line-height:1.35}
  .socket-filled small{display:block;color:#b4c3b9}
  button{font-size:.69rem;border:1px solid #8a7756;color:#eed9b4;
    background:#2a343c;padding:7px 9px}
  button small{display:block;font-size:.61rem;color:#c5b49d}
  .socket-row button{min-height:42px;line-height:1.45}
  .gem-entry-header :global(svg),.gem-wallet-preview :global(svg){flex-shrink:0}
  button:disabled{opacity:.4;cursor:not-allowed}
  @media(max-width:730px){.gem-catalog{grid-template-columns:repeat(2,minmax(0,1fr))}
    .gem-wallet{grid-template-columns:1fr}}
</style>
