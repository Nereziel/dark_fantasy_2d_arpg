// GPL-3.0-only — original civilian pixel art. Visual identity is not gameplay authority.
import type { TownServiceRole } from '../world/townManifest';
import { VILLAGE_QUESTS } from '../quests/villageQuests';

export const NPC_FRAME_WIDTH=48;
export const NPC_FRAME_HEIGHT=56;
export const NPC_VISUAL_PRESETS=[
  'warden','village-quest','village-supplies','merchant','smith','village-smith','healer','village-healer',
  'apothecary','keeper','waystone','resident-mira','resident-toma','resident-lio'
] as const;
export type NpcVisualPreset=typeof NPC_VISUAL_PRESETS[number];
const ROLE_PRESET:Readonly<Record<TownServiceRole,NpcVisualPreset>>={
  quest:'village-quest',weaponMerchant:'merchant',blacksmith:'smith',healer:'healer',
  potionVendor:'apothecary',stash:'keeper',waypoint:'waystone',civilian:'resident-mira'
};
const named:Readonly<Record<string,NpcVisualPreset>>={
  warden_vesna:'warden',civilian_mira:'resident-mira',civilian_toma:'resident-toma',civilian_lio:'resident-lio',
  'north-village-civilian':'village-supplies','north-village-healer':'village-healer',
  'east-village-blacksmith':'village-smith','east-village-quest':'village-quest'
};
export function npcVisualPreset(id:string,role:TownServiceRole):NpcVisualPreset{
  if(Object.hasOwn(named,id))return named[id]!;
  // Quest-giver identity persists even after the reward has been claimed.
  if(VILLAGE_QUESTS.some(q=>q.giverId===id))return 'village-quest';
  if(role!=='civilian')return ROLE_PRESET[role];
  let hash=0;
  for(let i=0;i<id.length;i++)hash=(Math.imul(hash,31)+id.charCodeAt(i))>>>0;
  return (['resident-mira','resident-toma','resident-lio'] as const)[hash%3]!;
}
export interface NpcPixel {readonly x:number;readonly y:number;readonly w:number;readonly h:number;readonly color:string}
type Palette=readonly [cloth:string,light:string,shade:string,trim:string,skin:string,hair:string];
const PALETTES:Readonly<Record<Exclude<NpcVisualPreset,'waystone'>,Palette>>={
  warden:['#566779','#91a3ae','#293646','#d0b175','#dfb89b','#bab7ab'],
  'village-quest':['#74524e','#ab8072','#372d35','#dbc39a','#d0ad8b','#4d3a32'],
  'village-supplies':['#646b50','#a3a17a','#343c32','#cab781','#e0b693','#765242'],
  merchant:['#6e563d','#b18d5d','#372d29','#e0bb70','#d3ac87','#5f4331'],
  smith:['#805c46','#ba906b','#332d30','#adbac0','#d6a67f','#514039'],
  'village-smith':['#5d5548','#a39a79','#312e2c','#9da5ab','#caa383','#a79b87'],
  healer:['#617d70','#a0bd9c','#303f3d','#e5d0a2','#dfbd9b','#c0c4b7'],
  'village-healer':['#586f77','#92aab1','#293c46','#c5d5b9','#d9b89b','#605348'],
  apothecary:['#67566d','#a18aa8','#3b3246','#9ec6ac','#d5af94','#55443e'],
  keeper:['#726347','#b5a07a','#35332c','#e2bd6b','#cfae8d','#9f8b77'],
  'resident-mira':['#82705d','#bda48a','#493a38','#ab8166','#e0b798','#66443a'],
  'resident-toma':['#586253','#919c81','#333a37','#aa956f','#cda585','#554237'],
  'resident-lio':['#5d5a68','#9895a3','#37343d','#b5a27d','#d8b59a','#8d7053']
};
/** Integer pixel commands for a stationary, front-three-quarter civilian.
 * Transparent background, planted feet at y=50; costume/props are inside the
 * same frame and depth as the body. No weapons, combat class or status tint.
 */
