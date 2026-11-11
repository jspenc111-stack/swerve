// scenery.js — skies and horizons for Classic, 3D Flight and 3D Heli.
//
// Each level has a `scene` block in config.js that lists what its sky holds:
// a sun or moon, stars, clouds, distant ridges, haze, rain, lightning bolts.
// All of it is drawn here in code (there are no image files).
//
// How it stays cheap: the sky is painted ONCE into off-screen canvases (a
// "canvas" is a hidden drawing surface) when the level or the screen size
// changes. Every frame the renderers just stamp those pictures behind the
// world. Only things that move by themselves are drawn live: twinkling stars,
// shooting stars, rain and lightning bolts.
//
// The layers, back to front:
//   back        — sky colours, stars, sun or moon
//   cloudsFar   — the far cloud layer (drifts slowly; wraps around)
//   cloudsNear  — the near cloud layer (drifts a little faster)
//   front       — ridges (hills, mountains, mesas, dunes, islands) and haze
// The layers shift sideways by different amounts as you steer ("parallax"),
// which makes the sky look deep, and they tilt with the view.
//
// Rule: scenery must never look like something you could hit. It sits in the
// sky or right on the horizon, in soft colours taken from the level palette.
//
// The top half of this file is pure logic (no drawing), so it's tested in Node.

import { mixColor, isValidColor } from './levels.js';
import { makeRandom } from './spawner.js';

// ---- Pure logic ------------------------------------------------------------

export const SCENE_ELEMENTS = ['sun', 'moon', 'stars', 'clouds', 'ridges', 'haze', 'rain', 'bolt', 'ground', 'ambient'];
export const RIDGE_STYLES = ['hills', 'mountains', 'mesas', 'dunes', 'islands'];
export const GROUND_KINDS = ['water', 'neon', 'wet'];
export const AMBIENT_KINDS = ['dust', 'embers'];

const EMPTY = Object.freeze({});
export function sceneOf(level) {
  return (level && level.scene) || EMPTY;
}

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// Returns a list of problems with a level's scene block (empty = fine).
export function validateScene(scene, palette = {}) {
  const bad = [];
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return ['scene must be a block of settings'];
  for (const key of Object.keys(scene)) {
    if (!SCENE_ELEMENTS.includes(key)) bad.push(`unknown scene element "${key}"`);
  }
  const block = (name) => {
    const v = scene[name];
    if (v === undefined) return null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) { bad.push(`${name} must be a block of settings`); return null; }
    if (v.color !== undefined && !isValidColor(v.color)) bad.push(`${name}.color must be a #rrggbb colour`);
    return v;
  };
  for (const name of ['sun', 'moon']) {
    const v = block(name);
    if (!v) continue;
    if (!isNum(v.size, 0.01, 0.5)) bad.push(`${name}.size must be 0.01–0.5`);
    if (!isNum(v.height, -0.1, 1)) bad.push(`${name}.height must be -0.1–1`);
    if (v.x !== undefined && !isNum(v.x, -0.5, 0.5)) bad.push(`${name}.x must be -0.5–0.5`);
  }
  if (scene.sun && scene.moon) bad.push('a scene has a sun or a moon, not both');
  const stars = block('stars');
  if (stars && !isNum(stars.count, 1, 600)) bad.push('stars.count must be 1–600');
  const clouds = block('clouds');
  if (clouds) {
    if (!isNum(clouds.layers, 1, 2)) bad.push('clouds.layers must be 1 or 2');
    if (!isNum(clouds.amount, 0, 1)) bad.push('clouds.amount must be 0–1');
  }
  const ridges = block('ridges');
  if (ridges) {
    if (!RIDGE_STYLES.includes(ridges.style)) bad.push(`ridges.style must be one of ${RIDGE_STYLES.join(', ')}`);
    if (!isNum(ridges.layers, 1, 3)) bad.push('ridges.layers must be 1–3');
    if (!isNum(ridges.height, 0.005, 0.2)) bad.push('ridges.height must be 0.005–0.2 (keep them low: they sit on the horizon)');
    if (ridges.jagged !== undefined && !isNum(ridges.jagged, 0, 1)) bad.push('ridges.jagged must be 0–1');
  }
  const haze = block('haze');
  if (haze && !isNum(haze.strength, 0, 1)) bad.push('haze.strength must be 0–1');
  const rain = block('rain');
  if (rain && !isNum(rain.amount, 0, 1)) bad.push('rain.amount must be 0–1');
  if (scene.bolt !== undefined && typeof scene.bolt !== 'boolean') bad.push('bolt must be true or false');
  if (scene.ground !== undefined && !GROUND_KINDS.includes(scene.ground)) bad.push(`ground must be one of ${GROUND_KINDS.join(', ')}`);
  if (scene.ambient !== undefined && !AMBIENT_KINDS.includes(scene.ambient)) bad.push(`ambient must be one of ${AMBIENT_KINDS.join(', ')}`);
  for (const key of ['sun', 'ridge']) {
    if (palette[key] !== undefined && !isValidColor(palette[key])) bad.push(`palette.${key} must be a #rrggbb colour`);
  }
  return bad;
}

