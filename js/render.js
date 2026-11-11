// render.js — all drawing to the canvas.
//
// Fake 3D with perspective projection: a point (x, y, z) relative to the
// camera lands on screen at
//   screenX = centerX + x * f / z
//   screenY = horizonY + (cameraHeight - y) * f / z
// so far-away things are smaller and closer to the horizon.

import { mixColor } from './levels.js';
import { glowSprite, drawGlow, drawGlowOval } from './sprites.js';
import { createScenery, drawSky, drawRain, sceneOf, sceneLight, fillSkySurround } from './scenery.js';
import {
  drawSpeedStreaks, drawWaterGlints, drawWake, drawRainSplashes, drawNeonGrid, drawGroundShadow,
} from './groundFx.js';
import {
  drawParticles, drawTrailRibbon, drawTrailLine, drawShockwave, drawSpeedLines, drawLevelRing,
} from './fx.js';

const FOG_STEPS = 24;
const SMALL_CUBE_PX = 4; // cubes narrower than this on screen are drawn as one rectangle
const DEG = Math.PI / 180;

export function createRenderer(canvas, config) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const r = {
    canvas, ctx, config,
    w: 1, h: 1, dpr: 1, f: 1, cx: 0, horizonY: 0,
    visible: [],
    paletteKey: '',
    shadeSets: [0, 1, 2].map(() => ({ front: [], frontHi: [], frontLo: [], top: [], side: [], edge: [], rim: [] })),
    shades: null,
    scenery: createScenery(),
    gradKey: '',
    skyGrad: null,
    groundGrad: null,
    shipKey: '',
    shipShades: [],
    scaleCap: Infinity, // auto quality's sharpness cap (see quality.js)
  };
  resizeRenderer(r);
  return r;
}

// Call on window resize, or when auto quality changes the sharpness step
// (never every frame).
export function resizeRenderer(r) {
  const cfg = r.config;
  r.dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDevicePixelRatio, r.scaleCap || Infinity);
  r.w = window.innerWidth;
  r.h = window.innerHeight;
  r.canvas.width = Math.round(r.w * r.dpr);
  r.canvas.height = Math.round(r.h * r.dpr);
  r.cx = r.w / 2;
  r.horizonY = r.h * cfg.horizonRatio;
  // Focal length from screen width, so the view is similar on any phone.
  r.f = Math.min(r.w, r.h * 0.75) * cfg.focalScale;
  r.gradKey = '';
}

// Precompute cube face colors for each fog step (only when the palette changes).
// There are three sets, a touch darker, normal and a touch lighter (±6%), so a
// field of cubes doesn't look copy-pasted; each cube picks one from its position.
const VARIANTS = [-0.06, 0, 0.06];
function updateShades(r, p) {
  const key = p.cube + p.skyHorizon + p.ground;
  if (key === r.paletteKey) return;
  r.paletteKey = key;
  for (let v = 0; v < VARIANTS.length; v++) {
    const d = VARIANTS[v];
    const base = d < 0 ? mixColor(p.cube, '#000000', -d) : mixColor(p.cube, '#ffffff', d);
    const top = mixColor(base, '#ffffff', 0.28);
    const side = mixColor(base, '#000000', 0.3);
    const edge = mixColor(base, '#ffffff', 0.65);
    // The front face's gentle gradient is three flat bands (lighter at the
    // top, darker at the bottom), in colours worked out here once.
    const hi = mixColor(base, '#ffffff', 0.1);
    const lo = mixColor(base, '#000000', 0.09);
    const set = r.shadeSets[v];
    for (let i = 0; i < FOG_STEPS; i++) {
      const t = i / (FOG_STEPS - 1);
      set.front[i] = mixColor(base, p.skyHorizon, t);
      set.frontHi[i] = mixColor(hi, p.skyHorizon, t);
      set.frontLo[i] = mixColor(lo, p.skyHorizon, t);
      set.top[i] = mixColor(top, p.skyHorizon, t);
      set.side[i] = mixColor(side, p.skyHorizon, t);
      set.edge[i] = mixColor(edge, p.skyHorizon, t);
      set.rim[i] = mixColor(mixColor(hi, edge, 0.7), p.skyHorizon, t); // the top-edge highlight
    }
  }
  r.shades = r.shadeSets[1];
  // Ground extras, in colours that suit this ground (lighter on dark ground,
  // darker on light ground).
  const dark = luminance(p.ground) < 0.45;
  r.streakColor = dark ? mixColor(p.ground, '#ffffff', 0.45) : mixColor(p.ground, '#000000', 0.22);
  r.neonGlow = mixColor(p.cube, '#ffffff', 0.35);
  r.cubeGlowSprite = glowSprite(mixColor(p.cube, '#ffffff', 0.2), p.cube, 0.5);
}

