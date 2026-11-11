// fx.js — draws the particles, the ship's trail, the crash shockwave, the
// boost speed lines and the level-change ring for Classic, 3D Flight and
// 3D Heli. (The particles themselves live in particles.js, which is pure
// logic; this file only draws them.)
//
// Everything here is look only and nothing is created per frame.
//
// `g` is the same camera record groundFx.js uses:
//   { ctx, cx, hY, f, camX, camZ, camH (the camera's height), w, h }
// A point (x, y, z) lands on screen at
//   x: cx + (x − camX) · f / (z − camZ)     y: hY + (camH − y) · f / (z − camZ)

import { KIND, trailIndex } from './particles.js';

const NEAR = 0.5;

// Draw the live particles. ambient = true draws only dust and embers (call it
// before the obstacles, so they never cover one); false draws the rest.
export function drawParticles(g, ps, ambient) {
  const ctx = g.ctx;
  const items = ps.items;
  for (let i = 0; i < ps.count; i++) {
    const p = items[i];
    const isAmbient = p.kind === KIND.dust || p.kind === KIND.ember;
    if (isAmbient !== ambient) continue;
    const rz = p.z - g.camZ;
    if (rz <= NEAR) continue;
    const k = g.f / rz;
    const sx = g.cx + (p.x - g.camX) * k;
    const sy = g.hY + (g.camH - p.y) * k;
    if (sx < -40 || sx > g.w + 40 || sy < -40 || sy > g.h + 40) continue;
    const size = Math.max(1.5, p.size * k);
    if (p.kind === KIND.spark) {
      // A bright streak along the way it's moving.
      const tx = sx - p.vx * 0.035 * k, ty = sy + p.vy * 0.035 * k;
      ctx.globalAlpha = Math.min(1, p.alpha * 1.6);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.2, size * 0.5);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    } else if (p.kind === KIND.shard) {
      // A spinning triangle.
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      ctx.globalAlpha = Math.min(1, p.alpha * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(sx + c * size, sy + s * size);
      ctx.lineTo(sx - c * size * 0.5 - s * size * 0.6, sy - s * size * 0.5 + c * size * 0.6);
      ctx.lineTo(sx - c * size * 0.5 + s * size * 0.45, sy - s * size * 0.5 - c * size * 0.45);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === KIND.bit) {
      // A small tumbling cube: a square with a lighter top strip.
      const squash = 0.75 + 0.25 * Math.cos(p.rot);
      ctx.globalAlpha = Math.min(1, p.alpha * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - size / 2, sy - (size * squash) / 2, size, size * squash);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha *= 0.3;
      ctx.fillRect(sx - size / 2, sy - (size * squash) / 2, size, Math.max(1, size * 0.2));
    } else if (p.kind === KIND.ember) {
      ctx.globalAlpha = p.alpha * (0.5 + 0.5 * Math.sin(p.rot * 9 + p.life * 14)) * 0.9;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    } else {
      // dust: fades in and out
      const a = p.alpha < 0.5 ? p.alpha * 2 : (1 - p.alpha) * 2;
      ctx.globalAlpha = 0.45 * a;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }
  }
  ctx.globalAlpha = 1;
}

// The engine trail: a ribbon from (ax, ay) on screen (the engine) back along
// where the ship has been, so it curves when you steer.
//   trail: from particles.js; offX/offY/offZ: the engine's place relative to
//   the ship's recorded position; length: how far back it reaches (world
//   units); width: its width at the engine (world units).
export function drawTrailRibbon(g, trail, ax, ay, offX, offY, offZ, length, width, color, alpha) {
  if (trail.count < 2 || !(alpha > 0.01)) return;
  const ctx = g.ctx;
  const head = trailIndex(trail, 0);
  const z0 = trail.z[head];
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  const k0 = g.f / Math.max(NEAR, z0 + offZ - g.camZ);
  ctx.moveTo(ax - (width / 2) * k0, ay);
  let n = 0;
  // Down one side…
  for (let i = 1; i < trail.count; i++) {
    const j = trailIndex(trail, i);
    const back = z0 - trail.z[j];
    if (back > length) break;
    const rz = trail.z[j] + offZ - g.camZ;
    if (rz <= NEAR) break;
    const k = g.f / rz;
    const half = (width / 2) * (1 - back / length);
    ctx.lineTo(g.cx + (trail.x[j] + offX - g.camX - half) * k, g.hY + (g.camH - trail.y[j] - offY) * k);
    n = i;
  }
  // …and back up the other.
  for (let i = n; i >= 1; i--) {
    const j = trailIndex(trail, i);
    const back = z0 - trail.z[j];
    const k = g.f / (trail.z[j] + offZ - g.camZ);
    const half = (width / 2) * (1 - back / length);
    ctx.lineTo(g.cx + (trail.x[j] + offX - g.camX + half) * k, g.hY + (g.camH - trail.y[j] - offY) * k);
  }
  ctx.lineTo(ax + (width / 2) * k0, ay);
  ctx.closePath();
  if (n > 0) ctx.fill();
  ctx.globalAlpha = 1;
}

