// GPL-3.0-only — original isometric prop art. Presentation, never game authority.
import type {Point} from '../core/types';
import type {CryptThemePlan,CryptProp} from '../world/cryptTheme';

export const PROP_PRESETS=['chest','crate','barrel','sarcophagus','coffin','urn','evidence','shrine','door','lockedDoor','lever','trap','rune','secret','lore','gravestone','lantern','candelabrum','ossuary','poisonUrn'] as const;
export type PropPreset=typeof PROP_PRESETS[number];
const env:Readonly<Record<string,PropPreset>>={
  'field-chest':'chest','soul-shrine':'shrine','story-evidence':'evidence',
  'env.chest':'chest','env.crate':'crate','env.barrel':'barrel','env.door':'door',
  'env.lockedDoor':'lockedDoor','env.lever':'lever','env.trap':'trap','env.hiddenWall':'secret','env.lore':'lore'
};
const crypt:Readonly<Record<string,PropPreset>>={
  treasureChest:'chest',sarcophagus:'sarcophagus',coffin:'coffin',urn:'urn',
  eventRune:'rune',spikeMarker:'trap',poisonUrn:'poisonUrn',runicSeal:'rune',secretSeal:'secret',
  gravestone:'gravestone',lantern:'lantern',candelabrum:'candelabrum',ossuary:'ossuary'
};
export function propPreset(id:string,eventKey?:string):PropPreset|null{
  if(Object.hasOwn(env,id))return env[id]!;
  if(id.startsWith('env.shrine'))return 'shrine';
  if(!id.startsWith('crypt/'))return null;
  const suffix=id.split('-').at(-1)!;
  if(Object.hasOwn(crypt,suffix))return crypt[suffix]!;
  if(eventKey==='crypt.open.treasure')return 'chest';
  if(eventKey==='crypt.open.sarcophagus')return 'sarcophagus';
  if(eventKey==='crypt.break.urn')return 'urn';
  if(eventKey==='crypt.event.rune'||eventKey==='crypt.trap.runic')return 'rune';
  if(eventKey==='crypt.trap.spike')return 'trap';
  if(eventKey==='crypt.trap.poison')return 'poisonUrn';
  if(eventKey==='crypt.secret.reveal')return 'secret';
  return null;
}
export function decorativeCryptProps(theme:CryptThemePlan):CryptProp[]{
  const rooms=new Set(theme.roomVisuals.filter(r=>r.initiallyVisible).map(r=>r.roomId));
  return theme.props.filter(p=>p.capability==='decorative'&&rooms.has(p.roomId)&&propPreset(p.id)!==null);
}
export function propBody(preset:PropPreset):{bodyHeight:number;bodyHalfWidth:number}{
  switch(preset){
    case 'chest':return {bodyHeight:25,bodyHalfWidth:24};
    case 'crate':return {bodyHeight:28,bodyHalfWidth:20};
    case 'barrel':return {bodyHeight:32,bodyHalfWidth:14};
    case 'sarcophagus':case 'coffin':return {bodyHeight:22,bodyHalfWidth:27};
    case 'door':case 'lockedDoor':case 'secret':return {bodyHeight:49,bodyHalfWidth:23};
    case 'shrine':return {bodyHeight:44,bodyHalfWidth:19};
    case 'evidence':case 'lore':return {bodyHeight:30,bodyHalfWidth:18};
    case 'lantern':case 'candelabrum':case 'gravestone':return {bodyHeight:36,bodyHalfWidth:14};
    case 'trap':case 'rune':return {bodyHeight:9,bodyHalfWidth:20};
    default:return {bodyHeight:26,bodyHalfWidth:15};
  }
}
export interface PropShape {readonly points:readonly Point[];readonly color:string}
export function propArt(preset:PropPreset,interactive:boolean):PropShape[]{
  const shapes:PropShape[]=[];
  const p=(color:string,...xy:number[])=>shapes.push({color,points:Array.from({length:xy.length/2},(_,i)=>({x:xy[i*2]!,y:xy[i*2+1]!}))});
  const rect=(color:string,x:number,y:number,w:number,h:number)=>p(color,x,y,x+w,y,x+w,y+h,x,y+h);
  const wood='#775039',light='#ab8052',dark='#3a2b25',iron='#454b4e',metal='#8a9290',brass=interactive?'#d4b56b':'#77766d',stone='#777b7c',shade='#42484d';
  const base=(w:number,h:number,top:string,left:string,right:string)=>{
    p('#161a1c',-w-2,-h,0,-h-11,w+2,-h,w+2,0,0,8,-w-2,0);
    p(left,-w,-h,0,-h+8,0,6,-w,-2);
    p(right,0,-h+8,w,-h,w,-2,0,6);
    p(top,-w,-h,0,-h-10,w,-h,0,-h+8);
  };
  // Each silhouette is deliberately different; dark contact outlines anchor
  // the small world prop to the exact authoritative foot.
  switch(preset){
    case 'chest':
      base(23,17,light,wood,dark);
      p('#b18b59',-23,-17,-18,-26,0,-34,18,-26,23,-17,0,-9);
      p('#836041',-23,-17,-18,-26,0,-19,0,-9);
      p(brass,-18,-26,-14,-28,4,-20,0,-18,0,6,-4,4,-4,-18);
      p(brass,9,-30,13,-28,23,-19,23,-15,13,-23);
      rect('#1e2425',-5,-13,10,8);rect(brass,-4,-12,8,6);rect('#36291b',-1,-10,2,3);
      break;
    case 'crate':
      base(20,20,light,wood,dark);
      p('#4a352a',-20,-20,0,-12,0,-9,-20,-17);
      p('#c19762',-18,-17,-15,-16,-2,-1,-2,3);
      p('#ac8157',-19,-2,-19,-6,-4,-13,-1,-12);
      p('#90704b',2,-11,18,-18,18,-15,2,-7);
      rect(iron,-5,-10,3,3);rect(iron,14,-12,3,3);
      break;
    case 'barrel':
      p('#211c19',-13,-28,-8,-34,8,-34,14,-28,15,-8,10,2,-10,2,-15,-8);
      p(wood,-12,-27,0,-23,0,2,-10,0,-14,-8);
      p(dark,0,-23,12,-27,14,-8,9,0,0,2);
      p(light,-13,-28,-8,-32,8,-32,13,-28,8,-23,-8,-23);
      for(const y of [-21,-7])p(iron,-14,y,-6,y+3,6,y+3,14,y,14,y+4,6,y+7,-6,y+7,-14,y+4);
      rect(metal,-10,-18,3,2);rect(metal,-10,-4,3,2);
      break;
    case 'sarcophagus':
      base(26,12,'#a2a29b',stone,shade);
      p('#b1b0a4',-25,-15,-14,-25,7,-27,26,-15,9,-5,-10,-7);
      p('#6a6f70',-17,-16,-7,-23,5,-23,18,-16,7,-9,-7,-10);
      p(brass,-10,-18,-7,-20,12,-13,9,-11);
      p(brass,-2,-23,0,-24,0,-13,-3,-12);
      break;
    case 'coffin':
      p('#201b19',-27,-13,-15,-23,9,-24,25,-12,19,0,-4,6,-27,-4);
      p(wood,-25,-15,-15,-23,9,-22,23,-13,11,-6,-4,-7);
      p(dark,-25,-15,-4,-7,-4,5,-25,-4);
      p('#523b2f',-4,-7,23,-13,19,-1,-4,5);
      p('#947450',-17,-18,10,-14,7,-11,-20,-16);
      break;
    case 'urn':case 'poisonUrn':
      p('#222326',-13,-6,-14,-16,-8,-25,-6,-31,6,-31,8,-25,14,-16,13,-6,7,3,-7,3);
      p(preset==='poisonUrn'?'#687d49':'#87634c',-10,-6,-12,-15,-6,-25,0,-26,0,2,-6,2);
      p(preset==='poisonUrn'?'#425737':'#553d34',0,-26,6,-25,12,-15,10,-6,6,2,0,2);
      rect(light,-7,-29,14,3);rect(dark,-7,-32,14,3);
      p('#b49a72',-11,-15,0,-12,11,-15,10,-12,0,-9,-10,-12);
      if(preset==='poisonUrn')rect('#a2c85c',-3,-20,6,5);
      break;
    case 'evidence':case 'lore':
      base(17,11,stone,shade,'#353b3d');
      p(wood,-14,-15,-14,-28,14,-23,14,-12,0,-6);
      p('#e2c997',-12,-27,0,-22,12,-24,12,-13,0,-10,-12,-15);
      p('#ac8d5c',-1,-22,1,-22,1,-10,-1,-10);
      rect('#5c4938',-9,-21,6,1);rect('#5c4938',3,-19,6,1);
      if(preset==='evidence'){p('#c45a45',-4,-16,2,-17,5,-13,0,-10,-5,-12);rect(brass,8,-13,3,3);}
      break;
    case 'shrine':
      base(18,7,stone,shade,'#343a40');
      p('#8a8b83',-10,-7,-7,-32,0,-44,7,-32,10,-7,0,-2);
      p('#414e50',0,-44,7,-32,10,-7,0,-2);
      p('#a3cdd1',0,-37,6,-27,0,-17,-6,-27);
      rect('#ddf4e4',-1,-32,2,10);
      break;
    case 'door':case 'lockedDoor':case 'secret':
      p('#292b30',-23,1,-23,-39,-16,-49,15,-49,23,-39,23,1,0,6);
      p(preset==='secret'?stone:wood,-19,-2,-19,-38,-13,-45,13,-45,19,-38,19,-2,0,3);
      for(const x of [-13,-4,5,14])rect(preset==='secret'?shade:dark,x,-38,2,37);
      rect(metal,-22,-30,44,4);rect(iron,-22,-9,44,4);
      if(preset==='lockedDoor'){rect(brass,-5,-25,10,12);rect(dark,-1,-21,2,4);}
      else if(preset==='secret'){p('#ad9f77',-12,-34,0,-28,12,-34,0,-25);}
      else rect(brass,10,-20,4,5);
      break;
    case 'lever':
      base(12,8,stone,shade,dark);
      p(iron,-4,-7,-7,-24,-3,-27,1,-9);
      rect(brass,-9,-28,9,4);
      p(metal,-6,-8,0,-13,7,-8,0,-4);
      break;
    case 'trap':case 'rune':
      p(shade,-20,0,0,-12,20,0,0,8);
      p(preset==='trap'?'#776e61':'#637e80',-17,0,0,-9,17,0,0,6);
      if(preset==='trap')for(const x of [-10,0,10])p(metal,x-2,0,x,-9,x+2,0);
      else {p('#a4d4c9',-8,0,0,-7,8,0,0,4);p(shade,-4,0,0,-3,4,0,0,2);}
      break;
    case 'gravestone':
      base(13,5,stone,shade,dark);
      p('#696f72',-11,-3,-11,-29,-5,-36,6,-36,12,-29,12,-3,0,1);
      p('#92948b',-9,-4,-9,-28,-4,-33,0,-33,0,-2);
      rect('#3f4548',-1,-28,2,18);rect('#3f4548',-6,-23,12,2);
      break;
    case 'lantern':case 'candelabrum':
      base(10,4,stone,shade,dark);
      rect(iron,-2,-28,4,27);
      if(preset==='lantern'){rect(iron,-8,-35,16,16);rect('#b2945c',-5,-32,10,10);rect('#e4c986',-2,-30,4,7);}
      else {rect(metal,-13,-19,26,3);for(const x of [-11,0,11]){rect('#b3aa8b',x-2,-30,4,13);p('#e8bd73',x-2,-30,x,-36,x+2,-30);}}
      break;
    case 'ossuary':
      base(15,9,stone,shade,dark);
      for(const [x,y] of [[-11,-12],[-3,-18],[5,-12]] as const){
        rect('#b4ac91',x,y,7,8);rect('#4a4741',x+1,y+3,2,2);rect('#4a4741',x+4,y+3,2,2);
      }
      break;
  }
  return shapes;
}

export function renderPropTexture(preset:PropPreset,interactive:boolean):HTMLCanvasElement{
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Prop art requires Canvas2D');
  ctx.translate(32,56);
  ctx.imageSmoothingEnabled=false;
  for(const shape of propArt(preset,interactive)){
    ctx.fillStyle=shape.color;ctx.beginPath();
    shape.points.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.closePath();ctx.fill();
  }
  return canvas;
}
