// renderHeli.js — drawing for Helicopter mode (a side view of the cave).
//
// Camera: the helicopter sits heliScreenX (22%) from the left edge. The view
// always shows at least heliViewAhead units ahead of it and the full cave
// height (heliWorldHeight), and never moves up or down. On a tall (portrait)
// screen the cave is a band across the middle; the space above and below is
// filled with more rock, so it never looks letterboxed.
//
// Distant rock layers drift slower than the cave (0.08×, 0.2× and 0.45×):
// this is "parallax", and it makes the scene look deep.
//
// v1.6 polish (all look only): a third, far rock layer; slow dust motes in
// the air; a headlight cone on dark levels (Night and Storm); a faint light
// rim on the cave edges nearest the helicopter; a soft glow around gems;
// rock layers (strata) in the walls, from a pattern that is built once;
// rain on the Storm level; a shockwave ring on a crash.
// On Visual effects: Lite the dust motes and the rain are off.

import { mixColor } from './levels.js';
import { obstacleRects } from './caveSpawner.js';
import { glowSprite, drawGlow } from './sprites.js';
import { drawRain, sceneOf } from './scenery.js';
import { luminance } from './render.js';

const TAU = Math.PI * 2;

export function createHeliRenderer() {
  return {
    scale: 1, originX: 0, originY: 0, distance: 0,
    smoke: [],     // exhaust puffs { x, y, vx, vy, life, maxLife, size }
    parts: [],     // crash bits and gem sparkles { x, y, vx, vy, life, maxLife, color, size, gravity }
    pops: [],      // floating "+25" text { x, y, life }
    smokeDebt: 0,
    shockAge: -1,  // seconds since the crash shockwave started (-1 = none)
    shockX: 0, shockY: 0,
    rotor: 0,      // main rotor angle
    tailRotor: 0,
    shadeKey: '',
    shades: {},
    gradKey: '',
    grad: null,
    rects: [],
  };
}

// The camera scale (pixels per world unit) for a screen size.
export function heliScale(w, h, cfg) {
  return Math.min(w / (cfg.heliViewAhead / (1 - cfg.heliScreenX)), h / cfg.heliWorldHeight);
}

// How far ahead of and behind the helicopter the screen shows (world units).
// Used to build the cave just beyond the right edge, never in view.
export function heliVisibleRange(w, h, cfg, out = {}) {
  const s = heliScale(w, h, cfg);
  out.ahead = (w * (1 - cfg.heliScreenX)) / s;
  out.behind = (w * cfg.heliScreenX) / s;
  return out;
}

// Advance the purely visual effects (smoke, sparkles, crash bits, rotor spin).
// holding: the player is holding; flying: the run is moving (not hovering
// before the start, not crashed).
export function updateHeliFx(hr, heli, cfg, dt, holding, flying) {
  const spin = heli.crashed ? 0 : (holding ? 34 : 24);
  hr.rotor = (hr.rotor + spin * dt) % TAU;
  hr.tailRotor = (hr.tailRotor + spin * 1.7 * dt) % TAU;
  if (!heli.crashed) {
    const rate = cfg.heliSmokePerSec * (holding ? 1 : 0.5) * (flying ? 1 : 0.6);
    hr.smokeDebt += rate * dt;
    while (hr.smokeDebt >= 1) {
      hr.smokeDebt -= 1;
      const p = exhaustPoint(heli, cfg);
      hr.smoke.push({
        x: p.x, y: p.y,
        vx: -1.2 - Math.random() * 0.8, vy: 0.3 + Math.random() * 0.4,
        life: 0.9, maxLife: 0.9, size: 0.12 + Math.random() * 0.06,
      });
    }
  }
  let w = 0;
  for (const s of hr.smoke) {
    s.life -= dt;
    if (s.life <= 0) continue;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.size += 0.5 * dt;
    hr.smoke[w++] = s;
  }
  hr.smoke.length = w;
  w = 0;
  for (const p of hr.parts) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy -= p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    hr.parts[w++] = p;
  }
  hr.parts.length = w;
  w = 0;
  for (const p of hr.pops) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.y += 1.2 * dt;
    hr.pops[w++] = p;
  }
  hr.pops.length = w;
  if (hr.shockAge >= 0) {
    hr.shockAge += dt;
    if (hr.shockAge > SHOCK_SEC) hr.shockAge = -1;
  }
}
const SHOCK_SEC = 0.5;

