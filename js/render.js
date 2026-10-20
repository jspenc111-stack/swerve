// render.js — all drawing to the canvas.
//
// Fake 3D with perspective projection: a point (x, y, z) relative to the
// camera lands on screen at
//   screenX = centerX + x * f / z
//   screenY = horizonY + (cameraHeight - y) * f / z
// so far-away things are smaller and closer to the horizon.

import { mixColor } from './levels.js';

const FOG_STEPS = 24;
const DEG = Math.PI / 180;

export function createRenderer(canvas, config) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const r = {
    canvas, ctx, config,
    w: 1, h: 1, dpr: 1, f: 1, cx: 0, horizonY: 0,
    visible: [],
    paletteKey: '',
    shades: { front: [], top: [], side: [], edge: [] },
    gradKey: '',
    skyGrad: null,
    groundGrad: null,
    shipKey: '',
    shipShades: [],
  };
  resizeRenderer(r);
  return r;
}

// Call on window resize only (never every frame).
export function resizeRenderer(r) {
  const cfg = r.config;
  r.dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDevicePixelRatio);
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
function updateShades(r, p) {
  const key = p.cube + p.skyHorizon + p.ground;
  if (key === r.paletteKey) return;
  r.paletteKey = key;
  const top = mixColor(p.cube, '#ffffff', 0.28);
  const side = mixColor(p.cube, '#000000', 0.3);
  const edge = mixColor(p.cube, '#ffffff', 0.65);
  for (let i = 0; i < FOG_STEPS; i++) {
    const t = i / (FOG_STEPS - 1);
    r.shades.front[i] = mixColor(p.cube, p.skyHorizon, t);
    r.shades.top[i] = mixColor(top, p.skyHorizon, t);
    r.shades.side[i] = mixColor(side, p.skyHorizon, t);
    r.shades.edge[i] = mixColor(edge, p.skyHorizon, t);
  }
}

// view: { palette, bank (radians), roll (radians), shakeX, shakeY,
//         flash (0..1), glow (0..1), lean (ship roll, radians),
//         yaw (ship heading, radians), showShip, hitboxes }
export function drawFrame(r, game, view) {
  const { ctx, config: cfg, w, h } = r;
  const p = view.palette;
  updateShades(r, p);

  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.translate(view.shakeX || 0, view.shakeY || 0);

  // Tilt the whole world around a point near the ship (bank + roll).
  const angle = (view.bank || 0) + (view.roll || 0);
  const pivotY = h * 0.62;
  ctx.translate(r.cx, pivotY);
  ctx.rotate(angle);
  ctx.translate(-r.cx, -pivotY);

  drawSkyAndGround(r, p);
  const camX = game.x;
  const camZ = game.distance - cfg.cameraBack;
  if (p.grid) drawGrid(r, p, camX, camZ);
  drawCubes(r, game.spawner.cubes, camX, camZ, view.glow || 0);
  if (view.hitboxes) drawHitboxes(r, game, camX, camZ);

  // Ship and HUD effects are not tilted by the bank.
  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.translate(view.shakeX || 0, view.shakeY || 0);
  if (view.showShip !== false) drawShip(r, p, view, game);

  if (view.flash > 0) {
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    ctx.globalAlpha = Math.min(1, view.flash);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

function drawSkyAndGround(r, p) {
  const { ctx, w, h, horizonY } = r;
  // Gradients are rebuilt only when the colors or screen size change.
  const key = p.sky + p.skyHorizon + p.ground + w + 'x' + h;
  if (key !== r.gradKey) {
    r.gradKey = key;
    r.skyGrad = ctx.createLinearGradient(0, horizonY - h * 0.6, 0, horizonY);
    r.skyGrad.addColorStop(0, p.sky);
    r.skyGrad.addColorStop(1, p.skyHorizon);
    r.groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    r.groundGrad.addColorStop(0, mixColor(p.ground, p.skyHorizon, 0.55));
    r.groundGrad.addColorStop(0.35, p.ground);
    r.groundGrad.addColorStop(1, p.ground);
  }
  // Oversized so the corners stay covered when the view is tilted.
  const left = -w;
  const width = w * 3;
  ctx.fillStyle = r.skyGrad;
  ctx.fillRect(left, horizonY - h * 2, width, h * 2 + 1);
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

function drawCubes(r, cubes, camX, camZ, glow) {
  const { ctx, f, cx, horizonY, w, visible, shades } = r;
  const cfg = r.config;
  const camH = cfg.cameraHeight;
  const fogStart = cfg.fogStart;
  const fogRange = Math.max(1, cfg.fogDistance - fogStart);

  // Collect cubes in view, then sort far → near (painter's algorithm).
  visible.length = 0;
  for (let i = 0; i < cubes.length; i++) {
    const c = cubes[i];
    const near = c.z - camZ - c.size / 2;
    if (near < 0.5 || near > cfg.fogDistance + 4) continue;
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
    // Front face.
    ctx.fillStyle = shades.front[fi];
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);

    // Subtle neon glow (e.g. the Night level).
    if (glow > 0) {
      ctx.globalAlpha = glow * (1 - fog) * 0.9;
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
const T = {};
for (const k of Object.keys(MODEL)) T[k] = { x: 0, y: 0, z: 0, sx: 0, sy: 0 };
const LIGHT = (() => { const l = Math.hypot(-0.45, 1, -0.25); return [-0.45 / l, 1 / l, -0.25 / l]; })();
const SHADE_STEPS = 24;
const facetOrder = [0, 1, 2, 3];
const facetDist = [0, 0, 0, 0];
const HOVER = 0.28;

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
}

function drawShip(r, p, view, game) {
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

  // Light trails straight out behind the engines (longer when faster).
  const speed = game.speed || 0;
  const trail = 0.22 + speed * 0.007;
  const boost = game.boost || 0;
  ctx.globalCompositeOperation = 'lighter';
  for (const k of ENGINES) {
    const t = T[k];
    const z0 = zc + t.z;
    project(r, t.x - syw * trail, HOVER + t.y, z0 - cyw * trail, Q);
    const w = (0.05 * r.f) / z0;
    const g = ctx.createLinearGradient(t.sx, t.sy, Q.x, Q.y);
    g.addColorStop(0, r.shipGlow);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.45 + 0.35 * boost;
    ctx.beginPath();
    ctx.moveTo(t.sx - w, t.sy);
    ctx.lineTo(t.sx + w, t.sy);
    ctx.lineTo(Q.x, Q.y);
    ctx.fill();
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
  facetOrder.sort((a, b) => facetDist[b] - facetDist[a]);
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

  // Engine glow (a gentle flicker, bigger when boosting) and wingtip lights.
  const flicker = 0.85 + 0.15 * Math.sin(performance.now() / 45);
  ctx.globalCompositeOperation = 'lighter';
  for (const k of ENGINES) {
    const t = T[k];
    const rad = ((0.09 * r.f) / (zc + t.z)) * flicker * (1 + 0.3 * boost);
    const g = ctx.createRadialGradient(t.sx, t.sy, 0, t.sx, t.sy, rad);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, r.shipGlow);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.sx, t.sy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  for (const k of ['tipL', 'tipR']) {
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
