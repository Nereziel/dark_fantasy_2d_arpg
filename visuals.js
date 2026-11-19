/*
 * Aether & Ruin — visual enhancement layer.
 * No dependencies, no external image assets. All textures are deterministic
 * and baked once into small off-screen canvases for fast frame rendering.
 */
(function () {
  'use strict';
  if (typeof ProceduralAssetRenderer === 'undefined') return;

  const TILE = 96;
  const TAU = Math.PI * 2;
  const palettes = {
    town:  { base: '#232720', light: '#394035', dark: '#171b18', line: '#47473a', accent: '#777057' },
    wilds: { base: '#15231d', light: '#294235', dark: '#0b1813', line: '#304638', accent: '#49614a' },
    crypt: { base: '#22252b', light: '#363c42', dark: '#141a20', line: '#4a4d54', accent: '#66665d' },
    boss:  { base: '#26171e', light: '#46242d', dark: '#130e16', line: '#6d3b41', accent: '#8d5551' },
    marsh: { base: '#172820', light: '#344432', dark: '#0d1d18', line: '#3d5141', accent: '#62805d' },
    decay: { base: '#26311a', light: '#4c5a24', dark: '#17200f', line: '#5e682f', accent: '#819440' },
    waste: { base: '#171c1c', light: '#283031', dark: '#0e1316', line: '#394344', accent: '#525b59' }
  };
  function hash(x, y, z) {
    let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function region(x, y) {
    if (x < 40 || x > 3560 || y < 40 || y > 2360) return 'waste';
    if (x >= 880 && x < 1560 && y >= 1680) return 'decay';
    if (x >= 1560 && x < 2200 && y >= 800 && y < 1360) return 'boss';
    if (y >= 800 && x < 1560) return 'marsh';
    if (x >= 1400 && x < 2200 && y < 800) return 'crypt';
    if (x >= 40 && x < 520 && y < 520) return 'town';
    if (x >= 520 && x < 1400 && y < 800) return 'wilds';
    return 'waste';
  }
  function glow(ctx, x, y, radius, color) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }
  function createTile(biome, variation) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    const p = palettes[biome];
    let sequence = variation + 1;
    function rnd() {
      sequence = (Math.imul(1664525, sequence) + 1013904223) >>> 0;
      return sequence / 4294967296;
    }
    ctx.fillStyle = p.base;
    ctx.fillRect(0, 0, TILE, TILE);

    if (biome === 'town' || biome === 'crypt' || biome === 'boss' || biome === 'waste') {
      // Hand-cut flagstones. Offset courses and hairline fractures prevent
      // the empty colored rectangles of the prototype from showing through.
      for (let y = -12; y < TILE + 28; y += 25) {
        const row = Math.floor(y / 25);
        for (let x = -42 + (row % 2) * 22; x < TILE + 38; x += 44) {
          ctx.fillStyle = rnd() > 0.44 ? p.light : p.base;
          ctx.globalAlpha = 0.28 + rnd() * 0.24;
          ctx.fillRect(x + 2, y + 2, 40, 21);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = p.dark;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, 42, 23);
          ctx.fillStyle = p.line;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 3, y + 3, 30, 1);
          ctx.globalAlpha = 1;
        }
      }
      for (let i = 0; i < 7; i++) {
        const x = rnd() * TILE, y = rnd() * TILE;
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 5 + rnd() * 10, y + rnd() * 6 - 3);
        ctx.lineTo(x + 9 + rnd() * 13, y + rnd() * 14);
        ctx.stroke();
      }
    } else {
      // Patchy peat, roots, undergrowth and damp stone.
      for (let i = 0; i < 22; i++) {
        const x = rnd() * TILE, y = rnd() * TILE;
        ctx.fillStyle = rnd() < 0.55 ? p.dark : p.light;
        ctx.globalAlpha = 0.15 + rnd() * 0.3;
        ctx.beginPath();
        ctx.ellipse(x, y, 5 + rnd() * 19, 2 + rnd() * 9, rnd() * TAU, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (biome === 'marsh' || biome === 'decay') {
        for (let i = 0; i < 2; i++) {
          const x = 16 + rnd() * 60, y = 16 + rnd() * 60;
          ctx.fillStyle = biome === 'decay' ? 'rgba(127,156,38,.22)' : 'rgba(20,71,68,.42)';
          ctx.beginPath();
          ctx.ellipse(x, y, 18 + rnd() * 17, 8 + rnd() * 9, -0.2, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = biome === 'decay' ? 'rgba(158,185,72,.17)' : 'rgba(81,151,125,.17)';
          ctx.stroke();
        }
      }
      for (let i = 0; i < 12; i++) {
        const x = rnd() * TILE, y = rnd() * TILE;
        ctx.strokeStyle = i % 3 ? p.line : p.accent;
        ctx.globalAlpha = 0.18 + rnd() * 0.32;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y - 3 - rnd() * 5);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2, y - 4 - rnd() * 6);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = rnd() > 0.5 ? p.dark : p.accent;
      ctx.globalAlpha = 0.10 + rnd() * 0.16;
      ctx.fillRect(rnd() * TILE, rnd() * TILE, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    ctx.globalAlpha = 1;
    return canvas;
  }
  function addScenery(ctx, biome, x, y, seed) {
    const v = hash(x, y, seed);
    if (biome === 'wilds' && v > 0.66) {
      const px = x + 18 + hash(x, y, 4) * 60, py = y + 18 + hash(x, y, 5) * 60;
      ctx.fillStyle = '#101b17';
      ctx.beginPath(); ctx.ellipse(px, py + 10, 19, 7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3b332a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(px, py + 7); ctx.lineTo(px + 2, py - 24); ctx.stroke();
      ctx.strokeStyle = '#1b3028'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(px + 2, py - 19); ctx.lineTo(px - 11, py - 36); ctx.moveTo(px + 2, py - 17); ctx.lineTo(px + 16, py - 34); ctx.stroke();
      ctx.fillStyle = '#20392d';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.ellipse(px + (k - 1) * 11, py - 34 - (k % 2) * 5, 14, 9, -0.15, 0, TAU); ctx.fill();
      }
    } else if (biome === 'crypt' && v > 0.73) {
      const px = x + 20 + hash(x, y, 8) * 52, py = y + 30 + hash(x, y, 9) * 38;
      ctx.fillStyle = 'rgba(0,0,0,.40)'; ctx.fillRect(px - 12, py + 4, 24, 6);
      ctx.fillStyle = '#42494b'; ctx.fillRect(px - 7, py - 17, 14, 21);
      ctx.fillStyle = '#5c6462'; ctx.fillRect(px - 5, py - 19, 10, 4);
      ctx.fillStyle = '#252a30'; ctx.fillRect(px - 4, py - 9, 8, 1);
      ctx.fillRect(px - 1, py - 12, 2, 9);
    } else if ((biome === 'marsh' || biome === 'decay') && v > 0.60) {
      const px = x + 16 + hash(x, y, 12) * 66, py = y + 22 + hash(x, y, 13) * 60;
      ctx.strokeStyle = biome === 'decay' ? '#8b9650' : '#42614d';
      ctx.lineWidth = 1.5;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + k * 5, py - 11, px + k * 4, py - 20 + Math.abs(k) * 3);
        ctx.stroke();
      }
    } else if (biome === 'boss' && v > 0.81) {
      const px = x + 30, py = y + 40;
      ctx.strokeStyle = 'rgba(190,62,73,.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 16, 0, TAU); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * 15, py + Math.sin(a) * 15); ctx.stroke();
      }
    }
  }

  const P = ProceduralAssetRenderer.prototype;
  P.drawWorld = function (grid, camera) {
    const ctx = this.ctx;
    const width = ctx.canvas.clientWidth || ctx.canvas.width;
    const height = ctx.canvas.clientHeight || ctx.canvas.height;
    if (!this._artTiles) {
      this._artTiles = {};
      Object.keys(palettes).forEach(biome => {
        this._artTiles[biome] = Array.from({ length: 5 }, (_, i) => createTile(biome, i * 1337 + biome.length * 71));
      });
    }
    const left = Math.max(0, Math.floor((camera.x - width / 2 - TILE) / TILE) * TILE);
    const right = Math.min(grid.width, camera.x + width / 2 + TILE);
    const top = Math.max(0, Math.floor((camera.y - height / 2 - TILE) / TILE) * TILE);
    const bottom = Math.min(grid.height, camera.y + height / 2 + TILE);
    ctx.save();
    ctx.translate(Math.round(width / 2 - camera.x), Math.round(height / 2 - camera.y));
    ctx.fillStyle = '#0a0e11';
    ctx.fillRect(left, top, right - left, bottom - top);
    for (let y = top; y < bottom; y += TILE) {
      for (let x = left; x < right; x += TILE) {
        const biome = region(x + TILE / 2, y + TILE / 2);
        const variant = Math.floor(hash(x / TILE, y / TILE, 41) * 5);
        ctx.drawImage(this._artTiles[biome][variant], x, y);
        addScenery(ctx, biome, x, y, 21);
      }
    }

    // Worn cobblestone routes connecting the sanctuary, cemetery and marsh.
    const roads = [
      { x: 256, y: 244, w: 1548, h: 40 },
      { x: 1786, y: 244, w: 40, h: 782 },
      { x: 256, y: 244, w: 40, h: 1548 }
    ];
    for (const r of roads) {
      if (r.x > right || r.y > bottom || r.x + r.w < left || r.y + r.h < top) continue;
      ctx.fillStyle = 'rgba(39,37,34,.84)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(143,121,86,.3)'; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.save(); ctx.beginPath(); ctx.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); ctx.clip();
      for (let yy = r.y + 4; yy < r.y + r.h; yy += 16) {
        for (let xx = r.x + 4 + (Math.floor(yy / 16) % 2) * 11; xx < r.x + r.w; xx += 23) {
          const shade = hash(xx, yy, 4);
          ctx.fillStyle = shade > 0.5 ? 'rgba(132,132,114,.24)' : 'rgba(11,15,16,.3)';
          ctx.fillRect(xx, yy, 19, 12);
          ctx.strokeStyle = 'rgba(2,3,4,.32)'; ctx.strokeRect(xx, yy, 19, 12);
        }
      }
      ctx.restore();
    }

    // Sanctuary seal and weathered boundary.
    ctx.strokeStyle = 'rgba(169,137,79,.36)'; ctx.lineWidth = 4;
    ctx.strokeRect(44, 44, 472, 472);
    ctx.strokeStyle = 'rgba(214,181,113,.14)'; ctx.lineWidth = 1;
    ctx.strokeRect(53, 53, 454, 454);
    ctx.strokeStyle = 'rgba(85,175,150,.42)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(260, 340, 38, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(260, 340, 25, 0, TAU); ctx.stroke();

    // Rebuild walls over the terrain and roads so collision geometry is visible.
    for (const wall of grid.obstacles) {
      if (wall.x > right || wall.y > bottom || wall.x + wall.w < left || wall.y + wall.h < top) continue;
      ctx.fillStyle = '#121719'; ctx.fillRect(wall.x - 3, wall.y + 5, wall.w + 6, wall.h + 5);
      ctx.fillStyle = '#41474a'; ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = '#292f32'; ctx.fillRect(wall.x + 3, wall.y + 4, Math.max(1, wall.w - 6), Math.max(1, wall.h - 8));
      ctx.strokeStyle = '#62625a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(wall.x + .5, wall.y + .5, wall.w - 1, wall.h - 1);
      const vertical = wall.h > wall.w;
      if (vertical) {
        for (let i = 22; i < wall.h; i += 28) {
          ctx.fillStyle = '#141b1e'; ctx.fillRect(wall.x + 2, wall.y + i, wall.w - 4, 3);
        }
      } else {
        for (let i = 25; i < wall.w; i += 33) {
          ctx.fillStyle = '#141b1e'; ctx.fillRect(wall.x + i, wall.y + 2, 3, wall.h - 4);
        }
      }
    }
    ctx.restore();
  };

  P.drawProps = function (props, camera, hoveredTarget) {
    const ctx = this.ctx, width = ctx.canvas.clientWidth || ctx.canvas.width, height = ctx.canvas.clientHeight || ctx.canvas.height;
    ctx.save(); ctx.translate(width / 2 - camera.x, height / 2 - camera.y);
    for (const p of props) {
      if (p.isDestroyed) continue;
      const hovered = p === hoveredTarget;
      if (hovered) { ctx.strokeStyle = '#e6b76e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y + 7, 19, 9, 0, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.48)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, 15, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#493e38'; ctx.fillRect(p.x - 10, p.y - 5, 20, 15);
      ctx.fillStyle = '#716458'; ctx.fillRect(p.x - 8, p.y - 11, 16, 9);
      ctx.fillStyle = '#a58a68'; ctx.fillRect(p.x - 12, p.y - 13, 24, 4);
      ctx.fillStyle = '#292522'; ctx.fillRect(p.x + 5, p.y - 6, 3, 12);
      ctx.fillStyle = '#997c5c'; ctx.fillRect(p.x - 6, p.y - 6, 3, 8);
    }
    ctx.restore();
  };

  P.drawChests = function (chests, camera, hoveredTarget) {
    const ctx = this.ctx, width = ctx.canvas.clientWidth || ctx.canvas.width, height = ctx.canvas.clientHeight || ctx.canvas.height;
    ctx.save(); ctx.translate(width / 2 - camera.x, height / 2 - camera.y);
    for (const c of chests) {
      const active = !c.isOpened;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 11, 21, 8, 0, 0, TAU); ctx.fill();
      if (active) glow(ctx, c.x, c.y, 28, c === hoveredTarget ? 'rgba(251,193,85,.26)' : 'rgba(251,193,85,.12)');
      ctx.fillStyle = active ? '#714523' : '#303b3d'; ctx.fillRect(c.x - 17, c.y - 3, 34, 19);
      ctx.fillStyle = active ? '#9c6b31' : '#536061'; ctx.fillRect(c.x - 18, c.y - 13, 36, 13);
      ctx.fillStyle = '#332920'; ctx.fillRect(c.x - 12, c.y - 8, 24, 4);
      ctx.fillStyle = '#d1a251'; ctx.fillRect(c.x - 15, c.y - 12, 4, 26); ctx.fillRect(c.x + 11, c.y - 12, 4, 26);
      ctx.fillRect(c.x - 18, c.y - 2, 36, 3);
      ctx.fillStyle = active ? '#f6d78b' : '#7a7668'; ctx.fillRect(c.x - 3, c.y, 6, 9);
      if (c === hoveredTarget && active) {
        ctx.strokeStyle = '#f9d48a'; ctx.lineWidth = 1.5; ctx.strokeRect(c.x - 21, c.y - 17, 42, 36);
      }
    }
    ctx.restore();
  };

  P.drawShrines = function (shrines, camera, hoveredTarget) {
    const ctx = this.ctx, width = ctx.canvas.clientWidth || ctx.canvas.width, height = ctx.canvas.clientHeight || ctx.canvas.height;
    ctx.save(); ctx.translate(width / 2 - camera.x, height / 2 - camera.y);
    for (const s of shrines) {
      const active = s.isActive;
      const pulse = 2 + Math.sin(s.pulseTimer * 2) * 3;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 14, 22, 9, 0, 0, TAU); ctx.fill();
      if (active) glow(ctx, s.x, s.y - 11, 43 + pulse, 'rgba(139,95,223,.22)');
      ctx.fillStyle = '#30303a'; ctx.fillRect(s.x - 16, s.y + 4, 32, 14);
      ctx.fillStyle = '#545361'; ctx.fillRect(s.x - 13, s.y - 22, 26, 29);
      ctx.fillStyle = '#22242e'; ctx.fillRect(s.x - 9, s.y - 17, 18, 19);
      ctx.strokeStyle = active ? s.color : '#62646a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 15); ctx.lineTo(s.x + 7, s.y - 6); ctx.lineTo(s.x, s.y + 1); ctx.lineTo(s.x - 7, s.y - 6); ctx.closePath(); ctx.stroke();
      if (active) { ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y - 7, 3 + pulse * .15, 0, TAU); ctx.fill(); }
      if (s === hoveredTarget) { ctx.strokeStyle = '#f2dbac'; ctx.beginPath(); ctx.arc(s.x, s.y, 28 + pulse, 0, TAU); ctx.stroke(); }
      ctx.font = 'bold 10px Cinzel, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8d7aa';
      ctx.fillText(s.name, s.x, s.y - 36);
    }
    ctx.restore();
  };

  P.drawAtmosphere = function (camera, player) {
    if (!player) return;
    const ctx = this.ctx, w = ctx.canvas.clientWidth || ctx.canvas.width, h = ctx.canvas.clientHeight || ctx.canvas.height;
    const t = performance.now() / 1000;
    const project = (x, y) => ({ x: x - camera.x + w / 2, y: y - camera.y + h / 2 });
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const hero = project(player.x, player.y);
    glow(ctx, hero.x, hero.y - 8, 175, 'rgba(207,149,82,.14)');
    const lamps = [
      [115, 125, 'rgba(255,150,55,.29)'], [395, 125, 'rgba(255,150,55,.28)'],
      [175, 420, 'rgba(255,150,55,.23)'], [430, 420, 'rgba(255,150,55,.24)'],
      [1780, 510, 'rgba(103,157,229,.16)'], [1880, 1090, 'rgba(191,40,58,.16)'],
      [1210, 2000, 'rgba(145,185,51,.17)']
    ];
    for (const l of lamps) {
      const p = project(l[0], l[1]);
      if (p.x < -120 || p.y < -120 || p.x > w + 120 || p.y > h + 120) continue;
      glow(ctx, p.x, p.y, 105 + Math.sin(t * 3 + l[0]) * 9, l[2]);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 26; i++) {
      const a = hash(i, 4, 2) * TAU;
      const distance = 36 + hash(i, 6, 3) * 190;
      const drift = t * (6 + hash(i, 7, 5) * 10);
      const x = hero.x + Math.cos(a) * distance + Math.sin(drift * .13 + i) * 7;
      const y = hero.y + Math.sin(a) * distance - (drift % 85);
      if (x < 0 || y < 0 || x > w || y > h) continue;
      ctx.fillStyle = i % 4 ? 'rgba(255,192,112,.23)' : 'rgba(179,225,204,.23)';
      ctx.fillRect(Math.round(x), Math.round(y), i % 3 ? 1.5 : 2, i % 3 ? 1.5 : 2);
    }
    ctx.restore();
  };
})();