// A thin streak (wingtip trails during hard turns): a line through the trail.
export function drawTrailLine(g, trail, ax, ay, offX, offY, offZ, length, alpha) {
  if (trail.count < 2 || !(alpha > 0.02)) return;
  const ctx = g.ctx;
  const z0 = trail.z[trailIndex(trail, 0)];
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.3;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  for (let i = 1; i < trail.count; i++) {
    const j = trailIndex(trail, i);
    if (z0 - trail.z[j] > length) break;
    const rz = trail.z[j] + offZ - g.camZ;
    if (rz <= NEAR) break;
    const k = g.f / rz;
    ctx.lineTo(g.cx + (trail.x[j] + offX - g.camX) * k, g.hY + (g.camH - trail.y[j] - offY) * k);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// The crash shockwave: a bright ring spreading over the ground from (x, z).
// age: seconds since the crash.
const SHOCK_SEC = 0.55;
const SHOCK_PTS = 36;
export function drawShockwave(g, x, z, age) {
  if (!(age >= 0) || age > SHOCK_SEC) return;
  const ctx = g.ctx;
  const t = age / SHOCK_SEC;
  const rad = 0.4 + 5 * (1 - (1 - t) * (1 - t)); // world units
  // The ring lies flat on the ground, so each point is projected separately;
  // the part behind the camera is simply left out.
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= SHOCK_PTS; i++) {
    const a = (i / SHOCK_PTS) * Math.PI * 2;
    const rz = z + Math.sin(a) * rad - g.camZ;
    if (rz <= 0.7) { pen = false; continue; }
    const k = g.f / rz;
    const sx = g.cx + (x + Math.cos(a) * rad - g.camX) * k;
    const sy = g.hY + g.camH * k;
    if (pen) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    pen = true;
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.8 * (1 - t);
  ctx.lineWidth = 2 + 4 * (1 - t);
  ctx.stroke();
  ctx.globalAlpha = 0.28 * (1 - t);
  ctx.lineWidth = 8 + 12 * (1 - t);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Boost speed lines: faint streaks near the screen edges, pointing at the
// middle of the view. Off on Lite.
const LINES = 18;
export function drawSpeedLines(ctx, w, h, cx, cy, boost, time) {
  if (!(boost > 0.03)) return;
  const reach = Math.hypot(w, h) * 0.62;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < LINES; i++) {
    const a = (i / LINES) * Math.PI * 2 + 0.37 * Math.sin(i * 12.9898);
    // Each line slides outward and restarts.
    const t = (time * (1.6 + 0.8 * Math.abs(Math.sin(i * 4.1))) + i * 0.37) % 1;
    const r0 = reach * (0.62 + 0.3 * t);
    const r1 = r0 + reach * (0.06 + 0.1 * boost);
    const c = Math.cos(a), s = Math.sin(a);
    ctx.globalAlpha = 0.22 * boost * (1 - Math.abs(t - 0.5) * 2);
    ctx.beginPath();
    ctx.moveTo(cx + c * r0, cy + s * r0 * 0.9);
    ctx.lineTo(cx + c * r1, cy + s * r1 * 0.9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

// Level change: a soft ring of light sweeping out from the horizon.
// age: seconds since the level changed.
const RING_SEC = 0.9;
export function drawLevelRing(ctx, cx, hY, w, age) {
  if (!(age >= 0) || age > RING_SEC) return;
  const t = age / RING_SEC;
  const rad = w * 1.25 * (1 - (1 - t) * (1 - t));
  ctx.strokeStyle = '#ffffff';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = (pass === 0 ? 0.12 : 0.3) * (1 - t);
    ctx.lineWidth = pass === 0 ? 26 : 5;
    ctx.beginPath();
    ctx.ellipse(cx, hY, rad, rad * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
