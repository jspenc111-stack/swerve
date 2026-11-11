// groundFx.js — things drawn on the ground in Classic, 3D Flight and 3D Heli:
// speed streaks, the Lagoon's water sparkle and wake, the Night level's
// glowing grid, the Storm's rain splashes, and soft shadows.
//
// Everything here is look only, and nothing is created per frame: positions
// are worked out from the clock and from fixed "hash" numbers.
//
// Each function takes a small geometry record `g` describing the camera:
//   { ctx, cx (screen centre x), hY (horizon y), f (focal length),
//     camX, camZ, camH (camera height above the ground), w, h, far }
// A ground point (x, 0, z) lands on screen at
//   x: cx + (x − camX) · f / (z − camZ)      y: hY + camH · f / (z − camZ)

import { drawGlowOval, shadowSprite } from './sprites.js';

function hash01(n) {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

// ---- Speed streaks ------------------------------------------------------------
// Short faint lines on the ground that rush toward the camera. They're fixed
// to the ground (so they slide past as you steer), and get longer and
// brighter with speed and boost. Off on Lite.
const STREAK_RANGE = 44;   // how far ahead they appear
const STREAK_LANE = 2.6;   // sideways spacing of the lanes they run in
export function drawSpeedStreaks(g, speed, boost, color) {
  const ctx = g.ctx;
  const len = 1.2 + speed * 0.07 + boost * 5;
  const strength = Math.min(1, 0.16 + speed * 0.004 + boost * 0.3);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  const first = Math.floor((g.camX - 16) / STREAK_LANE);
  for (let i = 0; i < 13; i++) {
    const lane = first + i;
    const x = (lane + 0.5 * hash01(lane * 3.17)) * STREAK_LANE - g.camX;
    // Each lane has one streak, repeating every STREAK_RANGE units.
    let z = (hash01(lane * 12.9898) * STREAK_RANGE - g.camZ) % STREAK_RANGE;
    if (z < 0) z += STREAK_RANGE;
    z += 1.4;
    const z2 = z + len;
    const k1 = g.f / z, k2 = g.f / z2;
    ctx.globalAlpha = strength * (1 - z / (STREAK_RANGE + 1.4));
    ctx.beginPath();
    ctx.moveTo(g.cx + x * k1, g.hY + g.camH * k1);
    ctx.lineTo(g.cx + x * k2, g.hY + g.camH * k2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- Water (Lagoon) -----------------------------------------------------------
// Gentle sparkle glints that drift. Off on Lite.
const GLINT_X = 4.5, GLINT_Z = 5.5;
export function drawWaterGlints(g, time) {
  const ctx = g.ctx;
  ctx.fillStyle = '#ffffff';
  const i0 = Math.floor((g.camX - 22) / GLINT_X);
  const j0 = Math.floor((g.camZ + 3) / GLINT_Z);
  for (let j = 0; j < 11; j++) {
    for (let i = 0; i < 10; i++) {
      const cellX = i0 + i, cellZ = j0 + j;
      const seed = cellX * 12.9898 + cellZ * 78.233;
      if (hash01(seed) > 0.42) continue;
      const tw = Math.sin(time * (1.2 + 2 * hash01(seed * 1.7)) + seed);
      if (tw < 0.2) continue;
      const x = (cellX + hash01(seed * 2.3)) * GLINT_X + 0.5 * Math.sin(time * 0.5 + seed) - g.camX;
      const z = (cellZ + hash01(seed * 3.1)) * GLINT_Z - g.camZ;
      if (z < 6) continue;
      const k = g.f / z;
      const wd = Math.min(26, Math.max(2, 0.5 * k));
      ctx.globalAlpha = 0.5 * (tw - 0.2) * Math.max(0, 1 - z / 62);
      ctx.fillRect(g.cx + x * k - wd / 2, g.hY + g.camH * k, wd, Math.max(1, 0.04 * k));
    }
  }
  ctx.globalAlpha = 1;
}

// A subtle V-shaped wake on the water behind the ship. shipX/shipZ: the ship's
// place relative to the camera; lean: -1 … 1, which way it's sliding.
export function drawWake(g, shipX, shipZ, lean, time) {
  const ctx = g.ctx;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const z = shipZ - 0.25 - t * 1.25;
      const x = shipX + side * (0.2 + t * 0.75) - lean * t * t * 0.9 + 0.04 * Math.sin(time * 7 + t * 9 + side);
      const k = g.f / z;
      const sx = g.cx + x * k, sy = g.hY + g.camH * k;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

// ---- Rain splashes (Storm) ----------------------------------------------------
// Small rings that pop up on the wet ground near the camera. Off on Lite.
const SPLASHES = 9;
const SPLASH_SEC = 0.45;
export function drawRainSplashes(g, time) {
  const ctx = g.ctx;
  ctx.strokeStyle = '#e6eef0';
  ctx.lineWidth = 1;
  for (let i = 0; i < SPLASHES; i++) {
    const clock = time / SPLASH_SEC + i / SPLASHES;
    const n = Math.floor(clock);
    const t = clock - n;
    const seed = n * 7.13 + i * 31.7;
    const x = (hash01(seed) - 0.5) * 16;
    const z = 2.2 + hash01(seed * 1.9) * 16;
    const k = g.f / z;
    const rad = (0.08 + 0.3 * t) * k;
    ctx.globalAlpha = 0.4 * (1 - t);
    ctx.beginPath();
    ctx.ellipse(g.cx + x * k, g.hY + g.camH * k, rad, rad * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- Neon grid (Night) ---------------------------------------------------------
// Brighter, glowing grid lines with a pulse of light that travels toward the
// player. Stays on in Lite (it is the level's ground).
const PULSE_SPEED = 38;    // units per second
export function drawNeonGrid(g, color, glowColor, time, strength = 1) {
  const ctx = g.ctx;
  const far = g.far;
  const spacing = 8;
  // Where the pulse is, as a distance ahead of the camera.
  const pulse = far - ((time * PULSE_SPEED) % (far + 20));
  ctx.lineWidth = 1;
  let z = Math.ceil((g.camZ + 1) / spacing) * spacing;
  for (; z - g.camZ < far; z += spacing) {
    const rz = z - g.camZ;
    const y = g.hY + (g.camH * g.f) / rz;
    const fade = Math.max(0, 1 - rz / far);
    const lit = Math.max(0, 1 - Math.abs(rz - pulse) / 9);
    ctx.strokeStyle = lit > 0.05 ? glowColor : color;
    ctx.globalAlpha = Math.min(1, (0.55 + 0.45 * lit) * fade * 1.4) * strength;
    ctx.lineWidth = 1 + 1.6 * lit;
    ctx.beginPath();
    ctx.moveTo(-g.w, y);
    ctx.lineTo(g.w * 2, y);
    ctx.stroke();
  }
  // Lines running into the distance.
  const xs = 4;
  const near = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8 * strength;
  ctx.beginPath();
  for (let x = Math.floor((g.camX - 60) / xs) * xs; x <= g.camX + 60; x += xs) {
    const rx = x - g.camX;
    ctx.moveTo(g.cx + (rx * g.f) / near, g.hY + (g.camH * g.f) / near);
    ctx.lineTo(g.cx + (rx * g.f) / far, g.hY + (g.camH * g.f) / far);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---- Shadows ------------------------------------------------------------------
// A soft dark oval on the ground under something at (x, z) (world units).
// halfW/halfD: its half width and half depth; alpha: how dark (0–1).
// Call with ctx.globalAlpha at 1; it is left at 1.
export function drawGroundShadow(g, x, z, halfW, halfD, alpha) {
  const rz = z - g.camZ;
  const zn = rz - halfD, zf = rz + halfD;
  if (zn <= 0.4 || !(alpha > 0.01)) return;
  const kn = g.f / zn, kf = g.f / zf, k = g.f / rz;
  const ry = Math.max(1.5, (g.camH * (kn - kf)) * 0.62);
  const ctx = g.ctx;
  ctx.globalAlpha = alpha;
  drawGlowOval(ctx, shadowSprite(), g.cx + (x - g.camX) * k, g.hY + g.camH * k, halfW * 1.25 * k, ry);
  ctx.globalAlpha = 1;
}
