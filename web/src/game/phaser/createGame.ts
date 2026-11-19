import Phaser from 'phaser';
import { FrontierScene } from './FrontierScene';
import type { GameBridge } from '../bridge/GameBridge';

export function createGame(parent: HTMLElement, bridge: GameBridge): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 540,
    backgroundColor: '#0a0e15',
    antialias: false,
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%'
    },
    scene: [new FrontierScene(bridge)]
  });
}