export function clearHeliFx(hr) {
  hr.smoke.length = 0;
  hr.parts.length = 0;
  hr.pops.length = 0;
  hr.smokeDebt = 0;
  hr.shockAge = -1;
}

const EXHAUST_PT = { x: 0, y: 0 };
// Where the exhaust comes out (behind the engine, under the rotor).
function exhaustPoint(heli, cfg) {
  const k = cfg.heliWidth / 2;
  const lx = -0.32 * k;
  const ly = 0.32 * k;
  const c = Math.cos(heli.pitch), s = Math.sin(heli.pitch);
  EXHAUST_PT.x = heli.distance + lx * c - ly * s;
  EXHAUST_PT.y = heli.y + lx * s + ly * c;
  return EXHAUST_PT;
}

// A crash: bits in the ship color and orange, plus a puff of smoke.
export function heliCrashBurst(hr, heli, shipColor) {
  // A bright ring bursts out from the crash.
  hr.shockAge = 0;
  hr.shockX = heli.distance;
  hr.shockY = heli.y;
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * TAU;
    const sp = 2 + Math.random() * 7;
    hr.parts.push({
      x: heli.distance, y: heli.y,
      vx: Math.cos(a) * sp + heli.speed * 0.25, vy: Math.sin(a) * sp + 2,
      life: 0.5 + Math.random() * 0.6, maxLife: 1.1,
      color: i % 3 === 0 ? '#ff9a3c' : i % 3 === 1 ? '#ffd166' : shipColor,
      size: 0.08 + Math.random() * 0.14, gravity: 14,
    });
  }
  for (let i = 0; i < 10; i++) {
    hr.smoke.push({
      x: heli.distance + (Math.random() - 0.5) * 0.8, y: heli.y + (Math.random() - 0.5) * 0.6,
      vx: (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random(),
      life: 1.2, maxLife: 1.2, size: 0.35 + Math.random() * 0.3,
    });
  }
}

// A gem: a few gold sparkles and a floating "+25".
export function heliGemSparkle(hr, heli, points) {
  // A bright burst: a fast outer ring and a slower inner one.
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const fast = i % 2 === 0;
    hr.parts.push({
      x: heli.distance + 0.4, y: heli.y,
      vx: Math.cos(a) * (fast ? 5.5 : 2.8) + heli.speed * 0.6, vy: Math.sin(a) * (fast ? 5.5 : 2.8),
      life: fast ? 0.5 : 0.65, maxLife: fast ? 0.5 : 0.65,
      color: i % 4 === 0 ? '#ffffff' : i % 4 === 2 ? '#fff3c4' : '#ffd166', size: fast ? 0.1 : 0.07, gravity: 0,
    });
  }
  hr.pops.push({ x: heli.distance + 0.8, y: heli.y + 0.8, life: 0.8, text: `+${points}` });
}

