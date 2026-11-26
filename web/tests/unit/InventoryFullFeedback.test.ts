import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { rollItemForBase, SeededRng, type Item, type GroundItem } from '../../src/game/data/items';

const item=(id:string)=>rollItemForBase('belt',id,1,'COMMON',new SeededRng(39))!;
function fullInventory(){
  const game=new GameSimulation(12);
  const internal=game as unknown as {player:{x:number;y:number};inventory:Array<Item|null>;groundLoot:GroundItem[];stash:Array<Item|null>};
  internal.inventory=internal.inventory.map((_,i)=>item('bag-'+i));
  game.drainEvents();
  return {game,internal};
}
describe('inventory full feedback',()=>{
  it('reports a failed pickup once per attempt, preserves loot and permits later collection',()=>{
    const {game,internal}=fullInventory();
    internal.groundLoot=[{id:'ground-belt',item:item('ground-item'),x:internal.player.x,y:internal.player.y}];
    const before=game.snapshot().inventory;
    game.command({type:'pickup',id:'ground-belt'});
    game.advance(100);
    expect(game.drainEvents().filter(e=>e.type==='inventoryFull')).toEqual([{type:'inventoryFull',source:'pickup'}]);
    expect(game.snapshot().inventory).toEqual(before);
    expect(game.snapshot().groundLoot[0]?.id).toBe('ground-belt');
    game.advance(100);
    expect(game.drainEvents().some(e=>e.type==='inventoryFull')).toBe(false);
    internal.inventory[0]=null;
    game.command({type:'pickup',id:'ground-belt'});
    game.advance(100);
    expect(game.snapshot().inventory[0]?.id).toBe('ground-item');
    expect(game.snapshot().groundLoot.some(l=>l.id==='ground-belt')).toBe(false);
    expect(game.drainEvents().some(e=>e.type==='inventoryFull')).toBe(false);
  });
  it('reports a full backpack on an authorized stash withdrawal without changing either inventory',()=>{
    const {game,internal}=fullInventory();
    internal.player.x=325;internal.player.y=502;
    internal.stash[0]=item('stored-belt');
    const before=game.snapshot().inventory;
    game.command({type:'stashWithdraw',index:0,tab:0});
    expect(game.drainEvents().filter(e=>e.type==='inventoryFull')).toEqual([{type:'inventoryFull',source:'stash'}]);
    expect(game.snapshot().inventory).toEqual(before);
    expect(game.snapshot().stash?.[0]?.id).toBe('stored-belt');
    internal.inventory[0]=null;
    game.command({type:'stashWithdraw',index:0,tab:0});
    expect(game.snapshot().inventory[0]?.id).toBe('stored-belt');
    expect(game.snapshot().stash?.[0]).toBeNull();
  });
});
