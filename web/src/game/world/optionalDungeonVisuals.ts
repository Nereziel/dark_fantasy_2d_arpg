// GPL-3.0-only — presentation only, no collision or encounter mutation.
import type {OptionalDungeonId} from './optionalDungeonVisit';
import type {DungeonRoomType} from './proceduralDungeon';

interface DungeonVisualStyle {
  readonly background:number;
  readonly floor:number;
  readonly wall:number;
  readonly wallEdge:number;
  readonly wallShadow:number;
  readonly wallFaces:readonly [number,number,number];
  readonly seam:number;
  readonly detail:number;
  readonly portal:number;
  readonly roomPalette:Readonly<Record<DungeonRoomType,number>>;
}
const MINE:DungeonVisualStyle={
  background:0x100d0b,floor:0x514131,wall:0x544438,wallEdge:0x8a7151,
  wallShadow:0x30271f,wallFaces:[0x413429,0x67513b,0x8a7152],
  seam:0x30251b,detail:0xb3976a,portal:0xd8af75,
  roomPalette:{entrance:0x514536,corridor:0x4b3d30,combat:0x594332,
    elite:0x634936,event:0x524a3d,treasure:0x6a5436,trap:0x604237,
    secret:0x514a37,boss:0x63442f}
};
const CAVE:DungeonVisualStyle={
  background:0x0a1010,floor:0x354844,wall:0x394743,wallEdge:0x637c69,
  wallShadow:0x202e2c,wallFaces:[0x2b3b39,0x435952,0x64796a],
  seam:0x1f2e2c,detail:0x8ca88a,portal:0x83c3a0,
  roomPalette:{entrance:0x40534b,corridor:0x354743,combat:0x3c4a45,
    elite:0x465047,event:0x3a5353,treasure:0x555b40,trap:0x49483c,
    secret:0x3c5948,boss:0x454b51}
};
export function optionalDungeonVisualStyle(id:OptionalDungeonId|undefined):DungeonVisualStyle|null{
  return id==='mine'?MINE:id==='cave'?CAVE:null;
}