function updateShades(hr, p) {
  const key = p.ground + p.cube + p.sky + p.skyHorizon + (p.grid || '');
  if (key === hr.shadeKey) return;
  hr.shadeKey = key;
  const grid = p.grid || mixColor(p.ground, p.sky, 0.5);
  hr.dark = luminance(p.sky) < 0.36; // dark levels (Night, Storm) get a headlight
  hr.strata = null; // the wall pattern is rebuilt for the new colours
  hr.shades = {
    farthest: mixColor(grid, p.sky, 0.78),
    rimLight: mixColor(p.ground, '#ffffff', 0.55),
    mote: mixColor(p.skyHorizon, '#ffffff', 0.5),
    rim: mixColor(p.ground, '#000000', 0.25),
    highlight: mixColor(p.ground, '#ffffff', 0.22),
    far: mixColor(grid, p.sky, 0.55),
    near: mixColor(grid, p.sky, 0.2),
    lit: mixColor(p.cube, '#ffffff', 0.3),
    dark: mixColor(p.cube, '#000000', 0.32),
    shipDark: mixColor(p.ship, '#000000', 0.3),
    shipLight: mixColor(p.ship, '#ffffff', 0.3),
    glowCave: mixColor(p.cube, '#ffffff', 0.15),
  };
}

