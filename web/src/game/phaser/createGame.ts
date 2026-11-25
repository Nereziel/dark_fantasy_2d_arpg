import Phaser from 'phaser';
import { IsometricScene } from './IsometricScene';
import type { GameBridge } from '../bridge/GameBridge';
import { renderFilterConfig } from '../ui/displayModes';
import type { PixelFilterPreference } from '../ui/visualPreferences';

export function createGame(parent: HTMLElement, bridge: GameBridge,
  pixelFilter: PixelFilterPreference = 'sharp'): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 540,
    backgroundColor: '#0a0e15',
    ...renderFilterConfig(pixelFilter),
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%'
    },
    scene: [new IsometricScene(bridge)]
  });
}
