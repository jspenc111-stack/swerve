// chopperModel.js — drawing the 3D Heli helicopter, its downwash and the
// helipad (render3d.js calls these). Same projection and flat-shaded,
// low-poly style as the 3D Flight jet:
//   screenX = centerX + (x - cameraX) * f / z
//   screenY = horizonY + (cameraY - y) * f / z
//
// The design is original: a rounded pod with a big wraparound canopy, a
// tapering tail boom with a fin, a small stabilizer and a tail rotor, two
// skids on struts, and a four-blade main rotor on a short mast.
// Model units are world units (x right, y up, z forward), centred on the
// body. None of this changes the hitbox (that's in chopper.js).

import { mixColor } from './levels.js';
import { glowSprite, drawGlow } from './sprites.js';

const DEG = Math.PI / 180;
const SHADE_STEPS = 20;
const NEAR = 0.6;

// ---- Look state (animation only) -------------------------------------------

export function createChopperLook() {
  return {
    pitch: 0,        // radians, nose up is positive
    roll: 0,         // radians, banking right is positive
    tiltX: 0,        // rotor disc tilt from the stick
    tiltY: 0,
    rotorAngle: 0,
    rotorRate: 0,    // turns per second
    tailAngle: 0,
    clock: 0,
    dust: [],        // downwash particles on the ground: { x, z, vx, vz, life, max }
    dustAcc: 0,
    wash: 0,         // downwash strength 0…1
  };
}

export function resetChopperLook(look) {
  look.pitch = 0;
  look.roll = 0;
  look.tiltX = 0;
  look.tiltY = 0;
  look.rotorRate = 0;
  look.dust.length = 0;
  look.dustAcc = 0;
  look.wash = 0;
}

