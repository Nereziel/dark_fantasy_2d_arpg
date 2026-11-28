// GPL-3.0-only — #207 B1, session-owned ordinary enemy roster.
import {describe,expect,it} from 'vitest';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {planWildernessPopulation} from '../../src/game/world/wildernessPopulation';
import {WildernessPopulationSession,POPULATION_ACTIVATE_MARGIN,POPULATION_DEACTIVATE_MARGIN} from '../../src/game/world/populationLifecycle';
import {ENEMY_DEFINITIONS} from '../../src/game/enemies/enemies';

const manifest=()=>planWildernessPopulation(buildWilderness(42));
const view=(x:number,y:number)=>({minX:x-20,maxX:x+20,minY:y-20,maxY:y+20});
const far={player:{x:-10000,y:-10000},visible:view(-10000,-10000)};
const near=(p:{x:number;y:number})=>({player:p,visible:view(p.x,p.y)});

describe('#207 B1 — population lifecycle without respawns',()=>{
  it('creates the complete authoritative roster before first activation',()=>{
    const m=manifest(),s=new WildernessPopulationSession(m,3);
    const all=s.snapshot();
    expect(all).toHaveLength(m.groups.flatMap(g=>g.members).length);
    expect(s.activeUnits()).toEqual([]);
    for(const u of all){
      expect(u.actor.alive).toBe(true);
      expect(u.actor.health).toBe(ENEMY_DEFINITIONS[u.actor.type].health+24);
      expect(u.actor.health).toBe(u.actor.maxHealth);
    }
  });
  it('retains identity, wounds, death, position and cooldown across unload and repeated activation',()=>{
    const m=manifest(),s=new WildernessPopulationSession(m,1);
    const g=m.groups[0]!;
    s.refresh(near(g.anchor));
    const wounded=s.activeUnits().find(u=>u.actor.id===g.members[0]!.id)!;
    const dead=s.activeUnits().find(u=>u.actor.id===g.members[1]!.id)!;
    wounded.actor.health-=7; wounded.cooldown=1.25; wounded.actor.x+=5;
    dead.actor.health=0; dead.actor.alive=false;
    const before=s.snapshot();
    expect(s.refresh(far).deactivated).toContain(g.id);
    expect(s.activeUnits()).toEqual([]);
    for(let i=0;i<3;i++){s.refresh(near(g.anchor));s.refresh(far);}
    s.refresh(near(g.anchor));
    expect(s.activeUnits().find(u=>u.actor.id===wounded.actor.id)).toBe(wounded);
    expect(s.activeUnits().find(u=>u.actor.id===dead.actor.id)).toBe(dead);
    expect(s.snapshot()).toEqual(before);
    const fresh=new WildernessPopulationSession(m,1);
    expect(fresh.snapshot().every(u=>u.actor.alive&&u.actor.health===u.actor.maxHealth)).toBe(true);
    expect(s.snapshot().find(u=>u.actor.id===dead.actor.id)?.actor.alive).toBe(false);
  });
  it('preactivates outside viewport, retains hysteresis and honors combat pins',()=>{
    const m=manifest(),s=new WildernessPopulationSession(m,1),g=m.groups[0]!;
    const p=g.members[0]!.spawn;
    const offset=POPULATION_ACTIVATE_MARGIN-10;
    const bounds={minX:p.x+offset,maxX:p.x+offset+20,minY:p.y-10,maxY:p.y+10};
    s.refresh({player:far.player,visible:bounds});
    expect(s.activeUnits().some(u=>u.actor.id===g.members[0]!.id)).toBe(true);
    const mid=(POPULATION_ACTIVATE_MARGIN+POPULATION_DEACTIVATE_MARGIN)/2;
    const right=Math.max(...g.members.map(m=>m.spawn.x));
    s.refresh({player:far.player,visible:{minX:right+mid,maxX:right+mid+20,minY:p.y-200,maxY:p.y+200}});
    expect(s.activeUnits().some(u=>u.actor.id===g.members[0]!.id)).toBe(true);
    s.refresh({...far,pinnedMemberIds:[g.members[0]!.id]});
    expect(s.activeUnits().some(u=>u.actor.id===g.members[0]!.id)).toBe(true);
    s.refresh(far);
    expect(s.activeUnits()).toEqual([]);
  });
  it('does not unload a living unit with an unresolved attack intent',()=>{
    const m=manifest(),s=new WildernessPopulationSession(m,1),g=m.groups[0]!;
    s.refresh(near(g.anchor));
    const u=s.activeUnits().find(u=>u.actor.id===g.members[0]!.id)!;
    u.intent={x:u.actor.x,y:u.actor.y,pattern:'sweep',radius:40,remaining:1,total:1};
    s.refresh(far);
    expect(s.activeUnits()).toContain(u);
    u.intent=null;
    s.refresh(far);
    expect(s.activeUnits()).toEqual([]);
  });
  it('returns detached snapshots and rejects invalid activation input atomically',()=>{
    const s=new WildernessPopulationSession(manifest(),1);
    const copy=s.snapshot();copy[0]!.actor.health=0;
    expect(s.snapshot()[0]!.actor.health).toBeGreaterThan(0);
    const before=s.snapshot();
    expect(()=>s.refresh({...far,visible:{...far.visible,minX:NaN}})).toThrow();
    expect(s.snapshot()).toEqual(before);
    expect(s.activeUnits()).toEqual([]);
  });
});