// The scene's colours, from the level palette. Optional palette entries
// (`sun`, `ridge`) and per-element `color` settings win; otherwise each
// colour is a sensible mix of the level's own colours.
export function sceneColors(palette, scene = EMPTY, out = {}) {
  const p = palette;
  const body = scene.sun || scene.moon || EMPTY;
  out.sun = body.color || p.sun || mixColor(p.skyHorizon, scene.moon ? '#eef2ff' : '#fff6d8', 0.75);
  out.halo = mixColor(out.sun, p.skyHorizon, 0.35);
  const ridge = (scene.ridges && scene.ridges.color) || p.ridge || mixColor(p.ground, p.sky, 0.5);
  // Farther ridges are lighter (closer to the horizon colour).
  out.ridgeNear = mixColor(ridge, p.skyHorizon, 0.3);
  out.ridgeFar = mixColor(ridge, p.skyHorizon, 0.68);
  const clouds = scene.clouds || EMPTY;
  out.cloud = clouds.color || (clouds.dark ? mixColor(p.sky, '#000000', 0.38) : mixColor(p.skyHorizon, '#ffffff', 0.75));
  out.cloudFar = mixColor(out.cloud, p.sky, clouds.dark ? 0.3 : 0.4);
  out.haze = (scene.haze && scene.haze.color) || p.skyHorizon;
  out.star = '#ffffff';
  return out;
}

// Which way the light comes from, for cube shadows: -1 (from the left) … 1
// (from the right). Shadows fall the other way.
export function sceneLight(scene = EMPTY) {
  const body = scene.sun || scene.moon;
  if (!body || !body.x) return -0.6;
  return Math.max(-1, Math.min(1, body.x * 4));
}

// A number from a level's name, so each level's sky is laid out the same way
// every time (repeatable, like the test seeds).
export function sceneSeed(name) {
  let h = 2166136261;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) || 1;
}