export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// Which of the three brightness sets a cube uses: fixed by where it stands.
export function cubeVariant(x, z) {
  const n = Math.floor(x * 7.3) * 31 + Math.floor(z * 3.1);
  return ((n % 3) + 3) % 3;
}

// view: { palette, bank (radians), roll (radians), shakeX, shakeY,
//         flash (0..1), glow (0..1), lean (ship roll, radians),
//         yaw (ship heading, radians), showShip, hitboxes,
//         and for the scenery: level, prevLevel, fade (0..1), time (seconds),
//         steer (-1 … 1, eased), lite (true = Visual effects: Lite),
//         boltAt, boltSeed,
//         and for the effects: particles, trail (from particles.js),
//         zoom (1 = normal; below 1 widens the view while boosting),
//         shockAt / shockX / shockZ (the crash ring), ringAt (the
//         level-change ring), hideCube (the cube that was hit) }
export function drawFrame(r, game, view) {
  const { ctx, config: cfg, w, h } = r;
  const p = view.palette;
  updateShades(r, p);
  const scene = sceneOf(view.level);
  const lite = !!view.lite;
  const time = view.time || 0;

  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.translate(view.shakeX || 0, view.shakeY || 0);

  // Tilt the whole world around a point near the ship (bank + roll).
  const angle = (view.bank || 0) + (view.roll || 0);
  const pivotY = h * 0.62;
  // The boost zoom: the whole picture (world and ship alike) shrinks a touch
  // toward this point, so more of the field shows. Look only.
  const zoom = view.zoom || 1;
  ctx.translate(r.cx, pivotY);
  ctx.rotate(angle);
  if (zoom !== 1) ctx.scale(zoom, zoom);
  ctx.translate(-r.cx, -pivotY);

  const camX = game.x;
  const camZ = game.distance - cfg.cameraBack;
  const g = GEO;
  g.ctx = ctx; g.cx = r.cx; g.hY = r.horizonY; g.f = r.f;
  g.camX = camX; g.camZ = camZ; g.camH = cfg.cameraHeight; g.w = w; g.h = h; g.far = cfg.fogDistance;

  drawSkyAndGround(r, p, view, scene);
  if (scene.ground === 'neon') drawNeonGrid(g, p.grid || r.neonGlow, r.neonGlow, time, view.glow ?? 1);
  else if (p.grid) drawGrid(r, p, camX, camZ);
  if (!lite) {
    drawSpeedStreaks(g, game.speed || 0, game.boost || 0, r.streakColor);
    if (scene.ground === 'water') drawWaterGlints(g, time);
    if (scene.ground === 'wet') drawRainSplashes(g, time);
  }
  if (scene.ground === 'water' && view.showShip !== false) drawWake(g, 0, cfg.cameraBack, game.leanLook || 0, time);
  if (view.ringAt >= 0) drawLevelRing(ctx, r.cx, r.horizonY, w, time - view.ringAt);
  const ps = view.particles;
  if (ps) drawParticles(g, ps, true); // dust and embers go behind the cubes
  drawCubes(r, game.spawner.cubes, camX, camZ, view.glow || 0, scene, lite, g, view.hideCube);
  if (view.shockAt >= 0) drawShockwave(g, view.shockX, view.shockZ, time - view.shockAt);
  if (view.hitboxes) drawHitboxes(r, game, camX, camZ);

  // Ship and HUD effects are not tilted by the bank.
  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.translate(view.shakeX || 0, view.shakeY || 0);
  if (view.level) drawRain(ctx, r.scenery, view, w, h);
  if (!lite) drawSpeedLines(ctx, w, h, r.cx, r.horizonY, game.boost || 0, time);
  if (zoom !== 1) {
    ctx.translate(r.cx, pivotY);
    ctx.scale(zoom, zoom);
    ctx.translate(-r.cx, -pivotY);
  }
  if (view.showShip !== false) drawShip(r, p, view, game, g);
  if (ps) drawParticles(g, ps, false); // sparks, shards and cube bits on top

  if (view.flash > 0) {
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    ctx.globalAlpha = Math.min(1, view.flash);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

const GEO = { ctx: null, cx: 0, hY: 0, f: 1, camX: 0, camZ: 0, camH: 1, w: 1, h: 1, far: 1 };
const SKY = { w: 1, h: 1, horizonY: 0, skySpan: 1, dpr: 1 };

function drawSkyAndGround(r, p, view, scene) {
  const { ctx, w, h, horizonY } = r;
  // Gradients are rebuilt only when the colors or screen size change.
  const hazy = scene.haze ? scene.haze.strength : 0;
  const key = p.sky + p.skyHorizon + p.ground + w + 'x' + h + hazy;
  if (key !== r.gradKey) {
    r.gradKey = key;
    r.skyGrad = ctx.createLinearGradient(0, horizonY - h * 0.6, 0, horizonY);
    r.skyGrad.addColorStop(0, p.sky);
    r.skyGrad.addColorStop(1, p.skyHorizon);
    // Horizon glow: the ground blends into the haze colour at the horizon.
    r.groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    r.groundGrad.addColorStop(0, mixColor(p.ground, p.skyHorizon, 0.55 + 0.3 * hazy));
    r.groundGrad.addColorStop(0.35 + 0.1 * hazy, p.ground);
    r.groundGrad.addColorStop(1, p.ground);
  }
  // Oversized so the corners stay covered when the view is tilted.
  const left = -w;
  const width = w * 3;
  // Behind the sky picture: plain sky colour (it only shows in the far
  // corners when the view tilts). Without a level, the old plain gradient.
  if (view.level) fillSkySurround(ctx, p.sky, w, h, horizonY);
  else {
    ctx.fillStyle = r.skyGrad;
    ctx.fillRect(left, horizonY - h * 2, width, h * 2 + 1);
  }
  // The level's sky scene (painted once, stamped here every frame).
  if (view.level) {
    SKY.w = w; SKY.h = h; SKY.horizonY = horizonY; SKY.skySpan = h * 0.6; SKY.dpr = r.dpr;
    drawSky(ctx, r.scenery, view, SKY);
  }
  ctx.fillStyle = r.groundGrad;
  ctx.fillRect(left, horizonY, width, h * 2);
}

// Faint grid lines that scroll toward the player to show speed.
function drawGrid(r, p, camX, camZ) {
  const { ctx, f, cx, horizonY, w } = r;
  const cfg = r.config;
  const camH = cfg.cameraHeight;
  const far = cfg.fogDistance;
  ctx.strokeStyle = p.grid;
  ctx.lineWidth = 1;
  // Lines across the field.
  const spacing = 8;
  let z = Math.ceil((camZ + 1) / spacing) * spacing;
  for (; z - camZ < far; z += spacing) {
    const rz = z - camZ;
    const y = horizonY + (camH * f) / rz;
    ctx.globalAlpha = Math.max(0, 1 - rz / far);
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w * 2, y);
    ctx.stroke();
  }
  // Lines running into the distance.
  const xs = 4;
  const near = 1;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (let x = Math.floor((camX - 40) / xs) * xs; x <= camX + 40; x += xs) {
    const rx = x - camX;
    ctx.moveTo(cx + (rx * f) / near, horizonY + (camH * f) / near);
    ctx.lineTo(cx + (rx * f) / far, horizonY + (camH * f) / far);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const SHADOW_MAX = 40;    // at most this many shadows a frame (the nearest cubes)
const SHADOW_MIN_PX = 14; // cubes narrower than this on screen get no shadow, shading bands or reflection

function drawCubes(r, cubes, camX, camZ, glow, scene, lite, g, hidden) {
  const { ctx, f, cx, horizonY, w, visible } = r;
  const cfg = r.config;
  const camH = cfg.cameraHeight;
  const fogStart = cfg.fogStart;
  const fogRange = Math.max(1, cfg.fogDistance - fogStart);
  // Shadows fall away from the level's sun or moon.
  const shadowShift = -sceneLight(scene) * 0.45;
  const reflect = !lite && (scene.ground === 'water' || scene.ground === 'wet');
  const reflectAlpha = scene.ground === 'water' ? 0.2 : 0.13;

  // Collect cubes in view, then sort far → near (painter's algorithm).
  // Cubes at or beyond the fog distance are fully faded, so they're skipped.
  visible.length = 0;
  for (let i = 0; i < cubes.length; i++) {
    const c = cubes[i];
    if (c === hidden) continue; // the cube that was hit has burst into bits
    const near = c.z - camZ - c.size / 2;
    if (near < 0.5 || near >= cfg.fogDistance) continue;
    const rx = c.x - camX;
    const sxNear = (Math.abs(rx) - c.size / 2) * f / near;
    if (sxNear > w * 1.2) continue; // off to the side
    visible.push(c);
  }
  visible.sort(byFarFirst);

  for (let i = 0; i < visible.length; i++) {
    const c = visible[i];
    const s = c.size;
    const half = s / 2;
    const zn = c.z - camZ - half;
    const zf = zn + s;
    const xl = c.x - camX - half;
    const xr = xl + s;
    const kn = f / zn;
    const kf = f / zf;
    const x1 = cx + xl * kn;
    const x2 = cx + xr * kn;
    const yBot = horizonY + camH * kn;
    const yTop = horizonY + (camH - s) * kn;
    const bx1 = cx + xl * kf;
    const bx2 = cx + xr * kf;
    const byTop = horizonY + (camH - s) * kf;
    const byBot = horizonY + camH * kf;

    let fog = (zn - fogStart) / fogRange;
    fog = fog < 0 ? 0 : fog > 1 ? 1 : fog;
    const fi = Math.round(fog * (FOG_STEPS - 1));
    const shades = r.shadeSets[cubeVariant(c.x, c.z)];

    // Tiny, far-away cubes: one flat rectangle is enough (saves time with
    // the full field of cubes).
    if (x2 - x1 < SMALL_CUBE_PX) {
      ctx.fillStyle = shades.front[fi];
      ctx.fillRect(x1, byTop < yTop ? byTop : yTop, x2 - x1, yBot - (byTop < yTop ? byTop : yTop));
      continue;
    }
    const big = x2 - x1 >= SHADOW_MIN_PX;
    const clear = 1 - fog;

    // Ground contact: a soft shadow under the cube, leaning away from the
    // light. On glow levels (Night) it's a soft pool of light instead.
    // Only the nearest cubes get one (far ones are too small to notice).
    if (big && i >= visible.length - SHADOW_MAX) {
      if (glow > 0.5) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.38 * glow * clear;
        const k = f / (zn + half);
        drawGlowOval(ctx, r.cubeGlowSprite, cx + (c.x - camX) * k, horizonY + camH * k, s * 1.15 * k, Math.max(2, camH * (kn - kf) * 1.1));
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      } else {
        drawGroundShadow(g, c.x + shadowShift * s, c.z, half, half, 0.3 * clear * (1 - glow));
      }
    }

    // Side face (the one facing the camera).
    if (xl > 0) {
      ctx.fillStyle = shades.side[fi];
      ctx.beginPath();
      ctx.moveTo(x1, yTop); ctx.lineTo(bx1, byTop); ctx.lineTo(bx1, byBot); ctx.lineTo(x1, yBot);
      ctx.fill();
    } else if (xr < 0) {
      ctx.fillStyle = shades.side[fi];
      ctx.beginPath();
      ctx.moveTo(x2, yTop); ctx.lineTo(bx2, byTop); ctx.lineTo(bx2, byBot); ctx.lineTo(x2, yBot);
      ctx.fill();
    }
    // Top face (visible because the camera is higher than the cubes).
    if (camH > s) {
      ctx.fillStyle = shades.top[fi];
      ctx.beginPath();
      ctx.moveTo(x1, yTop); ctx.lineTo(x2, yTop); ctx.lineTo(bx2, byTop); ctx.lineTo(bx1, byTop);
      ctx.fill();
    }
    // Front face, with a gentle top-to-bottom gradient (lighter at the top)
    // and a thin bright highlight along its top edge.
    if (!big) {
      ctx.fillStyle = shades.front[fi];
      ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
    } else {
      // Three flat bands, each painted once (nothing is painted over).
      const fh = yBot - yTop;
      const yA = yTop + fh * 0.36, yB = yBot - fh * 0.28;
      ctx.fillStyle = shades.frontHi[fi];
      ctx.fillRect(x1, yTop, x2 - x1, yA - yTop);
      ctx.fillStyle = shades.front[fi];
      ctx.fillRect(x1, yA, x2 - x1, yB - yA);
      ctx.fillStyle = shades.frontLo[fi];
      ctx.fillRect(x1, yB, x2 - x1, yBot - yB);
      ctx.fillStyle = shades.rim[fi];
      ctx.fillRect(x1, yTop, x2 - x1, Math.max(1, 0.035 * kn));
      // Water and wet ground: a faint, short mirror image under the cube.
      if (reflect) {
        const rh = (yBot - yTop) * 0.4;
        ctx.fillStyle = shades.front[fi];
        ctx.globalAlpha = reflectAlpha * clear;
        ctx.fillRect(x1, yBot, x2 - x1, rh * 0.5);
        ctx.globalAlpha = reflectAlpha * 0.5 * clear;
        ctx.fillRect(x1, yBot + rh * 0.5, x2 - x1, rh * 0.5);
        ctx.globalAlpha = 1;
      }
    }

    // Subtle neon glow (e.g. the Night level). Skipped where it's too faint to see.
    const glowAlpha = glow * (1 - fog) * 0.9;
    if (glowAlpha > 0.04) {
      ctx.globalAlpha = glowAlpha;
      ctx.strokeStyle = shades.edge[fi];
      ctx.lineWidth = Math.max(1, 0.06 * kn);
      ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);
      ctx.beginPath();
      ctx.moveTo(x1, yTop); ctx.lineTo(bx1, byTop); ctx.lineTo(bx2, byTop); ctx.lineTo(x2, yTop);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function byFarFirst(a, b) {
  return b.z - a.z;
}

// Project a ground point relative to the camera.
function project(r, x, y, z, out) {
  const k = r.f / z;
  out.x = r.cx + x * k;
  out.y = r.horizonY + (r.config.cameraHeight - y) * k;
  return out;
}

const P = [{}, {}, {}, {}];
const Q = {};

// The ship: a swept delta-wing glider with a raised spine, a glass canopy,
// two glowing engines and light trails. It's a real 3D model, so when you
// turn it rolls (one wing dips toward the ground) and its nose swings a
// little toward the way it's sliding, while still flying forward.
//
// Model points are [across (-1 left … 1 right, × half the ship's width),
//                   height above the hull base (world units),
//                   along (-1 tail … 1 nose, × half the ship's length)].
const MODEL = {
  nose: [0, 0.03, 1.04], spine: [0, 0.15, -0.04], tail: [0, 0.07, -0.64],
  tipR: [1, 0, -0.76], tipL: [-1, 0, -0.76], rearR: [0.38, 0.03, -0.92], rearL: [-0.38, 0.03, -0.92],
  c0: [0, 0.11, 0.72], c1: [0.15, 0.16, 0.32], c2: [0.1, 0.2, 0], c3: [-0.1, 0.2, 0], c4: [-0.15, 0.16, 0.32],
};
const FACETS = [
  ['nose', 'tipR', 'spine'], ['spine', 'tipR', 'rearR', 'tail'],
  ['nose', 'spine', 'tipL'], ['spine', 'tail', 'rearL', 'tipL'],
];
const CANOPY = ['c0', 'c1', 'c2', 'c3', 'c4'];
const ENGINES = ['rearR', 'rearL'];
const TIPS = ['tipL', 'tipR'];
const T = {};
for (const k of Object.keys(MODEL)) T[k] = { x: 0, y: 0, z: 0, sx: 0, sy: 0 };
const LIGHT = (() => { const l = Math.hypot(-0.45, 1, -0.25); return [-0.45 / l, 1 / l, -0.25 / l]; })();
const SHADE_STEPS = 24;
const facetOrder = [0, 1, 2, 3];
const facetDist = [0, 0, 0, 0];
const HOVER = 0.28;
const byFacetDist = (a, b) => facetDist[b] - facetDist[a];

function updateShipColors(r, ship) {
  if (r.shipKey === ship) return;
  r.shipKey = ship;
  const dark = mixColor(ship, '#000000', 0.5);
  const light = mixColor(ship, '#ffffff', 0.4);
  r.shipShades = [];
  for (let i = 0; i < SHADE_STEPS; i++) {
    const b = i / (SHADE_STEPS - 1);
    r.shipShades.push(b < 0.6 ? mixColor(dark, ship, b / 0.6) : mixColor(ship, light, (b - 0.6) / 0.4));
  }
  r.shipEdge = mixColor(ship, '#ffffff', 0.62);
  r.shipGlass = mixColor(ship, '#0a0f1e', 0.8);
  r.shipGlow = mixColor(ship, '#ffffff', 0.72);
  r.shipGlowSprite = glowSprite('#ffffff', r.shipGlow, 0.35);
}

function drawShip(r, p, view, game, g) {
  const { ctx } = r;
  const cfg = r.config;
  const zc = cfg.cameraBack;
  const half = cfg.shipWidth / 2;
  const halfLen = cfg.shipLength / 2;
  const camH = cfg.cameraHeight;
  updateShipColors(r, p.ship);

  // Roll (positive = right wing down) and yaw (positive = nose to the right).
  const roll = view.lean || 0;
  const yaw = view.yaw || 0;
  const cr = Math.cos(roll), sr = Math.sin(roll), cyw = Math.cos(yaw), syw = Math.sin(yaw);
  for (const k in MODEL) {
    const m = MODEL[k];
    const x = m[0] * half, y = m[1], z = m[2] * halfLen;
    const x1 = x * cr + y * sr;
    const y1 = -x * sr + y * cr;
    const t = T[k];
    t.x = x1 * cyw + z * syw;
    t.y = y1;
    t.z = -x1 * syw + z * cyw;
    project(r, t.x, HOVER + t.y, zc + t.z, Q);
    t.sx = Q.x;
    t.sy = Q.y;
  }

  // Soft shadow on the ground under the ship (narrower when banked).
  project(r, 0, 0, zc - 0.05, Q);
  const shadowW = ((half * 1.15 * r.f) / zc) * (0.75 + 0.25 * cr);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(Q.x, Q.y, shadowW, shadowW * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Engine trails: glowing ribbons that follow where the ship has been, so
  // they curve when you steer. Longer and brighter when boosting. Thin white
  // streaks come off the wingtips in hard turns.
  const boost = game.boost || 0;
  const trail = view.trail;
  ctx.globalCompositeOperation = 'lighter';
  if (trail && g) {
    const reach = 0.7 + 0.5 * boost;
    for (let n = 0; n < 2; n++) {
      const t = T[ENGINES[n]];
      drawTrailRibbon(g, trail, t.sx, t.sy, t.x, HOVER + t.y, t.z, reach, 0.13 + 0.05 * boost, r.shipGlow, 0.5 + 0.3 * boost);
    }
    const hard = Math.min(1, Math.max(0, Math.abs(game.leanLook || 0) - 0.5) * 2);
    if (hard > 0) {
      for (let n = 0; n < 2; n++) {
        const t = T[TIPS[n]];
        drawTrailLine(g, trail, t.sx, t.sy, t.x, HOVER + t.y, t.z, 0.9, 0.6 * hard);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Hull facets, farthest first, each shaded by how much it faces the light.
  for (let i = 0; i < 4; i++) {
    const f = FACETS[i];
    let cx = 0, cy = 0, cz = 0;
    for (const k of f) { cx += T[k].x; cy += T[k].y; cz += T[k].z; }
    cx /= f.length; cy /= f.length; cz /= f.length;
    facetDist[i] = cx * cx + (camH - HOVER - cy) ** 2 + (zc + cz) ** 2;
    facetOrder[i] = i;
  }
  facetOrder.sort(byFacetDist);
  for (let n = 0; n < 4; n++) {
    const f = FACETS[facetOrder[n]];
    const a = T[f[0]], b = T[f[1]], c = T[f[2]];
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const lambert = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl);
    const shade = 0.25 + 0.75 * lambert;
    ctx.fillStyle = r.shipShades[Math.round(shade * (SHADE_STEPS - 1))];
    ctx.beginPath();
    for (let i = 0; i < f.length; i++) {
      const t = T[f[i]];
      if (i === 0) ctx.moveTo(t.sx, t.sy); else ctx.lineTo(t.sx, t.sy);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Bright leading edges and a softer centre ridge.
  ctx.strokeStyle = r.shipEdge;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(T.tipL.sx, T.tipL.sy);
  ctx.lineTo(T.nose.sx, T.nose.sy);
  ctx.lineTo(T.tipR.sx, T.tipR.sy);
  ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(T.nose.sx, T.nose.sy);
  ctx.lineTo(T.spine.sx, T.spine.sy);
  ctx.lineTo(T.tail.sx, T.tail.sy);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Glass canopy with a small reflection.
  ctx.fillStyle = r.shipGlass;
  ctx.beginPath();
  for (let i = 0; i < CANOPY.length; i++) {
    const t = T[CANOPY[i]];
    if (i === 0) ctx.moveTo(t.sx, t.sy); else ctx.lineTo(t.sx, t.sy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo((T.c0.sx * 2 + T.c4.sx) / 3, (T.c0.sy * 2 + T.c4.sy) / 3);
  ctx.lineTo((T.c4.sx * 2 + T.c3.sx) / 3, (T.c4.sy * 2 + T.c3.sy) / 3);
  ctx.stroke();

  // Engine glow (a gentle flicker) and wingtip lights. When boosting, the
  // glow stretches back into a flame.
  const flicker = 0.85 + 0.15 * Math.sin(performance.now() / 45);
  ctx.globalCompositeOperation = 'lighter';
  for (let n = 0; n < 2; n++) {
    const t = T[ENGINES[n]];
    const rad = ((0.09 * r.f) / (zc + t.z)) * flicker * (1 + 0.3 * boost);
    if (boost > 0.02) drawGlowOval(ctx, r.shipGlowSprite, t.sx, t.sy + rad * 1.5 * boost, rad * (1 - 0.25 * boost), rad * (1 + 2.4 * boost));
    drawGlow(ctx, r.shipGlowSprite, t.sx, t.sy, rad);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  for (const k of TIPS) {
    ctx.beginPath();
    ctx.arc(T[k].sx, T[k].sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Debug: draw hitboxes as outlines on the ground.
function drawHitboxes(r, game, camX, camZ) {
  const { ctx } = r;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ff00ff';
  const cubes = game.spawner.cubes;
  for (let i = 0; i < cubes.length; i++) {
    const c = cubes[i];
    const near = c.z - camZ - c.size / 2;
    if (near < 0.5 || near > 60) continue;
    groundRect(r, c.x - camX, c.z - camZ, c.size / 2, c.size / 2);
  }
  const hb = game.hitbox;
  if (hb && hb.halfW) {
    ctx.strokeStyle = '#00ff66';
    groundRect(r, hb.x - camX, hb.z - camZ, hb.halfW, hb.halfD);
  }
}

function groundRect(r, x, z, hw, hd) {
  const { ctx } = r;
  project(r, x - hw, 0, z - hd, P[0]);
  project(r, x + hw, 0, z - hd, P[1]);
  project(r, x + hw, 0, z + hd, P[2]);
  project(r, x - hw, 0, z + hd, P[3]);
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(P[i].x, P[i].y);
  ctx.closePath();
  ctx.stroke();
}

export const degToRad = (d) => d * DEG;
