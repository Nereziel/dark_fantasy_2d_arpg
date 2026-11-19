import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';

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
console.log('Aether & Ruin: static validation passed.');