// Height of a ridge line at position u (any number), 0–1.
// style: see RIDGE_STYLES. jag: 0 smooth … 1 jagged. seed: layer seed.
export function ridgeHeight(style, u, seed = 0, jag = 0.5) {
  const a = seed * 1.7;
  let v;
  if (style === 'mountains') {
    // Sharp peaks: folded sine waves.
    const peaks = 1 - Math.abs(Math.sin(u * 1.1 + a));
    const small = 1 - Math.abs(Math.sin(u * 2.9 + a * 2.3));
    const tiny = 1 - Math.abs(Math.sin(u * 7.3 + a * 0.7));
    v = 0.25 + 0.5 * peaks * peaks + 0.2 * small + jag * 0.12 * tiny;
  } else if (style === 'mesas') {
    // Flat tops with steep sides, and gaps between them.
    const cell = Math.floor(u * 0.55 + a);
    const within = u * 0.55 + a - cell;
    const h = hash01(cell * 12.9898 + seed * 78.233);
    const gap = hash01(cell * 4.1 + seed * 9.7) < 0.3;
    const edge = Math.min(within, 1 - within);
    const side = Math.min(1, edge / 0.07);
    v = gap ? 0.08 : (0.45 + 0.55 * h) * side + 0.08 * (1 - side);
  } else if (style === 'dunes') {
    // Long smooth swells that lean one way.
    const t = u * 0.45 + a;
    v = 0.35 + 0.4 * Math.sin(t + 0.45 * Math.sin(t)) + 0.15 * Math.sin(t * 2.3 + 1);
  } else if (style === 'islands') {
    // Mostly flat sea with the odd low bump.
    const t = Math.sin(u * 0.6 + a) + 0.5 * Math.sin(u * 1.7 + a * 3);
    v = Math.max(0, t - 0.55) * 1.3;
  } else {
    // hills
    v = 0.45 + 0.3 * Math.sin(u * 0.7 + a) + 0.18 * Math.sin(u * 1.6 + a * 2.1) + jag * 0.07 * Math.sin(u * 4.3 + a);
  }
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hash01(n) {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

// A forked lightning bolt as a list of line pieces, each [x0, y0, x1, y1] in
// 0–1 units (x across the sky, y from the top down to the horizon).
// Repeatable for a seed. out: a reusable list.
export function boltShape(seed, out = []) {
  const rnd = makeRandom((seed >>> 0) || 1);
  out.length = 0;
  let x = 0.15 + rnd() * 0.7;
  let y = 0;
  const steps = 7 + Math.floor(rnd() * 3);
  for (let i = 0; i < steps; i++) {
    const nx = Math.max(0.02, Math.min(0.98, x + (rnd() - 0.5) * 0.12));
    const ny = y + (0.92 / steps) * (0.7 + rnd() * 0.6);
    out.push([x, y, nx, Math.min(1, ny)]);
    // A side fork now and then.
    if (i > 0 && i < steps - 1 && rnd() < 0.35) {
      let fx = nx, fy = ny;
      const dir = rnd() < 0.5 ? -1 : 1;
      const forks = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < forks; k++) {
        const gx = Math.max(0.02, Math.min(0.98, fx + dir * (0.03 + rnd() * 0.06)));
        const gy = Math.min(1, fy + 0.04 + rnd() * 0.06);
        out.push([fx, fy, gx, gy]);
        fx = gx; fy = gy;
      }
    }
    x = nx;
    y = Math.min(1, ny);
    if (y >= 1) break;
  }
  return out;
}

// ---- Drawing ----------------------------------------------------------------

const WIDE = 1.8;        // the sky pictures are this many screens wide (covers tilt and parallax)
const MAX_SHARP = 1.5;   // skies are soft, so they don't need the full screen sharpness
const TWINKLES = 14;
const RAIN_MAX = 70;

function makeSet() {
  return {
    key: '', level: null, W: 0, H: 0, sharp: 1,
    back: null, cloudsFar: null, cloudsNear: null, front: null,
    hasFar: false, hasNear: false, hasFront: false,
    twinkles: [], shooting: false, rain: 0, colors: {},
  };
}

export function createScenery() {
  const rain = [];
  const rnd = makeRandom(977);
  for (let i = 0; i < RAIN_MAX; i++) rain.push({ x: rnd(), y: rnd(), len: 0.035 + rnd() * 0.035, speed: 0.9 + rnd() * 0.5 });
  return { sets: [makeSet(), makeSet()], rain, bolt: [], boltSeed: 0 };
}

function canvasFor(set, name, w, h) {
  let c = set[name];
  if (!c) { c = document.createElement('canvas'); set[name] = c; }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

// Find (or paint) the pictures for a level at this screen size.
function ensureSet(sc, level, w, h, horizonY, skySpan, sharp, keep) {
  const key = `${level.name}|${w}x${h}|${Math.round(horizonY)}|${Math.round(skySpan)}|${sharp}`;
  for (const set of sc.sets) if (set.key === key) return set;
  // Reuse the set that isn't needed for the cross-fade.
  const set = sc.sets[0] === keep ? sc.sets[1] : sc.sets[0];
  paintSet(set, level, w, h, horizonY, skySpan, sharp);
  set.key = key;
  return set;
}

// Paint one level's sky pictures (runs only when the level or screen changes).
function paintSet(set, level, w, h, horizonY, skySpan, sharp) {
  const scene = sceneOf(level);
  const p = level.palette;
  const col = sceneColors(p, scene, set.colors);
  const rnd = makeRandom(sceneSeed(level.name));
  const W = Math.ceil(w * WIDE);            // picture size in screen pixels
  const H = Math.ceil(horizonY + w * 0.4);  // from well above the screen top down to the horizon
  const pw = Math.ceil(W * sharp), ph = Math.ceil(H * sharp);
  set.level = level; set.W = W; set.H = H; set.sharp = sharp;
  const unit = Math.min(w, h);

  // -- back: sky colours, stars, sun or moon
  const g = canvasFor(set, 'back', pw, ph);
  g.scale(sharp, sharp);
  const sky = g.createLinearGradient(0, H - skySpan, 0, H);
  sky.addColorStop(0, p.sky);
  sky.addColorStop(1, p.skyHorizon);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  set.twinkles.length = 0;
  set.shooting = false;
  if (scene.stars) {
    const n = Math.round(scene.stars.count * WIDE);
    const faint = scene.stars.faint ? 0.45 : 1;
    g.fillStyle = col.star;
    for (let i = 0; i < n; i++) {
      const x = rnd() * W;
      const up = rnd();
      const y = (H - 6) * (1 - Math.sqrt(up)) * 0.98; // more stars higher up
      const size = 0.5 + rnd() * rnd() * 1.5;
      const alpha = (0.35 + rnd() * 0.65) * faint * (0.35 + 0.65 * (1 - y / H));
      if (scene.stars.twinkle && set.twinkles.length < TWINKLES && x > W * 0.22 && x < W * 0.78 && size > 1) {
        set.twinkles.push({ x, y, size: size + 0.4, phase: rnd() * 6.28, rate: 1.5 + rnd() * 2.5, alpha: faint });
        continue;
      }
      g.globalAlpha = alpha;
      g.fillRect(x, y, size, size);
    }
    g.globalAlpha = 1;
    set.shooting = !!scene.stars.shooting;
  }
  const body = scene.sun || scene.moon;
  if (body) {
    const bx = W / 2 + (body.x || 0) * w;
    const by = H - body.height * skySpan;
    const rad = body.size * unit;
    // Soft halo.
    const haloR = rad * (scene.moon ? 3 : 4.2) * (body.halo ?? 1);
    if (haloR > rad) {
      const halo = g.createRadialGradient(bx, by, rad * 0.6, bx, by, haloR);
      halo.addColorStop(0, withAlpha(col.halo, body.hazy ? 0.6 : 0.5));
      halo.addColorStop(1, withAlpha(col.halo, 0));
      g.fillStyle = halo;
      g.fillRect(bx - haloR, by - haloR, haloR * 2, haloR * 2);
    }
    g.save();
    g.beginPath();
    g.arc(bx, by, rad, 0, Math.PI * 2);
    g.clip();
    const disc = g.createLinearGradient(0, by - rad, 0, by + rad);
    disc.addColorStop(0, mixColor(col.sun, '#ffffff', 0.35));
    // A banded sun deepens toward the sky colour at the bottom, so its stripes show.
    disc.addColorStop(1, body.bands ? mixColor(col.sun, p.sky, 0.6) : col.sun);
    g.fillStyle = disc;
    g.globalAlpha = body.hazy ? 0.8 : 1;
    g.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
    g.globalAlpha = 1;
    if (body.bands) {
      // Stripes of sky across the lower half, getting thicker toward the bottom.
      g.fillStyle = sky;
      for (let i = 0; i < 6; i++) {
        const t = i / 6;
        const y = by + rad * (-0.3 + t * 1.3);
        g.fillRect(bx - rad, y, rad * 2, rad * (0.03 + t * 0.085));
      }
    }
    if (body.crescent) {
      // Cover most of the disc with sky, leaving a crescent.
      g.fillStyle = sky;
      g.beginPath();
      g.arc(bx + rad * 0.45, by - rad * 0.12, rad * 0.95, 0, Math.PI * 2);
      g.fill();
    } else if (scene.moon) {
      // A few faint grey patches.
      g.fillStyle = withAlpha(mixColor(col.sun, p.sky, 0.5), 0.35);
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(bx + (rnd() - 0.5) * rad * 1.3, by + (rnd() - 0.5) * rad * 1.3, rad * (0.12 + rnd() * 0.16), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  // -- clouds: one or two layers that wrap around sideways
  const clouds = scene.clouds;
  set.hasFar = false;
  set.hasNear = false;
  if (clouds && clouds.amount > 0) {
    const two = clouds.layers >= 2;
    if (two) {
      paintClouds(canvasFor(set, 'cloudsFar', Math.ceil(pw / 2), Math.ceil(ph / 2)), W, H, sharp / 2, unit, skySpan, clouds, col.cloudFar, rnd, 0);
      set.hasFar = true;
    }
    paintClouds(canvasFor(set, 'cloudsNear', Math.ceil(pw / 2), Math.ceil(ph / 2)), W, H, sharp / 2, unit, skySpan, clouds, col.cloud, rnd, 1);
    set.hasNear = true;
  }

  // -- front: ridges and haze
  set.hasFront = !!(scene.ridges || scene.haze);
  if (set.hasFront) {
    const f = canvasFor(set, 'front', pw, ph);
    f.scale(sharp, sharp);
    const ridges = scene.ridges;
    if (ridges) {
      const n = ridges.layers;
      const seed = sceneSeed(level.name) % 97;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 1 : i / (n - 1);          // 0 = farthest
        const tall = ridges.height * unit * (1.25 - 0.45 * t);
        const stretch = (9 + 5 * t) / w;               // nearer layers have broader shapes
        f.fillStyle = mixColor(col.ridgeFar, col.ridgeNear, t);
        f.beginPath();
        f.moveTo(0, H + 1);
        for (let x = 0; x <= W + 3; x += 3) {
          f.lineTo(x, H - tall * ridgeHeight(ridges.style, x * stretch * (1 + i * 0.37), seed + i * 13, ridges.jagged ?? 0.5));
        }
        f.lineTo(W, H + 1);
        f.closePath();
        f.fill();
      }
    }
    if (scene.haze && scene.haze.strength > 0) {
      const band = unit * 0.16;
      const haze = f.createLinearGradient(0, H - band, 0, H);
      haze.addColorStop(0, withAlpha(col.haze, 0));
      haze.addColorStop(1, withAlpha(col.haze, 0.85 * scene.haze.strength));
      f.fillStyle = haze;
      f.fillRect(0, H - band, W, band);
    }
  }
  set.rain = scene.rain ? scene.rain.amount : 0;
}

// Soft, flat clouds: each is a row of overlapping ovals on a flat base.
function paintClouds(g, W, H, scale, unit, skySpan, clouds, color, rnd, layer) {
  g.scale(scale, scale);
  const count = Math.round((clouds.dark ? 16 : 9) * clouds.amount * WIDE * (layer ? 1 : 1.3));
  const top = H - skySpan * (clouds.dark ? 1.05 : 0.95);
  const bottom = H - skySpan * (clouds.dark ? 0.1 : clouds.thin ? 0.12 : 0.22);
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const cx = rnd() * W;
    const cy = top + (bottom - top) * rnd();
    const near = (cy - top) / (bottom - top);        // lower in the sky = further away = smaller
    const size = unit * (clouds.dark ? 0.2 : clouds.puffy ? 0.11 : 0.09) * (1.25 - 0.7 * near) * (layer ? 1 : 0.7) * (0.7 + rnd() * 0.6);
    const flat = clouds.thin ? 0.16 : clouds.puffy ? 0.5 : 0.36;
    const puffs = clouds.thin ? 3 : 4 + Math.floor(rnd() * 3);
    g.globalAlpha = clouds.dark ? 0.5 + rnd() * 0.3 : clouds.thin ? 0.45 : 0.55 + rnd() * 0.3;
    // Draw it three times so it wraps around the picture's sides.
    for (let wrap = -1; wrap <= 1; wrap++) {
      const x0 = cx + wrap * W;
      if (x0 + size * 4 < 0 || x0 - size * 4 > W) continue;
      g.beginPath();
      for (let k = 0; k < puffs; k++) {
        const t = puffs === 1 ? 0 : k / (puffs - 1) - 0.5;
        const pr = size * (0.6 + 0.4 * Math.cos(t * 3)) * (0.85 + 0.3 * hash01(i * 7.1 + k * 3.3));
        const px = x0 + t * size * (clouds.thin ? 4.5 : 2.6);
        g.moveTo(px + pr, cy - pr * flat * 0.5);
        g.ellipse(px, cy - pr * flat * 0.5, pr, pr * flat, 0, 0, Math.PI * 2);
      }
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Draw the sky for this frame. Call inside the tilted world transform, after
// the plain sky fill and before the ground.
//   geom: { w, h, horizonY, skySpan, dpr } — skySpan is how far above the
//         horizon the sky gradient reaches (screen pixels)
//   view: { level, prevLevel, fade (0–1), time (seconds), steer (-1 … 1, eased),
//           lite, boltAt (seconds, or -1), boltSeed }
export function drawSky(ctx, sc, view, geom) {
  const level = view.level;
  if (!level) return;
  const { w, h, horizonY, skySpan } = geom;
  const sharp = Math.min(geom.dpr || 1, MAX_SHARP);
  const fading = view.fade < 1 && view.prevLevel && view.prevLevel !== level;
  let prev = null;
  if (fading) prev = ensureSet(sc, view.prevLevel, w, h, horizonY, skySpan, sharp, null);
  const set = ensureSet(sc, level, w, h, horizonY, skySpan, sharp, prev);
  const steer = view.steer || 0;
  const time = view.time || 0;
  if (prev) {
    stampSet(ctx, prev, 1, steer, time, w, horizonY);
    stampSet(ctx, set, view.fade, steer, time, w, horizonY);
  } else {
    stampSet(ctx, set, 1, steer, time, w, horizonY);
  }
  // Live parts (the new level's, once it has mostly faded in).
  const live = prev ? view.fade : 1;
  if (live > 0.5) {
    if (set.twinkles.length) drawTwinkles(ctx, set, time, steer, w, horizonY);
    if (set.shooting && !view.lite) drawShootingStar(ctx, time, w, horizonY, skySpan);
  }
  if (view.boltAt >= 0 && sceneOf(level).bolt) drawBolt(ctx, sc, view, w, horizonY, skySpan);
}

function stampSet(ctx, set, alpha, steer, time, w, horizonY) {
  const x0 = (w - set.W) / 2;
  const y0 = horizonY - set.H;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(set.back, x0 - steer * w * 0.012, y0, set.W, set.H);
  if (set.hasFar) stampWrapped(ctx, set.cloudsFar, set, x0, y0, time * 2.2 - steer * w * 0.02);
  if (set.hasNear) stampWrapped(ctx, set.cloudsNear, set, x0, y0, time * 4.5 - steer * w * 0.03);
  if (set.hasFront) ctx.drawImage(set.front, x0 - steer * w * 0.045, y0, set.W, set.H);
  ctx.globalAlpha = prevAlpha;
}

// A layer that scrolls sideways forever: stamp it twice, side by side.
function stampWrapped(ctx, img, set, x0, y0, shift) {
  let s = shift % set.W;
  if (s < 0) s += set.W;
  ctx.drawImage(img, x0 + s - set.W, y0, set.W, set.H);
  ctx.drawImage(img, x0 + s, y0, set.W, set.H);
}

function drawTwinkles(ctx, set, time, steer, w, horizonY) {
  const x0 = (w - set.W) / 2 - steer * w * 0.012;
  const y0 = horizonY - set.H;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < set.twinkles.length; i++) {
    const t = set.twinkles[i];
    ctx.globalAlpha = t.alpha * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * t.rate + t.phase)));
    ctx.fillRect(x0 + t.x, y0 + t.y, t.size, t.size);
  }
  ctx.globalAlpha = 1;
}

// A rare shooting star: one short streak every so often, worked out from the
// clock (no state to keep).
const SHOOT_EVERY = 11;
function drawShootingStar(ctx, time, w, horizonY, skySpan) {
  const cycle = Math.floor(time / SHOOT_EVERY);
  const t = (time - cycle * SHOOT_EVERY) / 0.7;
  if (t >= 1 || hash01(cycle * 3.7 + 1.1) < 0.35) return;
  const x = w * (0.15 + 0.7 * hash01(cycle * 9.1));
  const y = horizonY - skySpan * (0.55 + 0.35 * hash01(cycle * 5.3));
  const dir = hash01(cycle * 2.3) < 0.5 ? -1 : 1;
  const len = w * 0.16;
  const hx = x + dir * len * t * 1.6, hy = y + len * t * 0.55;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.8 * (1 - t);
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - dir * len * 0.5, hy - len * 0.17);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// A forked bolt in the sky when the Storm lightning fires; fades in about 200 ms.
function drawBolt(ctx, sc, view, w, horizonY, skySpan) {
  const age = (view.time || 0) - view.boltAt;
  if (age < 0 || age > 0.2) return;
  if (sc.boltSeed !== view.boltSeed) {
    sc.boltSeed = view.boltSeed;
    boltShape(view.boltSeed, sc.bolt);
  }
  const top = horizonY - skySpan * 0.95;
  const span = skySpan * 0.95;
  const fade = 1 - age / 0.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? '#bcd0ff' : '#ffffff';
    ctx.lineWidth = pass === 0 ? 5 : 1.8;
    ctx.globalAlpha = fade * (pass === 0 ? 0.35 : 0.95);
    ctx.beginPath();
    for (let i = 0; i < sc.bolt.length; i++) {
      const s = sc.bolt[i];
      ctx.moveTo(s[0] * w, top + s[1] * span);
      ctx.lineTo(s[2] * w, top + s[3] * span);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

// Rain: slanted streaks across the whole view (animated, so drawn live).
// Draw it after the world and before the ship. Off on Lite.
export function drawRain(ctx, sc, view, w, h) {
  const level = view.level;
  const amount = sceneOf(level).rain ? sceneOf(level).rain.amount : 0;
  if (!(amount > 0) || view.lite) return;
  const fade = view.fade < 1 && view.prevLevel !== level ? view.fade : 1;
  const n = Math.round(RAIN_MAX * amount);
  const time = view.time || 0;
  const slant = 0.22;
  ctx.strokeStyle = '#dfe9ee';
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.28 * fade;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const d = sc.rain[i];
    let y = (d.y + time * d.speed) % 1;
    const x = ((d.x - y * slant) % 1 + 1) % 1;
    y *= h * 1.1;
    const px = x * w * 1.2 - w * 0.1;
    ctx.moveTo(px, y - h * 0.05);
    ctx.lineTo(px - d.len * h * slant, y - h * 0.05 + d.len * h);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// A small picture of a level's sky for the level picker: sky colours, the
// sun or moon, a few stars and the ridges. canvas: a small <canvas>.
export function paintThumb(canvas, level) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const p = level.palette;
  const scene = sceneOf(level);
  const col = sceneColors(p, scene, {});
  const hY = Math.round(H * 0.62);
  const sky = g.createLinearGradient(0, 0, 0, hY);
  sky.addColorStop(0, p.sky);
  sky.addColorStop(1, p.skyHorizon);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, hY);
  const rnd = makeRandom(sceneSeed(level.name));
  if (scene.stars) {
    g.fillStyle = '#ffffff';
    const n = Math.min(40, Math.round(scene.stars.count / 6));
    for (let i = 0; i < n; i++) {
      g.globalAlpha = (scene.stars.faint ? 0.4 : 0.9) * (0.4 + rnd() * 0.6);
      g.fillRect(rnd() * W, rnd() * hY * 0.85, 1.5, 1.5);
    }
    g.globalAlpha = 1;
  }
  const body = scene.sun || scene.moon;
  if (body) {
    const bx = W / 2 + (body.x || 0) * W * 1.2;
    const by = hY - Math.min(0.8, body.height * 1.6 + 0.12) * hY;
    const rad = Math.max(4, Math.min(H * 0.24, body.size * W * 1.9));
    g.save();
    g.beginPath();
    g.rect(0, 0, W, hY);
    g.clip();
    g.fillStyle = withAlpha(col.halo, 0.35);
    g.beginPath(); g.arc(bx, by, rad * 1.7, 0, Math.PI * 2); g.fill();
    g.fillStyle = col.sun;
    g.beginPath(); g.arc(bx, by, rad, 0, Math.PI * 2); g.fill();
    if (body.crescent) {
      g.fillStyle = sky;
      g.beginPath(); g.arc(bx + rad * 0.45, by - rad * 0.12, rad * 0.95, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  if (scene.clouds && !scene.stars) {
    g.fillStyle = col.cloud;
    g.globalAlpha = scene.clouds.dark ? 0.75 : 0.8;
    const n = scene.clouds.dark ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const cx = W * (0.15 + 0.7 * rnd()), cy = hY * (0.18 + 0.4 * rnd()), s = H * (scene.clouds.dark ? 0.2 : 0.11);
      g.beginPath();
      g.ellipse(cx, cy, s * 2, s * 0.6, 0, 0, Math.PI * 2);
      g.moveTo(cx + s * 2.2, cy - s * 0.3);
      g.ellipse(cx + s, cy - s * 0.3, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  if (scene.ridges) {
    const seed = sceneSeed(level.name) % 97;
    g.fillStyle = col.ridgeNear;
    g.beginPath();
    g.moveTo(0, hY);
    const tall = Math.max(4, scene.ridges.height * H * 3.2);
    for (let x = 0; x <= W; x += 2) g.lineTo(x, hY - tall * ridgeHeight(scene.ridges.style, x * 0.12, seed + 13, scene.ridges.jagged ?? 0.5));
    g.lineTo(W, hY);
    g.closePath();
    g.fill();
  }
  g.fillStyle = p.ground;
  g.fillRect(0, hY, W, H - hY);
  // One cube, so the picture also shows the level's obstacle colour.
  const s = Math.round(H * 0.3);
  g.fillStyle = mixColor(p.cube, '#ffffff', 0.28);
  g.fillRect(W - s - 6, H - s - 5 - 3, s, 3);
  g.fillStyle = p.cube;
  g.fillRect(W - s - 6, H - s - 5, s, s);
}
