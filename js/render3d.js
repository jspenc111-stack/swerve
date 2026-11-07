// render3d.js — drawing for 3D Flight mode.
//
// Same perspective trick as Classic, but the camera can be at any height:
//   screenX = centerX + (x - cameraX) * f / z
//   screenY = horizonY + (cameraY - y) * f / z
// The camera follows the jet sideways exactly and up/down with a slight lag.

import { mixColor } from './levels.js';
import { drawChopperModel, drawHelipad, drawDownwash } from './chopperModel.js';

const FOG_STEPS = 24;
const SHADE_STEPS = 24;
const NEAR = 0.6; // nothing closer than this to the camera is drawn

export function createFlightRenderer() {
  return {
    items: [],
    paletteKey: '',
    shades: { front: [], top: [], bottom: [], side: [], edge: [] },
    gradKey: '',
    skyGrad: null,
    groundGrad: null,
    jetKey: '',
    jet: null,
  };
}

function updateShades(s, p) {
  const key = p.cube + p.skyHorizon;
  if (key === s.paletteKey) return;
  s.paletteKey = key;
  const top = mixColor(p.cube, '#ffffff', 0.28);
  const bottom = mixColor(p.cube, '#000000', 0.42);
  const side = mixColor(p.cube, '#000000', 0.25);
  const edge = mixColor(p.cube, '#ffffff', 0.65);
  for (let i = 0; i < FOG_STEPS; i++) {
    const t = i / (FOG_STEPS - 1);
    s.shades.front[i] = mixColor(p.cube, p.skyHorizon, t);
    s.shades.top[i] = mixColor(top, p.skyHorizon, t);
    s.shades.bottom[i] = mixColor(bottom, p.skyHorizon, t);
    s.shades.side[i] = mixColor(side, p.skyHorizon, t);
    s.shades.edge[i] = mixColor(edge, p.skyHorizon, t);
  }
}

