import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Script, runInNewContext } from 'node:vm';

const engine = readFileSync('dark_fantasy_2d_arpg_engine.html', 'utf8');
const index = readFileSync('index.html', 'utf8');
const visuals = readFileSync('visuals.js', 'utf8');
assert.ok(index.includes('dark_fantasy_2d_arpg_engine.html'), 'index must point to the game');
assert.ok(engine.includes('src="./visuals.js"'), 'visual layer must be loaded');
assert.ok(engine.includes('href="./visuals.css"'), 'stylesheet must be loaded');
assert.ok(existsSync('visuals.css'), 'visual stylesheet missing');
assert.ok(engine.includes('this.renderer.drawAtmosphere(this.camera, this.player)'), 'atmosphere hook missing');
assert.ok(engine.includes('this.ctx.setTransform(this.pixelRatio'), 'HiDPI canvas scaling missing');
assert.equal((engine.match(/r\.map\(color => Object\.keys\(pal\)/g) || []).length, 4, 'sprite palette regression');
const inline = [...engine.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(Boolean);
assert.ok(inline.length > 0, 'no inline game engine found');
inline.forEach((source, i) => new Script(source, { filename: 'inline-' + i + '.js' }));
new Script(visuals, { filename: 'visuals.js' });

// Run the game's real sprite generator against a minimal canvas stub.
// This detects invisible sprites even when the JavaScript syntax is valid.
const sandbox = {
  window: { addEventListener() {} },
  document: {
    createElement() {
      let paintedPixels = 0;
      return {
        width: 0, height: 0,
        get paintedPixels() { return paintedPixels; },
        getContext() { return { fillRect() { paintedPixels++; } }; }
      };
    }
  }
};
const PixelSpriteBank = runInNewContext(inline[0] + '\nPixelSpriteBank;', sandbox, { timeout: 5000 });
const spriteBank = new PixelSpriteBank();
assert.ok(spriteBank.cache.size >= 17, 'expected all hero, monster and NPC sprites');
for (const [name, animations] of spriteBank.cache) {
  for (const frames of Object.values(animations)) {
    for (const frame of frames) {
      assert.ok(frame.normal.paintedPixels > 15, name + ' has an invisible sprite frame');
      assert.ok(frame.flash.paintedPixels > 15, name + ' has an invisible hit-flash frame');
    }
  }
}
console.log('Aether & Ruin: syntax and all ' + spriteBank.cache.size + ' sprite families validated.');
