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
  if (view.showShip !== false) drawShip(r, p, view.lean || 0);

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

function drawShip(r, p, lean) {
  const { ctx } = r;
  const cfg = r.config;
  const zc = cfg.cameraBack;
  const half = cfg.shipWidth / 2;
  const len = cfg.shipLength;
  const hover = 0.18;

  // Shadow on the ground.
  project(r, 0, 0, zc, P[0]);
  const shadowW = (half * 1.25 * r.f) / zc;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(P[0].x + lean * 30, P[0].y + 4, shadowW, shadowW * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Arrow: nose, right wing, notch, left wing.
  project(r, 0, hover, zc + len / 2, P[0]);
  project(r, half, hover, zc - len / 2, P[1]);
  project(r, 0, hover, zc - len / 5, P[2]);
  project(r, -half, hover, zc - len / 2, P[3]);
  const pivotX = P[2].x;
  const pivotY = P[2].y;
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(lean);
  ctx.translate(-pivotX, -pivotY);
  if (r.shipKey !== p.ship) {
    r.shipKey = p.ship;
    r.shipDark = mixColor(p.ship, '#000000', 0.18);
    r.shipLight = mixColor(p.ship, '#ffffff', 0.12);
  }
  // Right half (darker) then left half (lighter) for a folded look.
  ctx.fillStyle = r.shipDark;
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[1].x, P[1].y); ctx.lineTo(P[2].x, P[2].y);
  ctx.fill();
  ctx.fillStyle = r.shipLight;
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[2].x, P[2].y); ctx.lineTo(P[3].x, P[3].y);
  ctx.fill();
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
