// GPL-3.0-only — pure presentation policy, no gameplay writes.
import type { ClassId } from '../data/classes';
import type { TownServiceRole } from '../world/townManifest';

export function roleMarker(role: TownServiceRole, questStatus?: string): string {
  if(role==='quest') return questStatus==='available'?'!':questStatus==='ready'?'?':questStatus==='active'?'…':'✦';
  return ({weaponMerchant:'¤',blacksmith:'⚒',potionVendor:'✚',healer:'+',stash:'▣',waypoint:'◇',civilian:''})[role];
}
export interface WorldLabel { id:string;x:number;y:number;width:number;height:number }
export function layoutWorldLabels(input: readonly WorldLabel[]): WorldLabel[] {
  const placed: WorldLabel[]=[];
  for(const candidate of [...input].sort((a,b)=>a.id.localeCompare(b.id))) {
    const label={...candidate};
    for(let i=0;i<=placed.length;i++){
      const conflict=placed.find(p=>Math.abs(p.x-label.x)<(p.width+label.width)/2+4 &&
        Math.abs(p.y-label.y)<(p.height+label.height)/2+2);
      if(!conflict)break;
      label.y=conflict.y-(conflict.height+label.height)/2-2;
    }
    placed.push(label);
  }
  return placed;
}
export function skillCueStyle(classId:ClassId,id:string):{color:number;duration:number;basic:boolean}{
  const colors:Record<ClassId,number>={WARRIOR:0xe9b277,PALADIN:0xffdf8b,MAGE:0x92d9ff,ROGUE:0x9be3a1,NECROMANCER:0x87c8bd,WARLOCK:0xcd9cf9};
  const basic=id==='basicAttack';
  const color=/frost|ice/i.test(id)?0x9ee9ff:/fire|flame/i.test(id)?0xff9856:colors[classId];
  return {color,duration:basic?240:520,basic};
}
const KEY='aether-ruin-ground-labels-v1';
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
let cached:boolean|undefined;
function storage():StorageLike|null {try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export function lootLabelsEnabled(source?:StorageLike|null):boolean{
  if(source===undefined&&cached!==undefined)return cached;
  try{const value=(source===undefined?storage():source)?.getItem(KEY)!=='off';if(source===undefined)cached=value;return value;}catch{return true;}
}
export function setLootLabelsEnabled(value:boolean,source?:StorageLike|null):void{
  if(source===undefined)cached=value;
  try{(source===undefined?storage():source)?.setItem(KEY,value?'on':'off');}catch{/* private mode */}
}