// view: { palette, roll (radians), shakeX, shakeY, flash (0..1), glow (0..1),
//         showShip, hitboxes }
export function drawHeliFrame(r, hr, heli, view) {
  const { ctx, config: cfg, w, h } = r;
  const p = view.palette;
  updateShades(hr, p);
  hr.cubeColor = p.cube;
  const s = heliScale(w, h, cfg);
  hr.scale = s;
  hr.distance = heli.distance;
  hr.originX = w * cfg.heliScreenX;
  hr.originY = (h + cfg.heliWorldHeight * s) / 2; // screen y of world y = 0

  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.translate(view.shakeX || 0, view.shakeY || 0);
  // Tilt level: the whole view tilts gently (half the level's roll).
  const roll = (view.roll || 0) * 0.5;
  if (roll) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(roll);
    ctx.translate(-w / 2, -h / 2);
  }
  // Margin so tilted corners never show empty space.
  const pad = roll ? Math.abs(Math.sin(roll)) * Math.max(w, h) + 20 : 20;

  const lite = !!view.lite;
  drawBackground(r, hr, p, pad);
  if (!lite) drawMotes(r, hr, heli.clock);
  if (hr.dark && view.showShip !== false && !heli.crashed) drawHeadlight(r, hr, heli);
  drawObstacles(r, hr, heli.spawner.obstacles, view.glow || 0);
  drawWalls(r, hr, p, heli.spawner.columns, pad, view.glow || 0, heli.crashed ? null : heli);
  drawGems(r, hr, heli.spawner.gems, heli.clock);
  drawSmoke(r, hr);
  if (view.showShip !== false && !heli.crashed) drawHeli(r, hr, p, heli, view);
  drawParts(r, hr);
  if (view.level && sceneOf(view.level).rain) {
    ctx.save();
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    drawRain(ctx, r.scenery, view, w, h);
    ctx.restore();
  }
  if (hr.shockAge >= 0) drawShock(r, hr);
  if (view.hitboxes) drawDebug(r, hr, heli);

  if (view.flash > 0) {
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    ctx.globalAlpha = Math.min(1, view.flash);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

const sx = (hr, x) => hr.originX + (x - hr.distance) * hr.scale;
const sy = (hr, y) => hr.originY - y * hr.scale;

function drawBackground(r, hr, p, pad) {
  const { ctx, w, h } = r;
  const key = p.sky + p.skyHorizon + w + 'x' + h;
  if (key !== hr.gradKey) {
    hr.gradKey = key;
    hr.grad = ctx.createLinearGradient(0, 0, 0, h);
    hr.grad.addColorStop(0, p.sky);
    hr.grad.addColorStop(0.5, p.skyHorizon);
    hr.grad.addColorStop(1, p.sky);
  }
  ctx.fillStyle = hr.grad;
  ctx.fillRect(-pad, -pad, w + 2 * pad, h + 2 * pad);
  // Three layers of distant rock, from the ceiling and from the floor.
  ridges(r, hr, hr.shades.farthest, 0.08, 0.11, 21.7, pad);
  ridges(r, hr, hr.shades.far, 0.2, 0.17, 0, pad);
  ridges(r, hr, hr.shades.near, 0.45, 0.25, 7.3, pad);
}

// Slow floating dust motes in the air, at two depths. Their places come from
// fixed "hash" numbers and the clock, so nothing is stored or created.
function hash01(n) {
  const v = Math.sin(n) * 43758.5453;
  return v - Math.floor(v);
}
const MOTES = 26;
function drawMotes(r, hr, clock) {
  const { ctx, w, h } = r;
  ctx.fillStyle = hr.shades.mote;
  for (let i = 0; i < MOTES; i++) {
    const depth = i % 2 ? 0.55 : 0.3;            // how fast it slides past
    const span = w + 40;
    let x = (hash01(i * 12.9898) * span - hr.distance * hr.scale * depth + clock * (4 + 6 * hash01(i * 3.3))) % span;
    if (x < 0) x += span;
    const y = h * (0.12 + 0.76 * hash01(i * 78.233)) + Math.sin(clock * (0.3 + 0.5 * hash01(i * 1.7)) + i) * h * 0.02;
    const size = depth > 0.5 ? 2.2 : 1.5;
    ctx.globalAlpha = (depth > 0.5 ? 0.3 : 0.2) * (0.6 + 0.4 * Math.sin(clock * 0.8 + i * 2.1));
    ctx.fillRect(x - 20, y, size, size);
  }
  ctx.globalAlpha = 1;
}

// A soft headlight cone ahead of the helicopter (dark levels only): two
// overlapping wedges of light, a long faint one and a short brighter one.
function drawHeadlight(r, hr, heli) {
  const { ctx } = r;
  const k = r.config.heliWidth / 2;
  const c = Math.cos(heli.pitch), s = Math.sin(heli.pitch);
  const x0 = sx(hr, heli.distance + 0.95 * k * c), y0 = sy(hr, heli.y + 0.95 * k * s - 0.05);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#fff3cf';
  for (let pass = 0; pass < 2; pass++) {
    const len = (pass === 0 ? 9 : 5) * hr.scale;
    const spread = (pass === 0 ? 2.0 : 1.0) * hr.scale;
    ctx.globalAlpha = pass === 0 ? 0.07 : 0.09;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + len * c - (-spread) * s, y0 - len * s - spread * c);
    ctx.lineTo(x0 + len * c - spread * s, y0 - len * s + spread * c);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function ridgeHeight(u) {
  return 0.55 + 0.25 * Math.sin(u * 0.23) + 0.13 * Math.sin(u * 0.61 + 1.3) + 0.07 * Math.sin(u * 1.7 + 2.1);
}

function ridges(r, hr, color, speed, depth, seed, pad) {
  const { ctx, w } = r;
  const s = hr.scale;
  const H = r.config.heliWorldHeight;
  const top = sy(hr, H);
  const bottom = sy(hr, 0);
  const band = (bottom - top) * depth;
  const shift = hr.distance * speed * s;
  const step = Math.max(6, s * 0.8);
  ctx.fillStyle = color;
  for (let dir = 1; dir >= -1; dir -= 2) {
    ctx.beginPath();
    const edge = dir > 0 ? top - pad - 400 : bottom + pad + 400;
    ctx.moveTo(-pad, edge);
    for (let x = -pad; x <= w + pad + step; x += step) {
      const u = (x + shift) / s + seed + (dir > 0 ? 0 : 40);
      const y = dir > 0 ? top + ridgeHeight(u) * band : bottom - ridgeHeight(u * 1.13) * band;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + pad + step, edge);
    ctx.closePath();
    ctx.fill();
  }
}

// The cave walls. The drawn edge never sits inside open space that would
// crash you: at each column boundary it uses the lower ceiling / higher floor.
function drawWalls(r, hr, p, cols, pad, glow, heli) {
  const { ctx } = r;
  if (!cols.length) return;
  const sh = hr.shades;
  const lw = Math.max(1.5, hr.scale * 0.09);
  for (let side = 0; side < 2; side++) {
    const ceiling = side === 0;
    const pts = edgePoints(hr, cols, ceiling);
    const edge = ceiling ? -pad - 400 : r.h + pad + 400;
    ctx.beginPath();
    ctx.moveTo(pts[0], edge);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineTo(pts[pts.length - 2], edge);
    ctx.closePath();
    ctx.fillStyle = p.ground;
    ctx.fill();
    // Subtle horizontal rock layers (strata), from a pattern built once.
    ctx.fillStyle = strataPattern(ctx, hr, p);
    ctx.fill();
    // Soft lighter highlight just inside the edge, then the darker rim.
    ctx.save();
    ctx.translate(0, ceiling ? -lw * 1.6 : lw * 1.6);
    strokeEdge(ctx, pts);
    ctx.strokeStyle = sh.highlight;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = lw * 1.4;
    ctx.stroke();
    ctx.restore();
    strokeEdge(ctx, pts);
    if (glow > 0) {
      ctx.globalAlpha = glow * 0.35;
      ctx.strokeStyle = sh.glowCave;
      ctx.lineWidth = lw * 4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = sh.rim;
    ctx.lineWidth = lw;
    ctx.stroke();
    // A faint rim of light on the cave edge nearest the helicopter.
    if (heli) {
      const hx = sx(hr, heli.distance);
      for (let band = 0; band < 2; band++) {
        const reach = (band === 0 ? 7 : 3.5) * hr.scale;
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < pts.length; i += 2) {
          if (Math.abs(pts[i] - hx) > reach) { pen = false; continue; }
          if (pen) ctx.lineTo(pts[i], pts[i + 1]); else ctx.moveTo(pts[i], pts[i + 1]);
          pen = true;
        }
        ctx.strokeStyle = sh.rimLight;
        ctx.globalAlpha = band === 0 ? 0.22 : 0.3;
        ctx.lineWidth = lw * (band === 0 ? 1.2 : 1.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}

// The wall pattern: a small tile of faint lighter and darker horizontal
// bands. Built once per palette (never per frame) and reused.
function strataPattern(ctx, hr, p) {
  if (hr.strata) return hr.strata;
  const tile = hr.strataTile || (hr.strataTile = document.createElement('canvas'));
  tile.width = 8;
  tile.height = 96;
  const g = tile.getContext('2d');
  g.clearRect(0, 0, 8, 96);
  const light = mixColor(p.ground, '#ffffff', 0.5);
  const dark = mixColor(p.ground, '#000000', 0.5);
  const bands = [[6, 5, light, 0.1], [19, 3, dark, 0.12], [31, 8, light, 0.06], [47, 4, dark, 0.1], [58, 2, light, 0.12], [70, 7, dark, 0.07], [86, 4, light, 0.08]];
  for (const [y, hgt, color, alpha] of bands) {
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(0, y, 8, hgt);
  }
  hr.strata = ctx.createPattern(tile, 'repeat');
  return hr.strata;
}

const PTS = [];
function edgePoints(hr, cols, ceiling) {
  PTS.length = 0;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const v = ceiling ? c.top : c.bottom;
    const prev = i > 0 ? (ceiling ? cols[i - 1].top : cols[i - 1].bottom) : v;
    const atEdge = ceiling ? Math.min(prev, v) : Math.max(prev, v);
    PTS.push(sx(hr, c.x0), sy(hr, atEdge));
    PTS.push(sx(hr, (c.x0 + c.x1) / 2), sy(hr, v));
  }
  const last = cols[cols.length - 1];
  PTS.push(sx(hr, last.x1), sy(hr, ceiling ? last.top : last.bottom));
  return PTS;
}

function strokeEdge(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
}

// Blocks, spikes and gates, lit from the upper left.
function drawObstacles(r, hr, obstacles, glow) {
  const { ctx } = r;
  const sh = hr.shades;
  const bevel = Math.max(2, hr.scale * 0.14);
  for (const o of obstacles) {
    const x0 = sx(hr, o.x);
    const x1 = sx(hr, o.x + o.w);
    if (x1 < -50 || x0 > r.w + 50) continue;
    if (o.kind === 'spike') {
      const tipX = (x0 + x1) / 2;
      const baseY = sy(hr, o.dir < 0 ? o.base + 0.8 : o.base - 0.8);
      const tipY = sy(hr, o.dir < 0 ? o.y0 : o.y1);
      ctx.beginPath();
      ctx.moveTo(x0, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tipX, baseY);
      ctx.closePath();
      ctx.fillStyle = sh.lit;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tipX, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(x1, baseY);
      ctx.closePath();
      ctx.fillStyle = sh.dark;
      ctx.fill();
      if (glow > 0) {
        ctx.beginPath(); ctx.moveTo(x0, baseY); ctx.lineTo(tipX, tipY); ctx.lineTo(x1, baseY);
        glowOutline(ctx, glow, sh.lit);
      }
      continue;
    }
    obstacleRects(o, hr.rects);
    for (const [rx0, rx1, ry0, ry1] of hr.rects) {
      const ax = sx(hr, rx0), bx = sx(hr, rx1);
      const ay = sy(hr, ry1), by = sy(hr, ry0); // screen top, bottom
      litBox(ctx, sh, hr.cubeColor, ax, ay, bx - ax, by - ay, bevel);
      if (glow > 0) {
        ctx.beginPath(); ctx.rect(ax, ay, bx - ax, by - ay);
        glowOutline(ctx, glow, sh.lit);
      }
    }
  }
}

function litBox(ctx, sh, color, x, y, w, h, bevel) {
  const b = Math.min(bevel, w / 3, h / 3);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = sh.lit;
  ctx.fillRect(x, y, w, b);           // top edge
  ctx.fillRect(x, y, b, h);           // left edge
  ctx.fillStyle = sh.dark;
  ctx.fillRect(x, y + h - b, w, b);   // bottom edge
  ctx.fillRect(x + w - b, y + b, b, h - b); // right edge
}

// Strokes the current path as a neon outline (build the path first).
function glowOutline(ctx, glow, color) {
  ctx.save();
  ctx.globalAlpha = glow * 0.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.globalAlpha = glow * 0.9;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

let gemGlow = null;
// Small gold diamonds that slowly spin, with a white glint and a soft glow.
function drawGems(r, hr, gems, time) {
  const { ctx } = r;
  const s = hr.scale;
  for (const g of gems) {
    if (g.taken) continue;
    const x = sx(hr, g.x);
    if (x < -40 || x > r.w + 40) continue;
    const y = sy(hr, g.y);
    const k = Math.cos(time * 2.4 + g.x);
    const hw = g.r * s * Math.max(0.15, Math.abs(k));
    const hh = g.r * s * 1.25;
    // A soft glow around the gem.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + 0.2 * Math.sin(time * 3.1 + g.x);
    drawGlow(ctx, gemGlow || (gemGlow = glowSprite('rgba(255,225,130,0.75)', 'rgba(255,190,60,0.3)', 0.4)), x, y, hh * 2.6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.fillStyle = '#ffc93c';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw * Math.sign(k || 1), y);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
    ctx.fillStyle = '#e59a12';
    ctx.fill();
    ctx.globalAlpha = 0.5 + 0.5 * Math.max(0, Math.sin(time * 3.1 + g.x));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - hw * 0.3, y - hh * 0.35, Math.max(1.5, s * 0.07), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// The crash shockwave: a ring that spreads out and fades.
function drawShock(r, hr) {
  const { ctx } = r;
  const t = hr.shockAge / SHOCK_SEC;
  const rad = (0.5 + 5.5 * (1 - (1 - t) * (1 - t))) * hr.scale;
  const x = sx(hr, hr.shockX), y = sy(hr, hr.shockY);
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.75 * (1 - t);
  ctx.lineWidth = Math.max(1.5, (1 - t) * 0.25 * hr.scale);
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.28 * (1 - t);
  ctx.lineWidth = Math.max(3, (1 - t) * 0.7 * hr.scale);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSmoke(r, hr) {
  const { ctx } = r;
  ctx.fillStyle = '#9aa0a8';
  for (const p of hr.smoke) {
    const t = p.life / p.maxLife;
    ctx.globalAlpha = 0.45 * t;
    ctx.beginPath();
    ctx.arc(sx(hr, p.x), sy(hr, p.y), p.size * hr.scale, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawParts(r, hr) {
  const { ctx } = r;
  for (const p of hr.parts) {
    ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 1.5);
    ctx.fillStyle = p.color;
    const z = p.size * hr.scale;
    ctx.fillRect(sx(hr, p.x) - z / 2, sy(hr, p.y) - z / 2, z, z);
  }
  ctx.globalAlpha = 1;
  if (hr.pops.length) {
    const px = Math.round(Math.max(16, hr.scale * 0.9));
    if (px !== hr.popPx) { hr.popPx = px; hr.popFont = `800 ${px}px system-ui, sans-serif`; }
    ctx.font = hr.popFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of hr.pops) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeText(p.text, sx(hr, p.x), sy(hr, p.y));
      ctx.fillStyle = '#ffd166';
      ctx.fillText(p.text, sx(hr, p.x), sy(hr, p.y));
    }
    ctx.globalAlpha = 1;
  }
}

// The helicopter: an original design facing right. Drawn in world units
// around the hitbox centre (y up), then scaled onto the screen.
function drawHeli(r, hr, p, heli, view) {
  const { ctx } = r;
  const cfg = r.config;
  const sh = hr.shades;
  const k = cfg.heliWidth / 2; // 1 unit of the design = half the helicopter width
  ctx.save();
  ctx.translate(sx(hr, heli.distance), sy(hr, heli.y));
  ctx.scale(hr.scale * k, -hr.scale * k); // y up from here on
  ctx.rotate(heli.pitch);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Tail boom (tapering) and fin.
  ctx.fillStyle = sh.shipDark;
  ctx.beginPath();
  ctx.moveTo(-0.25, 0.28);
  ctx.lineTo(-1.02, 0.24);
  ctx.lineTo(-1.02, 0.14);
  ctx.lineTo(-0.25, 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.9, 0.22);
  ctx.lineTo(-1.06, 0.5);
  ctx.lineTo(-1.12, 0.5);
  ctx.lineTo(-1.08, 0.16);
  ctx.closePath();
  ctx.fill();

  // Tail rotor: a faint disc with a spinning blade line.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.arc(-1.02, 0.2, 0.17, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#2b2f36';
  ctx.lineWidth = 0.045;
  const ta = hr.tailRotor;
  ctx.beginPath();
  ctx.moveTo(-1.02 - Math.cos(ta) * 0.17, 0.2 - Math.sin(ta) * 0.17);
  ctx.lineTo(-1.02 + Math.cos(ta) * 0.17, 0.2 + Math.sin(ta) * 0.17);
  ctx.stroke();

  // Skids and struts.
  ctx.strokeStyle = '#3a3f48';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(-0.32, -0.25); ctx.lineTo(-0.38, -0.4);
  ctx.moveTo(0.38, -0.22); ctx.lineTo(0.44, -0.4);
  ctx.moveTo(-0.6, -0.4); ctx.lineTo(0.66, -0.4);
  ctx.quadraticCurveTo(0.8, -0.4, 0.82, -0.32);
  ctx.stroke();

  // Body.
  ctx.fillStyle = p.ship;
  ctx.beginPath();
  ctx.moveTo(-0.38, 0.3);
  ctx.quadraticCurveTo(-0.42, -0.2, -0.1, -0.26);
  ctx.lineTo(0.5, -0.26);
  ctx.quadraticCurveTo(0.8, -0.24, 0.84, 0.0);
  ctx.lineTo(0.5, 0.36);
  ctx.lineTo(-0.1, 0.4);
  ctx.quadraticCurveTo(-0.34, 0.4, -0.38, 0.3);
  ctx.closePath();
  ctx.fill();
  // Shading: darker belly, lighter back.
  ctx.fillStyle = sh.shipDark;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(-0.36, -0.08);
  ctx.quadraticCurveTo(-0.3, -0.24, -0.1, -0.26);
  ctx.lineTo(0.5, -0.26);
  ctx.quadraticCurveTo(0.74, -0.25, 0.8, -0.1);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = sh.shipLight;
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-0.28, 0.36);
  ctx.lineTo(0.3, 0.38);
  ctx.stroke();

  // Big glass bubble cockpit at the nose.
  ctx.fillStyle = 'rgba(190, 228, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(0.22, 0.36);
  ctx.quadraticCurveTo(0.95, 0.36, 0.98, -0.06);
  ctx.quadraticCurveTo(0.7, -0.12, 0.28, -0.04);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.moveTo(0.42, 0.3);
  ctx.quadraticCurveTo(0.78, 0.28, 0.84, 0.08);
  ctx.quadraticCurveTo(0.7, 0.2, 0.42, 0.24);
  ctx.closePath();
  ctx.fill();

  // Mast and main rotor: a blade that stretches and shrinks to fake spinning,
  // over a faint motion-blur ellipse.
  ctx.fillStyle = '#3a3f48';
  ctx.fillRect(0.05, 0.38, 0.08, 0.14);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(0.09, 0.53, 1.25, 0.05, 0, 0, TAU);
  ctx.fill();
  const reach = 1.25 * Math.cos(hr.rotor);
  ctx.strokeStyle = '#2b2f36';
  ctx.lineWidth = 0.055;
  ctx.beginPath();
  ctx.moveTo(0.09 - reach, 0.53);
  ctx.lineTo(0.09 + reach, 0.53);
  ctx.stroke();
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath();
  ctx.arc(0.09, 0.53, 0.06, 0, TAU);
  ctx.fill();

  if (view.glow > 0) {
    // Night: a little red light on the tail.
    ctx.globalAlpha = view.glow * (0.6 + 0.4 * Math.sin(heli.clock * 6));
    ctx.fillStyle = '#ff4a4a';
    ctx.beginPath();
    ctx.arc(-1.08, 0.5, 0.05, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// Debug (?debug=1 → Hitboxes): the open path, its corridor and the hitbox.
function drawDebug(r, hr, heli) {
  const { ctx } = r;
  const cols = heli.spawner.columns;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 255, 120, 0.9)';
  ctx.beginPath();
  cols.forEach((c, i) => {
    if (i === 0) ctx.moveTo(sx(hr, c.x0), sy(hr, c.p0));
    ctx.lineTo(sx(hr, c.x1), sy(hr, c.p1));
  });
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0, 255, 120, 0.5)';
  for (const key of ['lo', 'hi']) {
    ctx.beginPath();
    cols.forEach((c, i) => {
      if (i === 0) ctx.moveTo(sx(hr, c.x0), sy(hr, c[key]));
      else ctx.lineTo(sx(hr, c.x0), sy(hr, c[key]));
      ctx.lineTo(sx(hr, c.x1), sy(hr, c[key]));
    });
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 0, 255, 0.9)';
  for (const o of heli.spawner.obstacles) {
    obstacleRects(o, hr.rects);
    for (const [x0, x1, y0, y1] of hr.rects) {
      ctx.strokeRect(sx(hr, x0), sy(hr, y1), (x1 - x0) * hr.scale, (y1 - y0) * hr.scale);
    }
  }
  const hb = heli.hitbox;
  ctx.strokeStyle = '#ff2d2d';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx(hr, hb.x - hb.halfW), sy(hr, hb.y + hb.halfH), hb.halfW * 2 * hr.scale, hb.halfH * 2 * hr.scale);
  ctx.restore();
}