// view: palette, bank, roll, shakeX, shakeY, flash, glow, camY, joystick, hitboxes
export function drawFlightFrame(r, s, f, view) {
  const { ctx, config: cfg, w, h } = r;
  const p = view.palette;
  updateShades(s, p);
  const cam = {
    x: f.x,
    y: view.camY,
    z: f.distance - cfg.flightCameraBack,
    hY: h * cfg.flightHorizonRatio,
  };

  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.translate(view.shakeX || 0, view.shakeY || 0);
  const angle = (view.bank || 0) + (view.roll || 0);
  const pivotY = h * 0.6;
  ctx.translate(r.cx, pivotY);
  ctx.rotate(angle);
  ctx.translate(-r.cx, -pivotY);

  drawSkyAndGround(r, s, p, cam);
  if (p.grid) drawGrid(r, p, cam);
  drawShadow(r, f, cam);
  drawWorld(r, s, f, cam, view.glow || 0);
  if (view.hitboxes) drawHitbox(r, f, cam);
  drawBullets(r, f, cam);
  drawFx(r, f, cam, false);
  if (view.firing) drawReticle(r, f, cam);

  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.translate(view.shakeX || 0, view.shakeY || 0);
  if (view.showShip !== false) drawJet(r, s, p, f, cam);
  drawFx(r, f, cam, true); // floating "+50" text on top

  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  if (view.joystick && view.joystick.active) drawJoystick(r, view.joystick, r.config.flightJoystickRadiusPx);
  if (view.flash > 0) {
    ctx.globalAlpha = Math.min(1, view.flash);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

function proj(r, cam, x, y, z, out) {
  const k = r.f / (z - cam.z);
  out.x = r.cx + (x - cam.x) * k;
  out.y = cam.hY + (cam.y - y) * k;
  return out;
}

function drawSkyAndGround(r, s, p, cam) {
  const { ctx, w, h } = r;
  const hY = cam.hY;
  const key = p.sky + p.skyHorizon + p.ground + w + 'x' + h;
  if (key !== s.gradKey) {
    s.gradKey = key;
    s.skyGrad = ctx.createLinearGradient(0, hY - h * 0.65, 0, hY);
    s.skyGrad.addColorStop(0, p.sky);
    s.skyGrad.addColorStop(1, p.skyHorizon);
    s.groundGrad = ctx.createLinearGradient(0, hY, 0, h);
    s.groundGrad.addColorStop(0, mixColor(p.ground, p.skyHorizon, 0.6));
    s.groundGrad.addColorStop(0.3, p.ground);
    s.groundGrad.addColorStop(1, p.ground);
  }
  ctx.fillStyle = s.skyGrad;
  ctx.fillRect(-w, hY - h * 2, w * 3, h * 2 + 1);
  ctx.fillStyle = s.groundGrad;
  ctx.fillRect(-w, hY, w * 3, h * 2);
}

// Grid on the ground: it squeezes toward the horizon the higher you fly.
function drawGrid(r, p, cam) {
  const { ctx, f, cx, w } = r;
  const far = r.config.fogDistance;
  const camH = Math.max(0.5, cam.y);
  ctx.strokeStyle = p.grid;
  ctx.lineWidth = 1;
  const spacing = 8;
  for (let z = Math.ceil((cam.z + 1) / spacing) * spacing; z - cam.z < far; z += spacing) {
    const rz = z - cam.z;
    const y = cam.hY + (camH * f) / rz;
    ctx.globalAlpha = Math.max(0, 1 - rz / far);
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w * 2, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  const xs = 4;
  for (let x = Math.floor((cam.x - 60) / xs) * xs; x <= cam.x + 60; x += xs) {
    const rx = x - cam.x;
    ctx.moveTo(cx + rx * f, cam.hY + camH * f);
    ctx.lineTo(cx + (rx * f) / far, cam.hY + (camH * f) / far);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// The jet's shadow straight below it: smaller and fainter the higher you fly.
const S = {};
function drawShadow(r, f, cam, span = r.config.flightShipSpan) {
  proj(r, cam, f.x, 0, f.distance, S);
  const k = r.f / (f.distance - cam.z);
  const height = f.y;
  const rx = (span / 2) * k * (1 - Math.min(0.5, height / 30));
  const ctx = r.ctx;
  ctx.fillStyle = `rgba(0,0,0,${(0.22 * (1 - Math.min(0.75, height / 12))).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(S.x, S.y, rx, rx * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Boxes and rings, sorted far → near (painter's algorithm).
function drawWorld(r, s, f, cam, glow) {
  const { ctx, w } = r;
  const cfg = r.config;
  const items = s.items;
  items.length = 0;
  const boxes = f.spawner.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const zf = b.z + b.d / 2 - cam.z;
    const zn = b.z - b.d / 2 - cam.z;
    if (zf <= NEAR || zn > cfg.fogDistance + 4) continue;
    const near = Math.max(zn, NEAR);
    const gap = Math.abs(b.x - cam.x) - b.w / 2;
    if (gap > 0 && (gap * r.f) / near > w * 1.3) continue;
    items.push(b);
  }
  const rings = f.spawner.rings;
  for (let i = 0; i < rings.length; i++) {
    const g = rings[i];
    if (g.passed || g.z - cam.z <= NEAR || g.z - cam.z > cfg.fogDistance) continue;
    items.push(g);
  }
  const targets = f.spawner.targets;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive || t.z - t.size / 2 - cam.z <= NEAR || t.z - cam.z > cfg.fogDistance) continue;
    items.push(t);
  }
  items.sort(byFarFirst);
  const fogStart = cfg.fogStart;
  const fogRange = Math.max(1, cfg.fogDistance - fogStart);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.hp !== undefined) drawDrone(r, it, cam, f.time, fogStart, fogRange);
    else if (it.taken !== undefined) drawRing(r, it, cam, fogStart, fogRange);
    else drawBox(r, s, it, cam, glow, fogStart, fogRange);
  }
  ctx.globalAlpha = 1;
}

function byFarFirst(a, b) {
  return b.z - a.z;
}

function drawBox(r, s, b, cam, glow, fogStart, fogRange) {
  const { ctx, f, cx } = r;
  const sh = s.shades;
  const zn = Math.max(b.z - b.d / 2 - cam.z, NEAR);
  const zf = b.z + b.d / 2 - cam.z;
  const xl = b.x - b.w / 2 - cam.x;
  const xr = xl + b.w;
  const yb = cam.y - b.y;          // camera height above the box's bottom
  const yt = cam.y - (b.y + b.h);  // … above its top
  const kn = f / zn;
  const kf = f / zf;
  const hY = cam.hY;
  const x1 = cx + xl * kn, x2 = cx + xr * kn;
  const yTop = hY + yt * kn, yBot = hY + yb * kn;
  const bx1 = cx + xl * kf, bx2 = cx + xr * kf;
  const byTop = hY + yt * kf, byBot = hY + yb * kf;
  let fog = (zn - fogStart) / fogRange;
  fog = fog < 0 ? 0 : fog > 1 ? 1 : fog;
  const fi = Math.round(fog * (FOG_STEPS - 1));

  if (xl > 0) {
    ctx.fillStyle = sh.side[fi];
    ctx.beginPath();
    ctx.moveTo(x1, yTop); ctx.lineTo(bx1, byTop); ctx.lineTo(bx1, byBot); ctx.lineTo(x1, yBot);
    ctx.fill();
  } else if (xr < 0) {
    ctx.fillStyle = sh.side[fi];
    ctx.beginPath();
    ctx.moveTo(x2, yTop); ctx.lineTo(bx2, byTop); ctx.lineTo(bx2, byBot); ctx.lineTo(x2, yBot);
    ctx.fill();
  }
  if (yt > 0) { // camera above the top: see the top face
    ctx.fillStyle = sh.top[fi];
    ctx.beginPath();
    ctx.moveTo(x1, yTop); ctx.lineTo(x2, yTop); ctx.lineTo(bx2, byTop); ctx.lineTo(bx1, byTop);
    ctx.fill();
  } else if (yb < 0) { // camera below the bottom: see the underside
    ctx.fillStyle = sh.bottom[fi];
    ctx.beginPath();
    ctx.moveTo(x1, yBot); ctx.lineTo(x2, yBot); ctx.lineTo(bx2, byBot); ctx.lineTo(bx1, byBot);
    ctx.fill();
  }
  ctx.fillStyle = sh.front[fi];
  ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);
  if (glow > 0) {
    ctx.globalAlpha = glow * (1 - fog) * 0.9;
    ctx.strokeStyle = sh.edge[fi];
    ctx.lineWidth = Math.max(1, 0.05 * kn);
    ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);
    ctx.globalAlpha = 1;
  }
}

// Bonus ring: a glowing square frame.
const RA = {}, RB = {};
function drawRing(r, g, cam, fogStart, fogRange) {
  const ctx = r.ctx;
  const half = g.size / 2;
  proj(r, cam, g.x - half, g.y + half, g.z, RA);
  proj(r, cam, g.x + half, g.y - half, g.z, RB);
  const k = r.f / (g.z - cam.z);
  let fog = (g.z - cam.z - fogStart) / fogRange;
  fog = fog < 0 ? 0 : fog > 1 ? 1 : fog;
  ctx.globalAlpha = 1 - fog * 0.85;
  ctx.strokeStyle = 'rgba(255, 196, 64, 0.45)';
  ctx.lineWidth = Math.max(2, 0.35 * k);
  ctx.strokeRect(RA.x, RA.y, RB.x - RA.x, RB.y - RA.y);
  ctx.strokeStyle = '#fff3c4';
  ctx.lineWidth = Math.max(1, 0.1 * k);
  ctx.strokeRect(RA.x, RA.y, RB.x - RA.x, RB.y - RA.y);
  ctx.globalAlpha = 1;
}

// ---- Shooting visuals --------------------------------------------------------

// A drone: a spinning faceted crystal with a glowing core. Small ones are
// pink-red; big armored ones are orange with a spinning ring and health pips.
const DRONE_FACES = [[0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 2], [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 2, 5]];
const DV = [{}, {}, {}, {}, {}, {}];
const DS = [{}, {}, {}, {}, {}, {}];
const LIGHT2 = (() => { const l = Math.hypot(-0.4, 1, -0.5); return [-0.4 / l, 1 / l, -0.5 / l]; })();
function drawDrone(r, t, cam, time, fogStart, fogRange) {
  const ctx = r.ctx;
  const h = t.size / 2;
  const spin = time * (t.big ? 1.6 : 2.6) + t.phase;
  const c = Math.cos(spin), sn = Math.sin(spin);
  // Octahedron: top, bottom, then four around the middle.
  const pts = [[0, h * 1.25, 0], [0, -h * 1.25, 0], [h, 0, 0], [0, 0, h], [-h, 0, 0], [0, 0, -h]];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = pts[i];
    DV[i].x = t.x + x * c - z * sn;
    DV[i].y = t.y + y;
    DV[i].z = t.z + x * sn + z * c;
    proj(r, cam, DV[i].x, DV[i].y, DV[i].z, DS[i]);
  }
  let fog = (t.z - cam.z - fogStart) / fogRange;
  fog = fog < 0 ? 0 : fog > 1 ? 1 : fog;
  ctx.globalAlpha = 1 - fog * 0.8;
  const base = t.flash > 0 ? [255, 255, 255] : t.big ? [255, 150, 40] : [255, 70, 110];
  for (const [a, b, d] of DRONE_FACES) {
    const A = DV[a], B = DV[b], D = DV[d];
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
    const wx = D.x - A.x, wy = D.y - A.y, wz = D.z - A.z;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    // Only faces turned toward the camera (it's a closed shape).
    if (nx * (cam.x - A.x) + ny * (cam.y - A.y) + nz * (cam.z - A.z) <= 0) continue;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const lit = 0.35 + 0.65 * Math.max(0, (nx * LIGHT2[0] + ny * LIGHT2[1] + nz * LIGHT2[2]) / nl);
    ctx.fillStyle = `rgb(${(base[0] * lit) | 0},${(base[1] * lit) | 0},${(base[2] * lit) | 0})`;
    ctx.beginPath();
    ctx.moveTo(DS[a].x, DS[a].y); ctx.lineTo(DS[b].x, DS[b].y); ctx.lineTo(DS[d].x, DS[d].y);
    ctx.closePath();
    ctx.fill();
  }
  const k = r.f / (t.z - cam.z);
  const centre = proj(r, cam, t.x, t.y, t.z, {});
  // A pulsing outline so drones stand out even far away (never smaller than ~9px).
  const ringR = Math.max(9, h * 1.5 * k) * (1 + 0.12 * Math.sin(time * 6 + t.phase));
  ctx.lineWidth = 2;
  ctx.strokeStyle = t.big ? 'rgba(255,140,30,0.9)' : 'rgba(255,60,110,0.9)';
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, ringR, 0, Math.PI * 2);
  ctx.stroke();
  if (h * k < 5) { // very far: draw a solid dot so it's visible
    ctx.fillStyle = t.big ? '#ff8c1e' : '#ff3c6e';
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Glowing core.
  ctx.globalCompositeOperation = 'lighter';
  const glowR = h * 1.4 * k;
  const g = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, glowR);
  g.addColorStop(0, `rgba(255,255,255,${(0.7 * (1 - fog)).toFixed(2)})`);
  g.addColorStop(0.4, t.big ? 'rgba(255,170,60,0.35)' : 'rgba(255,80,130,0.35)');
  g.addColorStop(1, 'rgba(255,80,130,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (t.big) {
    // Spinning armor ring and health pips.
    ctx.strokeStyle = t.flash > 0 ? '#ffffff' : '#ffd08a';
    ctx.lineWidth = Math.max(1.5, 0.08 * k);
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, h * 1.6 * k, h * 0.45 * k, Math.sin(spin) * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    const pip = Math.max(3, 0.12 * k);
    for (let i = 0; i < t.maxHp; i++) {
      ctx.fillStyle = i < t.hp ? '#ffd166' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(centre.x + (i - (t.maxHp - 1) / 2) * pip * 1.8 - pip / 2, centre.y - h * 1.9 * k, pip, pip);
    }
  }
  ctx.globalAlpha = 1;
}

// Shots: short bright tracers.
const BA = {}, BB = {};
function drawBullets(r, f, cam) {
  const ctx = r.ctx;
  const bullets = f.bullets;
  if (!bullets.length) return;
  ctx.lineCap = 'round';
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    const tail = Math.max(b.z - 1.6, cam.z + NEAR);
    if (b.z - cam.z <= NEAR + 0.1) continue;
    proj(r, cam, b.x - b.vx * 0.017, b.y - b.vy * 0.017, tail, BA);
    proj(r, cam, b.x, b.y, b.z, BB);
    const k = r.f / (b.z - cam.z);
    // Warm orange glow with a pale core: visible on light and dark skies.
    ctx.strokeStyle = 'rgba(255,140,30,0.75)';
    ctx.lineWidth = Math.max(3.5, 0.24 * k);
    ctx.beginPath(); ctx.moveTo(BA.x, BA.y); ctx.lineTo(BB.x, BB.y); ctx.stroke();
    ctx.strokeStyle = '#fff1b8';
    ctx.lineWidth = Math.max(1.4, 0.08 * k);
    ctx.beginPath(); ctx.moveTo(BA.x, BA.y); ctx.lineTo(BB.x, BB.y); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// Sparks (world pass) and floating "+50" text (on top of everything).
const FP = {};
function drawFx(r, f, cam, textPass) {
  const ctx = r.ctx;
  const fx = f.fx;
  if (!fx.length) return;
  for (let i = 0; i < fx.length; i++) {
    const p = fx[i];
    if (p.z - cam.z <= NEAR) continue;
    if ((p.kind === 'text') !== textPass) continue;
    proj(r, cam, p.x, p.y, p.z, FP);
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    if (textPass) {
      ctx.font = '800 24px system-ui, -apple-system, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(p.text, FP.x, FP.y);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(p.text, FP.x, FP.y);
    } else {
      const k = r.f / (p.z - cam.z);
      const sz = Math.max(2, 0.12 * k * (0.5 + a));
      ctx.fillStyle = p.color;
      ctx.fillRect(FP.x - sz / 2, FP.y - sz / 2, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Aiming reticle straight ahead; it turns gold and tightens when a drone is locked on.
function drawReticle(r, f, cam) {
  const cfg = r.config;
  const ctx = r.ctx;
  const z = f.distance + 26;
  proj(r, cam, f.x, f.y - 0.03, z, FP);
  let locked = false;
  const ts = f.spawner.targets;
  for (let i = 0; i < ts.length && !locked; i++) {
    const t = ts[i];
    const dz = t.z - f.distance;
    if (!t.alive || dz <= 1 || dz > cfg.bulletRange) continue;
    const cone = t.size / 2 + 0.6 + cfg.aimAssistCone * dz;
    locked = Math.abs(t.x - f.x) < cone && Math.abs(t.y - f.y) < cone;
  }
  const R = locked ? 11 : 14;
  ctx.beginPath();
  ctx.arc(FP.x, FP.y, R, 0, Math.PI * 2);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(FP.x + dx * (R + 3), FP.y + dy * (R + 3));
    ctx.lineTo(FP.x + dx * (R + 9), FP.y + dy * (R + 9));
  }
  ctx.globalAlpha = locked ? 0.95 : 0.7;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = locked ? '#ffd166' : '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHitbox(r, f, cam, hb = f.hitbox) {
  if (!hb || !hb.halfW) return;
  const ctx = r.ctx;
  ctx.strokeStyle = '#00ff66';
  ctx.lineWidth = 1.5;
  for (const dz of [-hb.halfD, hb.halfD]) {
    proj(r, cam, hb.x - hb.halfW, hb.y + hb.halfH, hb.z + dz, RA);
    proj(r, cam, hb.x + hb.halfW, hb.y - hb.halfH, hb.z + dz, RB);
    ctx.strokeRect(RA.x, RA.y, RB.x - RA.x, RB.y - RA.y);
  }
}

// R: the ring size (3D Flight's flightJoystickRadiusPx, or 3D Heli's joystickRadiusPx).
function drawJoystick(r, j, R = r.config.joystickRadiusPx) {
  const ctx = r.ctx;
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(j.x0, j.y0, R, 0, Math.PI * 2);
  ctx.stroke();
  let dx = j.x - j.x0, dy = j.y - j.y0;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(j.x0 + dx, j.y0 + dy, R * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---- 3D Heli -----------------------------------------------------------------
// Same world as 3D Flight (sky, ground, grid, blocks, rings), plus the
// helipad, the downwash and the helicopter. The chase camera sits behind and
// above (chopperCameraBack / chopperCameraAbove); it follows sideways moves
// exactly and up/down moves with a slight lag (view.camY, set by main.js).

// view: palette, roll, shakeX, shakeY, flash, glow, camY, hitboxes, showShip,
// path (debug: draw the open path), controls: { cc, hover, leverHeld, stick }
export function drawChopperFrame(r, s, c, look, view) {
  const { ctx, config: cfg, w, h } = r;
  const p = view.palette;
  updateShades(s, p);
  const cam = {
    x: c.x,
    y: view.camY,
    z: c.distance - cfg.chopperCameraBack,
    hY: h * cfg.flightHorizonRatio,
  };

  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.translate(view.shakeX || 0, view.shakeY || 0);
  const angle = view.roll || 0;
  const pivotY = h * 0.6;
  ctx.translate(r.cx, pivotY);
  ctx.rotate(angle);
  ctx.translate(-r.cx, -pivotY);

  drawSkyAndGround(r, s, p, cam);
  if (p.grid) drawGrid(r, p, cam);
  drawHelipad(r, cam, c.padZ);
  drawDownwash(r, cam, c, look);
  drawShadow(r, c, cam, cfg.chopperLength * 0.7);
  drawWorld(r, s, c, cam, view.glow || 0);
  if (view.path) drawPath(r, c, cam);
  if (view.hitboxes) { drawHitbox(r, c, cam, c.hitbox); drawHitbox(r, c, cam, c.rotorBox); }
  if (view.showShip !== false) drawChopperModel(r, s, cam, c, look, p);

  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  const ctl = view.controls;
  if (ctl) drawChopperControls(r, ctl.cc, ctl.hover, ctl.leverHeld, ctl.stick);
  if (view.flash > 0) {
    ctx.globalAlpha = Math.min(1, view.flash);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

// Debug: the always-open path ahead, as a line of small squares (each the
// minimum opening, minGapWidth × minGapHeight).
function drawPath(r, c, cam) {
  const ctx = r.ctx;
  const cfg = r.config;
  const path = c.spawner.path;
  ctx.strokeStyle = 'rgba(0,255,140,0.8)';
  ctx.lineWidth = 1;
  for (let i = 0; i < path.length; i += 2) {
    const q = path[i];
    if (q.z - cam.z <= NEAR + 1 || q.z - cam.z > cfg.fogDistance) continue;
    proj(r, cam, q.x - cfg.minGapWidth / 2, q.y + cfg.minGapHeight / 2, q.z, RA);
    proj(r, cam, q.x + cfg.minGapWidth / 2, q.y - cfg.minGapHeight / 2, q.z, RB);
    ctx.strokeRect(RA.x, RA.y, RB.x - RA.x, RB.y - RA.y);
  }
}

// ---- The jet ---------------------------------------------------------------
// A low-poly fighter jet: a rounded fuselage, swept wings, canards, twin
// angled tail fins, tail planes, a glass canopy, an afterburner and
// navigation lights. Units are world units (x right, y up, z forward),
// centred on the jet. It rolls into turns and pitches when climbing/diving.

const V = []; // model vertices
const POLYS = []; // { idx: [...], mat }
function v(x, y, z) { V.push([x, y, z]); return V.length - 1; }
function poly(mat, ...idx) { POLYS.push({ idx, mat }); }

(function buildJet() {
  // Fuselage: hexagonal cross-sections from nose to tail.
  const sections = [
    // [z, half width, top, bottom]
    [0.55, 0.07, 0.07, -0.05],
    [0.15, 0.12, 0.12, -0.08],
    [-0.45, 0.13, 0.1, -0.08],
    [-0.72, 0.09, 0.07, -0.06],
  ];
  const rings = sections.map(([z, hw, t, b]) => [
    v(0, t, z), v(hw * 0.85, t * 0.5, z), v(hw, b * 0.4, z),
    v(0, b, z), v(-hw, b * 0.4, z), v(-hw * 0.85, t * 0.5, z),
  ]);
  const nose = v(0, 0.005, 0.84);
  for (let i = 0; i < 6; i++) poly('body', nose, rings[0][i], rings[0][(i + 1) % 6]);
  for (let s = 0; s < rings.length - 1; s++) {
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      poly('body', rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i]);
    }
  }
  poly('exhaust', ...rings[3].slice().reverse());
  for (const side of [1, -1]) {
    // Main wings (swept back), with colored tips.
    const ri = v(0.11 * side, -0.02, 0.28), rt = v(0.13 * side, -0.03, -0.5);
    const mi = v(0.45 * side, -0.04, -0.13), mt = v(0.46 * side, -0.04, -0.45);
    poly('wing', ri, mi, mt, rt);
    poly('accent', mi, v(0.6 * side, -0.05, -0.3), v(0.6 * side, -0.05, -0.43), mt);
    // Canards (small front wings).
    poly('accent', v(0.07 * side, 0.01, 0.5), v(0.25 * side, 0.0, 0.35), v(0.25 * side, 0.0, 0.3), v(0.08 * side, 0.01, 0.37));
    // Tail planes.
    poly('wing', v(0.11 * side, -0.02, -0.5), v(0.36 * side, -0.03, -0.62), v(0.37 * side, -0.03, -0.73), v(0.11 * side, -0.02, -0.74));
    // Twin tail fins, angled outward.
    poly('accent', v(0.08 * side, 0.08, -0.36), v(0.2 * side, 0.36, -0.56), v(0.22 * side, 0.36, -0.67), v(0.09 * side, 0.07, -0.72));
  }
  // Canopy.
  const cf = v(0, 0.075, 0.52), ct = v(0, 0.19, 0.26), cr = v(0.07, 0.115, 0.26), cl = v(-0.07, 0.115, 0.26), cb = v(0, 0.14, 0.05);
  poly('glass', cf, cr, ct); poly('glass', cf, ct, cl); poly('glass', ct, cr, cb); poly('glass', ct, cb, cl);
})();

const T = V.map(() => ({ x: 0, y: 0, z: 0, sx: 0, sy: 0 }));
const LIGHT = (() => { const l = Math.hypot(-0.4, 1, -0.3); return [-0.4 / l, 1 / l, -0.3 / l]; })();
const order = POLYS.map((_, i) => i);
const dist = new Float64Array(POLYS.length);
const TIP_L = V.findIndex((p) => p[0] === -0.6 && p[2] === -0.3);
const TIP_R = V.findIndex((p) => p[0] === 0.6 && p[2] === -0.3);
const EXHAUST = [0, 0, -0.74];

function jetMaterials(s, ship) {
  if (s.jetKey === ship && s.jet) return s.jet;
  s.jetKey = ship;
  const body = mixColor(ship, '#c3cbd4', 0.8);  // silver, with a hint of the level's ship color
  const bases = {
    body,
    wing: mixColor(body, '#5a6470', 0.25),
    accent: ship,
    glass: '#1a2a44',
    exhaust: '#4a4f58',
  };
  const jet = {};
  for (const [name, base] of Object.entries(bases)) {
    const dark = mixColor(base, '#000000', 0.55);
    const light = mixColor(base, '#ffffff', name === 'glass' ? 0.55 : 0.45);
    jet[name] = [];
    for (let i = 0; i < SHADE_STEPS; i++) {
      const b = i / (SHADE_STEPS - 1);
      jet[name].push(b < 0.6 ? mixColor(dark, base, b / 0.6) : mixColor(base, light, (b - 0.6) / 0.4));
    }
  }
  jet.edge = mixColor(body, '#ffffff', 0.7);
  s.jet = jet;
  return jet;
}

const Q = {};
function drawJet(r, s, p, f, cam) {
  const { ctx, config: cfg } = r;
  const mats = jetMaterials(s, p.ship);
  const DEG = Math.PI / 180;
  const roll = (f.vx / cfg.flightMaxSteerSpeed) * cfg.flightRollDeg * DEG;
  const pitch = (f.vy / cfg.flightMaxClimbSpeed) * cfg.flightPitchDeg * DEG;
  const yaw = 0.15 * Math.atan2(f.vx, Math.max(1, f.speed));
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const sx = cfg.flightShipSpan / 1.2;
  const sz = cfg.flightShipLength / 1.68;
  const rot = (x, y, z, o) => {
    x *= sx; z *= sz;
    const x1 = x * cr + y * sr, y1 = -x * sr + y * cr;           // roll
    const y2 = y1 * cp + z * sp, z2 = -y1 * sp + z * cp;          // pitch
    o.x = x1 * cy + z2 * sy; o.y = y2; o.z = -x1 * sy + z2 * cy;  // yaw
    return o;
  };
  for (let i = 0; i < V.length; i++) {
    const t = rot(V[i][0], V[i][1], V[i][2], T[i]);
    proj(r, cam, f.x + t.x, f.y + t.y, f.distance + t.z, Q);
    t.sx = Q.x;
    t.sy = Q.y;
  }
  // Camera position relative to the jet, for sorting and two-sided lighting.
  const ex = cam.x - f.x, ey = cam.y - f.y, ez = cam.z - f.distance;

  // Faces, farthest first, each shaded by how much it faces the light.
  for (let i = 0; i < POLYS.length; i++) {
    const idx = POLYS[i].idx;
    let mx = 0, my = 0, mz = 0;
    for (const n of idx) { mx += T[n].x; my += T[n].y; mz += T[n].z; }
    mx /= idx.length; my /= idx.length; mz /= idx.length;
    dist[i] = (mx - ex) ** 2 + (my - ey) ** 2 + (mz - ez) ** 2;
    order[i] = i;
  }
  order.sort((a2, b2) => dist[b2] - dist[a2]);
  ctx.lineJoin = 'round';
  for (let n = 0; n < order.length; n++) {
    const pl = POLYS[order[n]];
    const idx = pl.idx;
    const A = T[idx[0]], B = T[idx[1]], C = T[idx[2]];
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
    const wx = C.x - A.x, wy = C.y - A.y, wz = C.z - A.z;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    // Face the camera (thin wings and fins are seen from both sides).
    if (nx * (ex - A.x) + ny * (ey - A.y) + nz * (ez - A.z) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const lambert = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl);
    const shade = pl.mat === 'exhaust' ? 0.2 : 0.22 + 0.78 * lambert;
    const color = mats[pl.mat][Math.round(shade * (SHADE_STEPS - 1))];
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6; // hides hairline gaps between faces
    ctx.beginPath();
    for (let i = 0; i < idx.length; i++) {
      const t = T[idx[i]];
      if (i === 0) ctx.moveTo(t.sx, t.sy); else ctx.lineTo(t.sx, t.sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Afterburner flame, glowing out of the nozzle toward the camera.
  const boost = f.boost || 0;
  const flame = 0.18 + 0.4 * boost + (f.speed || 0) * 0.003;
  const e0 = rot(EXHAUST[0], EXHAUST[1], EXHAUST[2], {});
  const e1 = rot(EXHAUST[0], EXHAUST[1], EXHAUST[2] - flame / sz, {});
  const a = proj(r, cam, f.x + e0.x, f.y + e0.y, f.distance + e0.z, {});
  const b = proj(r, cam, f.x + e1.x, f.y + e1.y, f.distance + e1.z, {});
  const k0 = r.f / (f.distance + e0.z - cam.z);
  const flick = 0.85 + 0.15 * Math.sin(performance.now() / 37);
  ctx.globalCompositeOperation = 'lighter';
  const rad = 0.11 * k0 * flick * (1 + 0.5 * boost);
  let g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, rad * 1.6);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, boost > 0.3 ? 'rgba(140,200,255,0.7)' : 'rgba(255,170,70,0.7)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(a.x, a.y, rad * 1.6, 0, Math.PI * 2);
  ctx.fill();
  g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  g.addColorStop(0, 'rgba(255,240,200,0.9)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(a.x - rad * 0.8, a.y);
  ctx.lineTo(a.x + rad * 0.8, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Navigation lights: red on the left wingtip, green on the right, and a
  // white strobe that blinks now and then.
  const now = performance.now();
  const strobe = now % 1400 < 70;
  ctx.globalCompositeOperation = 'lighter';
  for (const [i, col] of [[TIP_L, '255,60,60'], [TIP_R, '60,255,110']]) {
    const t = T[i];
    const rr = strobe ? 9 : 5;
    const gl = ctx.createRadialGradient(t.sx, t.sy, 0, t.sx, t.sy, rr);
    gl.addColorStop(0, strobe ? 'rgba(255,255,255,1)' : `rgba(${col},1)`);
    gl.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(t.sx, t.sy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---- 3D Heli: the two-thumb controls ---------------------------------------
// The collective is a tall slider near its screen edge (about 60% of the
// screen height) with a handle and a HOVER mark. The cyclic is a floating
// joystick where the thumb landed; when no thumb is on it, a faint ring shows
// where to put one.

// Where the collective slider sits: { x, top, bottom } in screen pixels.
export function collectiveSlider(r, side, out = {}) {
  const margin = Math.max(34, Math.min(64, r.w * 0.06));
  out.x = side === 'right' ? r.w - margin : margin;
  const len = r.h * 0.6;
  out.top = r.h * 0.3;
  out.bottom = Math.min(r.h - 34, out.top + len);
  return out;
}

const SL = {};
export function drawChopperControls(r, cc, hover, leverHeld, stick) {
  const ctx = r.ctx;
  const s = collectiveSlider(r, cc.side, SL);
  const yOf = (v) => s.bottom - (s.bottom - s.top) * v;
  ctx.save();
  ctx.lineCap = 'round';
  // Track.
  ctx.globalAlpha = leverHeld ? 0.55 : 0.4;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(s.x, s.top); ctx.lineTo(s.x, s.bottom); ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(s.x, s.top); ctx.lineTo(s.x, s.bottom); ctx.stroke();
  // Filled part up to the lever.
  const yl = yOf(cc.lever);
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = cc.lever >= hover ? '#7ee08a' : '#ffb35c';
  ctx.beginPath(); ctx.moveTo(s.x, s.bottom); ctx.lineTo(s.x, yl); ctx.stroke();
  // HOVER mark.
  const yh = yOf(hover);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(s.x - 14, yh); ctx.lineTo(s.x + 14, yh); ctx.stroke();
  ctx.font = '700 11px system-ui, -apple-system, Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = cc.side === 'right' ? 'right' : 'left';
  const tx = cc.side === 'right' ? s.x - 18 : s.x + 18;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText('HOVER', tx, yh);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('HOVER', tx, yh);
  // Handle.
  ctx.globalAlpha = leverHeld ? 0.95 : 0.8;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(s.x - 22, yl - 9, 44, 18, 9);
  else ctx.rect(s.x - 22, yl - 9, 44, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(s.x - 12, yl - 1, 24, 2);
  // "LIFT" under the slider.
  ctx.globalAlpha = 0.7;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeText('LIFT', s.x, s.bottom + 16);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('LIFT', s.x, s.bottom + 16);
  ctx.restore();

  // The cyclic: the floating joystick, or a faint ring where it would go.
  if (stick) {
    drawJoystick(r, { x0: stick.x0, y0: stick.y0, x: stick.x, y: stick.y });
  } else {
    const R = r.config.joystickRadiusPx;
    const gx = cc.side === 'right' ? Math.max(R + 20, r.w * 0.3) : Math.min(r.w - R - 20, r.w * 0.7);
    const gy = Math.min(r.h - R - 24, r.h * 0.68);
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(gx + cc.stickX * R, gy - cc.stickY * R, R * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