// Call every frame with the real frame time (0 while paused).
export function updateChopperLook(look, c, cfg, dt) {
  if (!(dt > 0)) return;
  look.clock += dt;
  const ease = (k) => 1 - Math.exp(-k * dt);
  // Nose dips when speeding up, lifts when braking; banks into slides.
  const accel = c.crashed ? 0 : c.accel || 0;
  const pitchTarget = -Math.max(-1, Math.min(1, accel / cfg.chopperForwardAccel)) * cfg.chopperPitchDeg * DEG;
  look.pitch += (pitchTarget - look.pitch) * ease(4);
  const rollTarget = (c.vx / cfg.chopperMaxSideSpeed) * cfg.chopperRollDeg * DEG;
  look.roll += (rollTarget - look.roll) * ease(6);
  look.tiltX += (c.stickX * 7 * DEG - look.tiltX) * ease(10);
  look.tiltY += (-c.stickY * 7 * DEG - look.tiltY) * ease(10);
  // Rotor: idles on the ground, spins faster with more collective.
  const rateTarget = c.crashed ? 0 : 3.5 + 6 * c.lever;
  look.rotorRate += (rateTarget - look.rotorRate) * ease(c.crashed ? 1.5 : 2.5);
  look.rotorAngle = (look.rotorAngle + look.rotorRate * dt * Math.PI * 2) % (Math.PI * 2);
  look.tailAngle = (look.tailAngle + look.rotorRate * 4.3 * dt * Math.PI * 2) % (Math.PI * 2);

  // Downwash: a ring of dust spreading on the ground when low (stronger
  // with more collective).
  const height = c.y - cfg.flightMinAltitude;
  const lowness = Math.max(0, 1 - height / 3);
  const wash = c.crashed ? 0 : lowness * (0.25 + 0.75 * c.lever);
  look.wash += (wash - look.wash) * ease(5);
  look.dustAcc += 70 * look.wash * dt;
  while (look.dustAcc >= 1 && look.dust.length < 140) {
    look.dustAcc -= 1;
    const a = Math.random() * Math.PI * 2;
    const sp = 2.5 + 3.5 * look.wash * (0.6 + 0.4 * Math.random());
    const r0 = 0.3 + 0.4 * Math.random();
    const life = 0.5 + 0.4 * Math.random();
    look.dust.push({
      x: c.x + Math.cos(a) * r0, z: c.distance + Math.sin(a) * r0,
      vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life, max: life,
    });
  }
  if (look.dustAcc > 1) look.dustAcc = 1;
  let w = 0;
  for (let i = 0; i < look.dust.length; i++) {
    const p = look.dust[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.vx *= Math.exp(-1.5 * dt);
    p.vz *= Math.exp(-1.5 * dt);
    look.dust[w++] = p;
  }
  look.dust.length = w;
}

// ---- Projection --------------------------------------------------------------

function proj(r, cam, x, y, z, out) {
  const k = r.f / Math.max(0.05, z - cam.z);
  out.x = r.cx + (x - cam.x) * k;
  out.y = cam.hY + (cam.y - y) * k;
  return out;
}

// ---- Helipad -------------------------------------------------------------------

const PAD_R = 2.2;
const PAD_PTS = 28;
const PP = Array.from({ length: PAD_PTS }, () => ({ x: 0, y: 0 }));
const HP = Array.from({ length: 12 }, () => ({ x: 0, y: 0 }));

// A flat round pad on the ground with a ring and a simple "H".
export function drawHelipad(r, cam, padZ) {
  if (padZ + PAD_R - cam.z <= NEAR || padZ - PAD_R - cam.z > r.config.fogDistance) return;
  const ctx = r.ctx;
  const circle = (radius, color, fill) => {
    let ok = true;
    for (let i = 0; i < PAD_PTS; i++) {
      const a = (i / PAD_PTS) * Math.PI * 2;
      const z = padZ + Math.sin(a) * radius;
      if (z - cam.z <= NEAR) ok = false;
      proj(r, cam, Math.cos(a) * radius, 0.01, Math.max(z, cam.z + NEAR), PP[i]);
    }
    if (!ok && fill) { /* clipped near the camera: still fine to draw */ }
    ctx.beginPath();
    for (let i = 0; i < PAD_PTS; i++) {
      if (i === 0) ctx.moveTo(PP[i].x, PP[i].y); else ctx.lineTo(PP[i].x, PP[i].y);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.stroke(); }
  };
  circle(PAD_R, 'rgba(48,52,60,0.92)', true);
  ctx.lineWidth = Math.max(1.5, (0.12 * r.f) / Math.max(1, padZ - cam.z));
  circle(PAD_R * 0.86, '#f4d35e', false);
  // The "H": two uprights and a crossbar, as flat quads on the ground.
  const bar = (x0, z0, x1, z1) => {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const bx = i === 0 || i === 3 ? x0 : x1;
      const bz = i < 2 ? z0 : z1;
      proj(r, cam, bx, 0.02, Math.max(padZ + bz, cam.z + NEAR), HP[i]);
      if (i === 0) ctx.moveTo(HP[i].x, HP[i].y); else ctx.lineTo(HP[i].x, HP[i].y);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#ffffff';
  bar(-0.75, -0.95, -0.45, 0.95);
  bar(0.45, -0.95, 0.75, 0.95);
  bar(-0.45, -0.15, 0.45, 0.15);
}

// ---- Downwash ------------------------------------------------------------------

const DP = { x: 0, y: 0 };
export function drawDownwash(r, cam, c, look) {
  if (look.wash < 0.02 && look.dust.length === 0) return;
  const ctx = r.ctx;
  // Ripples: rings spreading out on the ground below.
  if (look.wash > 0.02 && c.distance - cam.z > NEAR) {
    const k = r.f / (c.distance - cam.z);
    proj(r, cam, c.x, 0.02, c.distance, DP);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const t = (look.clock * 1.6 + i / 3) % 1;
      const rad = (0.6 + 2.6 * t) * k;
      ctx.globalAlpha = look.wash * 0.5 * (1 - t);
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(DP.x, DP.y, rad, rad * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Dust specks.
  ctx.fillStyle = 'rgba(235,225,205,1)';
  for (let i = 0; i < look.dust.length; i++) {
    const p = look.dust[i];
    if (p.z - cam.z <= NEAR) continue;
    proj(r, cam, p.x, 0.05 + 0.3 * (1 - p.life / p.max), p.z, DP);
    const k = r.f / (p.z - cam.z);
    const s = Math.max(1.5, 0.09 * k);
    ctx.globalAlpha = 0.55 * (p.life / p.max);
    ctx.fillRect(DP.x - s / 2, DP.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

// ---- The model -----------------------------------------------------------------

const V = [];
const POLYS = [];
function v(x, y, z) { V.push([x, y, z]); return V.length - 1; }
function poly(mat, ...idx) { POLYS.push({ idx, mat }); }

// Drawn size of this model (scaled to the config sizes when drawn).
const MODEL_LENGTH = 2.2;
const MODEL_WIDTH = 0.7;
const MODEL_HEIGHT = 0.9;
const MAST_TOP = 0.6;
const ROTOR_R = 1.1;

(function buildChopper() {
  // The pod: hexagonal cross-sections from nose to the start of the tail.
  // [z, half width, top, bottom]
  const sections = [
    [0.86, 0.09, 0.02, -0.12],
    [0.66, 0.26, 0.22, -0.3],
    [0.32, 0.35, 0.4, -0.4],
    [-0.08, 0.34, 0.4, -0.38],
    [-0.38, 0.2, 0.28, -0.2],
    [-0.5, 0.11, 0.2, -0.04],
  ];
  // Then the tail boom, tapering to the fin.
  const boom = [
    [-0.85, 0.075, 0.16, 0.0],
    [-1.18, 0.045, 0.13, 0.04],
  ];
  const all = sections.concat(boom);
  const rings = all.map(([z, hw, t, b]) => [
    v(0, t, z), v(hw * 0.86, (t + b) / 2 + (t - b) * 0.3, z), v(hw, (t + b) / 2 - (t - b) * 0.25, z),
    v(0, b, z), v(-hw, (t + b) / 2 - (t - b) * 0.25, z), v(-hw * 0.86, (t + b) / 2 + (t - b) * 0.3, z),
  ]);
  const nose = v(0, -0.04, 0.95);
  // Nose cap: glass on top (part of the canopy), body below.
  for (let i = 0; i < 6; i++) poly(i === 0 || i === 5 || i === 1 || i === 4 ? 'glass' : 'body', nose, rings[0][i], rings[0][(i + 1) % 6]);
  for (let s = 0; s < rings.length - 1; s++) {
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      // The big wraparound canopy: the top and upper sides of the front pod.
      let mat = s >= sections.length - 1 ? 'boom' : 'body';
      if (s <= 1 && (i === 0 || i === 5 || i === 1 || i === 4)) mat = 'glass';
      if (s === 2 && (i === 0 || i === 5)) mat = 'glass';
      poly(mat, rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i]);
    }
  }
  poly('boom', ...rings[rings.length - 1].slice().reverse());
  // Engine housing on top, behind the mast.
  const eh = [v(-0.16, 0.4, 0.12), v(0.16, 0.4, 0.12), v(0.14, 0.4, -0.34), v(-0.14, 0.4, -0.34)];
  const et = [v(-0.12, 0.52, 0.06), v(0.12, 0.52, 0.06), v(0.1, 0.48, -0.3), v(-0.1, 0.48, -0.3)];
  poly('dark', et[0], et[1], et[2], et[3]);
  poly('dark', eh[0], eh[1], et[1], et[0]);
  poly('dark', eh[1], eh[2], et[2], et[1]);
  poly('dark', eh[3], eh[0], et[0], et[3]);
  poly('dark', eh[2], eh[3], et[3], et[2]);
  // Vertical fin (swept) and a small horizontal stabilizer.
  poly('accent', v(0, 0.12, -1.0), v(0, 0.52, -1.16), v(0, 0.52, -1.26), v(0, 0.08, -1.2));
  poly('accent', v(0, 0.06, -1.04), v(0, -0.14, -1.14), v(0, -0.14, -1.2), v(0, 0.05, -1.19));
  poly('accent', v(-0.28, 0.07, -0.9), v(0.28, 0.07, -0.9), v(0.28, 0.07, -1.0), v(-0.28, 0.07, -1.0));
  // Belly stripe in the level's ship color.
  const s3 = rings[2], s4 = rings[3];
  poly('accent', s3[2], s3[3], s4[3], s4[2]);
  poly('accent', s3[3], s3[4], s4[4], s4[3]);
})();

const T = V.map(() => ({ x: 0, y: 0, z: 0, sx: 0, sy: 0 }));
const LIGHT = (() => { const l = Math.hypot(-0.4, 1, -0.3); return [-0.4 / l, 1 / l, -0.3 / l]; })();
const order = POLYS.map((_, i) => i);
const dist = new Float64Array(POLYS.length);
const byDist = (a2, b2) => dist[b2] - dist[a2];

function materials(s, ship) {
  if (s.chopperKey === ship && s.chopperMats) return s.chopperMats;
  s.chopperKey = ship;
  const body = mixColor(ship, '#c5ccd5', 0.42); // metallic, tinted by the level's ship color
  const bases = {
    body,
    boom: mixColor(body, '#59616c', 0.3),
    accent: ship,
    glass: '#1c3150',
    dark: '#474e58',
  };
  const mats = {};
  for (const [name, base] of Object.entries(bases)) {
    const dark = mixColor(base, '#000000', 0.55);
    const light = mixColor(base, '#ffffff', name === 'glass' ? 0.6 : 0.45);
    mats[name] = [];
    for (let i = 0; i < SHADE_STEPS; i++) {
      const b = i / (SHADE_STEPS - 1);
      mats[name].push(b < 0.6 ? mixColor(dark, base, b / 0.6) : mixColor(base, light, (b - 0.6) / 0.4));
    }
  }
  s.chopperMats = mats;
  return mats;
}

// Rotate a model point (roll, then pitch) and scale it to the config size.
function makeRot(cfg, look) {
  const sx = cfg.chopperBodyWidth / MODEL_WIDTH;
  const sy = cfg.chopperBodyHeight / MODEL_HEIGHT;
  const sz = cfg.chopperLength / MODEL_LENGTH;
  const cr = Math.cos(look.roll), sr = Math.sin(look.roll);
  const cp = Math.cos(look.pitch), sp = Math.sin(look.pitch);
  return (x, y, z, o) => {
    x *= sx; y *= sy; z *= sz;
    const x1 = x * cr + y * sr, y1 = -x * sr + y * cr;
    o.x = x1;
    o.y = y1 * cp + z * sp;
    o.z = -y1 * sp + z * cp;
    return o;
  };
}

let lightRed = null, lightGreen = null, lightWhite = null;
const Q = {};
const A = {}, B = {}, C = {}, D = {};
const W1 = {}, W2 = {};

// Draw the helicopter at c (x, y, distance). cam: { x, y, z, hY }.
export function drawChopperModel(r, s, cam, c, look, palette) {
  const { ctx, config: cfg } = r;
  if (c.distance - cam.z <= NEAR) return;
  const mats = materials(s, palette.ship);
  const rot = makeRot(cfg, look);
  const px = c.x, py = c.y, pz = c.distance;
  const toScreen = (lx, ly, lz, o) => { rot(lx, ly, lz, W1); return proj(r, cam, px + W1.x, py + W1.y, pz + W1.z, o); };

  // Skids and struts first (the body hides them from above).
  ctx.lineCap = 'round';
  const kBody = r.f / (pz - cam.z);
  ctx.strokeStyle = '#3a3f47';
  for (let side = -1; side <= 1; side += 2) {
    const x = 0.33 * side;
    ctx.lineWidth = Math.max(1.5, 0.06 * kBody);
    ctx.beginPath();
    toScreen(x, -0.56, -0.42, A); ctx.moveTo(A.x, A.y);
    toScreen(x, -0.6, 0.48, B); ctx.lineTo(B.x, B.y);
    toScreen(x, -0.5, 0.64, C); ctx.lineTo(C.x, C.y);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.04 * kBody);
    ctx.beginPath();
    for (let q = 0; q < 2; q++) {
      const z = q === 0 ? 0.3 : -0.22;
      toScreen(0.2 * side, -0.3, z, A); toScreen(x, -0.58, z, B);
      ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    }
    ctx.stroke();
  }

  // Body faces, farthest first, flat-shaded.
  for (let i = 0; i < V.length; i++) {
    const t = rot(V[i][0], V[i][1], V[i][2], T[i]);
    proj(r, cam, px + t.x, py + t.y, pz + t.z, Q);
    t.sx = Q.x;
    t.sy = Q.y;
  }
  const ex = cam.x - px, ey = cam.y - py, ez = cam.z - pz;
  for (let i = 0; i < POLYS.length; i++) {
    const idx = POLYS[i].idx;
    let mx = 0, my = 0, mz = 0;
    for (let q = 0; q < idx.length; q++) { const n = idx[q]; mx += T[n].x; my += T[n].y; mz += T[n].z; }
    mx /= idx.length; my /= idx.length; mz /= idx.length;
    dist[i] = (mx - ex) ** 2 + (my - ey) ** 2 + (mz - ez) ** 2;
    order[i] = i;
  }
  order.sort(byDist);
  ctx.lineJoin = 'round';
  for (let n = 0; n < order.length; n++) {
    const pl = POLYS[order[n]];
    const idx = pl.idx;
    const P0 = T[idx[0]], P1 = T[idx[1]], P2 = T[idx[2]];
    const ux = P1.x - P0.x, uy = P1.y - P0.y, uz = P1.z - P0.z;
    const wx = P2.x - P0.x, wy = P2.y - P0.y, wz = P2.z - P0.z;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * (ex - P0.x) + ny * (ey - P0.y) + nz * (ez - P0.z) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const lambert = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl);
    const shade = 0.22 + 0.78 * lambert;
    const color = mats[pl.mat][Math.round(shade * (SHADE_STEPS - 1))];
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < idx.length; i++) {
      const t = T[idx[i]];
      if (i === 0) ctx.moveTo(t.sx, t.sy); else ctx.lineTo(t.sx, t.sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Tail rotor: two blades spinning on the right of the fin.
  const ta = look.tailAngle;
  const trc = [0.06, 0.3, -1.2];
  ctx.strokeStyle = 'rgba(40,44,52,0.85)';
  ctx.lineWidth = Math.max(1.2, 0.035 * kBody);
  ctx.beginPath();
  for (const off of [0, Math.PI]) {
    const a = ta + off;
    toScreen(trc[0], trc[1], trc[2], A);
    toScreen(trc[0], trc[1] + Math.cos(a) * 0.22, trc[2] + Math.sin(a) * 0.22, B);
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();

  // Main rotor: mast, hub, and four spinning blades; the disc tilts with the stick.
  const hubY = MAST_TOP;
  const ct = Math.cos(look.tiltY), st = Math.sin(look.tiltY);
  const cx2 = Math.cos(look.tiltX), sx2 = Math.sin(look.tiltX);
  const rk = cfg.chopperRotorDiameter / (2 * ROTOR_R);
  // A point on the disc (radius rr, angle a, along the blade width w) in model units.
  const discPt = (rr, a, w, o) => {
    let x = Math.cos(a) * rr - Math.sin(a) * w;
    let z = Math.sin(a) * rr + Math.cos(a) * w;
    let y = 0;
    // Tilt forward/back (about x), then sideways (about z).
    const y1 = y * ct - z * st, z1 = y * st + z * ct;
    const x2 = x * cx2 + y1 * sx2, y2 = -x * sx2 + y1 * cx2;
    x = x2; y = y2 + hubY; z = z1;
    // Undo the body's scaling so the rotor is chopperRotorDiameter across.
    return toScreen(x * rk * (MODEL_WIDTH / cfg.chopperBodyWidth), y, z * rk * (MODEL_LENGTH / cfg.chopperLength), o);
  };
  // Mast.
  toScreen(0, 0.5, 0.0, A);
  toScreen(0, hubY, 0.0, B);
  ctx.strokeStyle = '#30353c';
  ctx.lineWidth = Math.max(1.5, 0.07 * kBody);
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  // A faint see-through disc when the blades spin fast.
  const discAlpha = Math.max(0, Math.min(1, (look.rotorRate - 5) / 4)) * 0.16;
  if (discAlpha > 0.005) {
    ctx.globalAlpha = discAlpha;
    ctx.fillStyle = '#9aa3ad';
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      discPt(ROTOR_R, (i / 24) * Math.PI * 2, 0, W2);
      if (i === 0) ctx.moveTo(W2.x, W2.y); else ctx.lineTo(W2.x, W2.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Blades (slightly see-through when spinning fast, like motion blur).
  // Mid-grey with a light edge, so they show on light and dark skies.
  ctx.globalAlpha = 1 - Math.max(0, Math.min(0.45, (look.rotorRate - 4) * 0.08));
  ctx.fillStyle = '#5d646f';
  ctx.strokeStyle = 'rgba(235,240,245,0.55)';
  ctx.lineWidth = 1;
  for (let b = 0; b < 4; b++) {
    const a = look.rotorAngle + (b * Math.PI) / 2;
    discPt(0.1, a, -0.05, A); discPt(ROTOR_R, a, -0.045, B); discPt(ROTOR_R, a, 0.045, C); discPt(0.1, a, 0.05, D);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Hub.
  discPt(0, 0, 0, A);
  ctx.fillStyle = '#5b626d';
  ctx.beginPath(); ctx.arc(A.x, A.y, Math.max(2, 0.08 * kBody), 0, Math.PI * 2); ctx.fill();

  // Lights: red on the left, green on the right, white strobe on the tail.
  const strobe = (look.clock * 1000) % 1400 < 70;
  ctx.globalCompositeOperation = 'lighter';
  // (Cached glow pictures: no gradients are built per frame.)
  if (!lightRed) {
    lightRed = glowSprite('rgba(255,60,60,1)', 'rgba(255,60,60,0.6)', 0.4);
    lightGreen = glowSprite('rgba(60,255,110,1)', 'rgba(60,255,110,0.6)', 0.4);
    lightWhite = glowSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0.6)', 0.4);
  }
  toScreen(-0.36, -0.05, 0.05, A);
  drawGlow(ctx, lightRed, A.x, A.y, 5);
  toScreen(0.36, -0.05, 0.05, A);
  drawGlow(ctx, lightGreen, A.x, A.y, 5);
  if (strobe) {
    toScreen(0, 0.53, -1.22, A);
    drawGlow(ctx, lightWhite, A.x, A.y, 10);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'butt';
}
