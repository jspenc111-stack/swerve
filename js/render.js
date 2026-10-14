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
    shipDark: '#000000',
    shipLight: '#ffffff',
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
//         flash (0..1), glow (0..1), lean (radians), showShip, hitboxes }
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
  if (view.showShip !== false) drawShip(r, p, view.lean || 0, game.speed);

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

// The ship: a swept delta-wing glider with a glass canopy, two glowing
// engines and short light trails. Shapes are given in ship coordinates:
// u = -1 (left wingtip) … 1 (right wingtip), v = -1 (tail) … 1 (nose).
const HULL_RIGHT = [[0, 1], [0.2, 0.3], [1, -0.72], [0.66, -0.66], [0.34, -0.9], [0, -0.62]];
const CANOPY = [[0, 0.74], [0.13, 0.36], [0.07, 0.1], [-0.07, 0.1], [-0.13, 0.36]];
const ENGINES = [[-0.3, -0.84], [0.3, -0.84]];

function drawShip(r, p, lean, speed) {
  const { ctx } = r;
  const cfg = r.config;
  const zc = cfg.cameraBack;
  const half = cfg.shipWidth / 2;
  const len = cfg.shipLength;
  const hover = 0.2;

  if (r.shipKey !== p.ship) {
    r.shipKey = p.ship;
    r.shipDark = mixColor(p.ship, '#000000', 0.28);
    r.shipLight = mixColor(p.ship, '#ffffff', 0.14);
    r.shipEdge = mixColor(p.ship, '#ffffff', 0.6);
    r.shipGlass = mixColor(p.ship, '#0a0f1e', 0.78);
    r.shipGlow = mixColor(p.ship, '#ffffff', 0.72);
  }

  // Ship coordinates → screen (true perspective, so the nose looks further away).
  const toScreen = (u, v) => project(r, u * half, hover, zc + (v * len) / 2, Q);

  // Soft shadow on the ground, shifted toward the turn.
  project(r, 0, 0, zc, P[0]);
  const shadowW = (half * 1.2 * r.f) / zc;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(P[0].x + lean * 40, P[0].y + 6, shadowW, shadowW * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Banking: tilt into the turn and narrow slightly, as if the wings roll.
  toScreen(0, -0.2);
  const cx = Q.x;
  const cy = Q.y;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(lean * 0.7);
  ctx.scale(1 - Math.min(0.3, Math.abs(lean) * 0.9), 1);
  ctx.translate(-cx, -cy);

  // Light trails behind the engines (longer when faster).
  const trail = 14 + (speed || 0) * 1.1;
  ctx.globalCompositeOperation = 'lighter';
  for (const [u, v] of ENGINES) {
    toScreen(u, v);
    const g = ctx.createLinearGradient(Q.x, Q.y, Q.x, Q.y + trail);
    g.addColorStop(0, r.shipGlow);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(Q.x - 4, Q.y);
    ctx.lineTo(Q.x + 4, Q.y);
    ctx.lineTo(Q.x, Q.y + trail);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Hull: lit left half, shaded right half.
  for (const side of [-1, 1]) {
    ctx.fillStyle = side < 0 ? r.shipLight : r.shipDark;
    ctx.beginPath();
    for (let i = 0; i < HULL_RIGHT.length; i++) {
      toScreen(HULL_RIGHT[i][0] * side, HULL_RIGHT[i][1]);
      if (i === 0) ctx.moveTo(Q.x, Q.y); else ctx.lineTo(Q.x, Q.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Bright leading edges and a centre ridge.
  ctx.strokeStyle = r.shipEdge;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  toScreen(-1, -0.72); ctx.moveTo(Q.x, Q.y);
  toScreen(-0.2, 0.3); ctx.lineTo(Q.x, Q.y);
  toScreen(0, 1); ctx.lineTo(Q.x, Q.y);
  toScreen(0.2, 0.3); ctx.lineTo(Q.x, Q.y);
  toScreen(1, -0.72); ctx.lineTo(Q.x, Q.y);
  ctx.stroke();
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  toScreen(0, 0.1); ctx.moveTo(Q.x, Q.y);
  toScreen(0, -0.62); ctx.lineTo(Q.x, Q.y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Glass canopy with a small highlight.
  ctx.fillStyle = r.shipGlass;
  ctx.beginPath();
  for (let i = 0; i < CANOPY.length; i++) {
    toScreen(CANOPY[i][0], CANOPY[i][1]);
    if (i === 0) ctx.moveTo(Q.x, Q.y); else ctx.lineTo(Q.x, Q.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  toScreen(-0.05, 0.6); ctx.moveTo(Q.x, Q.y);
  toScreen(-0.09, 0.36); ctx.lineTo(Q.x, Q.y);
  ctx.stroke();

  // Engine glow (a gentle flicker) and wingtip lights.
  const flicker = 0.85 + 0.15 * Math.sin(performance.now() / 45);
  ctx.globalCompositeOperation = 'lighter';
  for (const [u, v] of ENGINES) {
    toScreen(u, v);
    const rad = 9 * flicker;
    const g = ctx.createRadialGradient(Q.x, Q.y, 0, Q.x, Q.y, rad);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, r.shipGlow);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(Q.x, Q.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  for (const u of [-1, 1]) {
    toScreen(u * 0.97, -0.7);
    ctx.beginPath();
    ctx.arc(Q.x, Q.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