export function npcPixels(preset:NpcVisualPreset):NpcPixel[]{
  const pixels:NpcPixel[]=[];
  const rect=(color:string,x:number,y:number,w:number,h:number)=>{pixels.push({color,x,y,w,h});};
  const outline='#171b22',boot='#29262b',metal='#aebbc0',gold='#cfaa66',paper='#e6d3a2',leather='#563b2b';
  rect('#20262c',11,50,26,3);
  if(preset==='waystone'){
    rect(outline,12,43,24,7);rect('#5d6467',14,43,20,5);rect('#969994',14,41,20,3);
    rect(outline,17,15,14,27);rect('#4a545c',18,16,12,26);rect('#8b9896',20,16,3,24);
    rect('#64777a',20,8,8,8);rect('#a2bcba',22,6,4,3);
    rect('#88d7cc',23,20,3,10);rect('#88d7cc',20,25,9,3);
    return pixels;
  }
  const [cloth,light,shade,trim,skin,hair]=PALETTES[preset];
  const robe=['warden','village-quest','healer','village-healer','apothecary'].includes(preset);
  const smith=preset==='smith'||preset==='village-smith';
  const wide=smith?13:10;
  // Grounded boots, layered clothing, readable three-quarter face.
  rect(outline,15,40,8,10);rect(outline,25,40,8,10);
  rect(boot,16,44,7,6);rect(boot,25,44,8,6);
  rect(shade,24-wide-1,23,wide*2+2,19);
  rect(cloth,24-wide,22,wide*2,17);rect(light,24-wide+1,23,wide*2-3,4);
  if(robe){
    rect(shade,13,34,22,13);rect(cloth,15,32,18,14);rect(light,17,34,3,11);
    rect(trim,15,44,18,2);
  }else{
    rect(shade,14,38,20,5);rect(cloth,17,39,7,5);rect(cloth,26,39,6,5);
  }
  rect(outline,23-wide-5,26,6,13);rect(cloth,24-wide-5,25,5,10);rect(skin,24-wide-5,35,5,4);
  rect(outline,24+wide,26,6,13);rect(cloth,24+wide,25,5,10);rect(skin,24+wide,35,5,4);
  rect(outline,15,10,18,14);rect(hair,16,9,16,8);
  rect(skin,18,13,13,10);rect('#b98d74',18,19,4,4);
  rect(outline,24,16,2,2);rect(outline,29,16,2,2);
  rect(hair,16,12,3,8);rect('#302b2e',25,21,5,1);
  rect(shade,17,34,14,3);rect(trim,23,34,4,3);

  switch(preset){
    case 'warden':
      // Military cloak and clasp, a rolled dispatch rather than a combat sword.
      rect(shade,6,21,9,23);rect(cloth,7,22,6,21);rect(light,11,23,3,17);
      rect(cloth,13,20,23,6);rect(trim,25,22,5,4);
      rect(hair,15,7,18,7);rect(trim,17,7,14,2);
      rect(leather,36,28,7,12);rect(paper,37,26,5,14);rect(gold,36,31,7,2);
      break;
    case 'village-quest':
      rect(shade,10,18,7,27);rect(cloth,11,20,5,24);rect(trim,15,24,4,19);
      rect(cloth,12,8,23,7);rect(light,15,6,16,3);
      rect(leather,34,31,11,9);rect(paper,35,29,9,10);rect('#a68159',35,32,9,2);
      break;
    case 'village-supplies':
      // Worker's shoulder shawl, bound delivery bundle.
      rect(light,11,18,26,6);rect(cloth,10,21,10,10);rect(trim,13,25,3,7);
      rect(leather,31,33,14,12);rect('#a68b62',32,32,12,10);
      rect(paper,33,35,10,2);rect(paper,38,33,2,10);
      rect(hair,14,8,17,4);rect(light,12,10,20,3);
      break;
    case 'merchant':
      rect(leather,5,19,12,23);rect('#987049',6,20,10,19);rect(gold,9,25,5,3);
      rect(cloth,12,9,23,6);rect(light,17,5,14,5);
      rect(leather,30,33,13,11);rect('#b38a59',31,33,11,7);rect(gold,36,39,3,3);
      rect(trim,18,24,3,13);
      break;
    case 'smith':
    case 'village-smith':
      // Bare forearms, leather apron and broad hammer.
      rect(skin,6,28,7,10);rect(skin,35,28,7,9);
      rect(leather,16,25,16,20);rect('#98704e',18,26,12,16);rect(trim,18,25,3,13);
      rect('#46342d',33,18,4,22);rect(outline,28,12,17,9);
      rect(metal,29,13,15,6);rect('#64737c',38,13,6,6);
      if(preset==='smith'){rect(hair,14,8,20,5);rect(hair,21,20,10,6);}
      else {rect(trim,13,9,22,3);rect(light,13,7,19,3);rect(leather,7,39,8,7);rect(metal,7,41,3,4);}
      break;
    case 'healer':
      rect(shade,14,6,20,9);rect(cloth,11,11,6,15);rect(cloth,31,11,6,15);
      rect(light,16,8,16,5);rect(trim,21,24,6,9);rect(trim,19,27,10,2);
      rect(leather,40,10,3,39);rect(outline,37,5,9,9);rect('#aacbc1',38,6,7,7);
      break;
    case 'village-healer':
      rect(cloth,12,7,23,9);rect(light,17,5,14,3);
      rect(trim,14,23,7,16);rect(leather,35,29,10,16);rect(light,36,31,8,4);
      rect(paper,38,31,3,9);rect(paper,36,34,7,3);
      break;
    case 'apothecary':
      rect(cloth,13,6,22,9);rect(light,10,13,28,3);rect(trim,20,24,3,12);
      rect(leather,32,31,14,14);rect('#846c54',33,32,12,11);
      rect(paper,35,27,3,3);rect('#8dbcb4',34,30,5,9);rect(paper,41,29,3,3);rect('#b88d96',40,32,5,8);
      break;
    case 'keeper':
      rect(light,14,7,19,4);rect(cloth,13,11,23,3);rect(trim,19,25,2,12);
      // Ledger and oversized ring of keys.
      rect(leather,5,30,11,14);rect(paper,6,31,9,11);rect('#967f5e',8,32,2,10);
      rect(gold,36,32,8,2);rect(gold,36,34,2,5);rect(gold,42,34,2,5);
      rect(gold,36,39,8,2);rect(gold,39,40,2,8);rect(gold,41,45,4,2);
      break;
    case 'resident-mira':
      rect(hair,14,8,18,6);rect(hair,13,16,5,11);rect(light,13,22,12,6);
      rect(cloth,12,36,24,10);rect(shade,12,45,24,2);
      break;
    case 'resident-toma':
      rect(light,13,7,20,5);rect(cloth,11,12,26,3);rect(light,13,24,5,13);
      rect(leather,8,37,7,9);rect('#9f845b',9,38,5,7);
      break;
    case 'resident-lio':
      rect(hair,16,5,14,8);rect(light,13,21,25,5);rect(trim,16,25,5,5);
      rect(shade,12,27,4,13);rect(cloth,31,34,8,10);
      break;
  }
  return pixels;
}

export function renderNpcTexture(preset:NpcVisualPreset):HTMLCanvasElement{
  const canvas=document.createElement('canvas');
  canvas.width=NPC_FRAME_WIDTH;canvas.height=NPC_FRAME_HEIGHT;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('NPC art requires Canvas2D');
  ctx.imageSmoothingEnabled=false;
  for(const p of npcPixels(preset)){ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.w,p.h);}
  return canvas;
}
