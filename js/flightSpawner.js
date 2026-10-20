// flightSpawner.js — places obstacles and bonus rings for 3D Flight mode
// (pure logic, seeded random so tests repeat).
//
// Fairness works like Classic, in two directions: an invisible "open lane"
// runs ahead of the player. It is at least minGapWidth wide and minGapHeight
// tall, bends no more sharply (sideways or up/down) than the jet can follow,
// and stays near the player. No obstacle is ever allowed into it.
//
// Obstacles are boxes: centre x, bottom y, centre z, size w × h × d.
// New obstacles only appear beyond the fog distance.

import { levelForDistance, inBreather } from './levels.js';
import { makeRandom } from './spawner.js';

export function createFlightSpawner(config, levels, seed = 1) {
  const sp = {
    config,
    levels,
    boxes: [],
    rings: [],
    pool: [],
    random: makeRandom(seed),
    nextZ: 0,
    // Lane: current point (x, y, z), previous point (px, py, pz), slopes and targets.
    lane: { x: 0, y: 3, z: 0, px: 0, py: 3, pz: 0, sx: 0, sy: 0, tx: 0, ty: 0 },
    maxSlopeX: 0.2,
    maxSlopeY: 0.2,
    lastSpawned: 0,
    lastRings: 0,
    info: {},
  };
  resetFlightSpawner(sp, seed, 0, 0, config.flightStartAltitude);
  return sp;
}

export function resetFlightSpawner(sp, seed, startZ, playerX, playerY) {
  for (const b of sp.boxes) sp.pool.push(b);
  sp.boxes.length = 0;
  sp.rings.length = 0;
  sp.random = makeRandom(seed);
  sp.nextZ = startZ + sp.config.fogDistance;
  const L = sp.lane;
  L.x = L.px = playerX;
  L.y = L.py = clamp(playerY, laneMinY(sp), laneMaxY(sp));
  L.z = L.pz = sp.nextZ;
  L.sx = L.sy = L.tx = L.ty = 0;
  sp.lastSpawned = 0;
  sp.lastRings = 0;
}

// The lowest/highest the lane's centre may go, so the whole opening fits.
function laneMinY(sp) {
  return sp.config.flightMinAltitude + sp.config.minGapHeight / 2 + 0.2;
}
function laneMaxY(sp) {
  return sp.config.flightMaxAltitude - sp.config.minGapHeight / 2 - 0.2;
}

// Call every frame. `speed` is the fastest the player may be going (full boost).
export function updateFlightSpawner(sp, playerZ, playerX, playerY, speed) {
  const cfg = sp.config;
  cull(sp, playerZ, playerX);
  const boxesBefore = sp.boxes.length;
  const ringsBefore = sp.rings.length;
  const v = Math.max(speed, 1);
  sp.maxSlopeX = (cfg.laneSlopeFactor * cfg.maxSteerSpeed) / v;
  sp.maxSlopeY = (cfg.laneSlopeFactor * cfg.maxClimbSpeed) / v;
  const minZ = playerZ + cfg.fogDistance;
  if (sp.nextZ < minZ) sp.nextZ = minZ;
  while (sp.nextZ < minZ + cfg.spawnStep) {
    spawnRow(sp, sp.nextZ, playerX, playerY);
    sp.nextZ += cfg.spawnStep;
  }
  sp.lastSpawned = sp.boxes.length - boxesBefore;
  sp.lastRings = sp.rings.length - ringsBefore;
}

function cull(sp, playerZ, playerX) {
  const behind = playerZ - sp.config.flightCameraBack - 1;
  const side = sp.config.flightBandHalfWidth + 25;
  const boxes = sp.boxes;
  let w = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.z + b.d / 2 < behind || Math.abs(b.x - playerX) > side + b.w / 2) sp.pool.push(b);
    else boxes[w++] = b;
  }
  boxes.length = w;
  const rings = sp.rings;
  w = 0;
  for (let i = 0; i < rings.length; i++) if (rings[i].z >= behind) rings[w++] = rings[i];
  rings.length = w;
}

// ---- The open lane ---------------------------------------------------------

function advanceLane(sp, z, playerX, playerY) {
  const cfg = sp.config;
  const L = sp.lane;
  const dz = z - L.z;
  if (dz <= 0) return;
  const mx = sp.maxSlopeX;
  const my = sp.maxSlopeY;
  // Stay near the player, and inside the sky.
  if (L.x > playerX + cfg.laneLeash) L.tx = -0.8 * mx;
  else if (L.x < playerX - cfg.laneLeash) L.tx = 0.8 * mx;
  if (L.y > playerY + cfg.flightLaneLeashY) L.ty = -0.8 * my;
  else if (L.y < playerY - cfg.flightLaneLeashY) L.ty = 0.8 * my;
  if (L.y > laneMaxY(sp) - 0.5) L.ty = -Math.abs(L.ty || 0.6 * my);
  if (L.y < laneMinY(sp) + 0.5) L.ty = Math.abs(L.ty || 0.6 * my);
  L.tx = clamp(L.tx, -mx, mx);
  L.ty = clamp(L.ty, -my, my);
  const k = 0.5 * (dz / cfg.spawnStep);
  L.sx = clamp(L.sx + clamp(L.tx - L.sx, -k * mx, k * mx), -mx, mx);
  L.sy = clamp(L.sy + clamp(L.ty - L.sy, -k * my, k * my), -my, my);
  L.px = L.x;
  L.py = L.y;
  L.pz = L.z;
  L.x += L.sx * dz;
  L.y = clamp(L.y + L.sy * dz, laneMinY(sp), laneMaxY(sp));
  L.z = z;
}

// Lane centre at depth z: straight line through the last two lane points.
const P = { x: 0, y: 0 };
function laneAt(sp, z, out = P) {
  const L = sp.lane;
  const t = L.z > L.pz ? (z - L.pz) / (L.z - L.pz) : 0;
  out.x = L.px + (L.x - L.px) * t;
  out.y = L.py + (L.y - L.py) * t;
  return out;
}

function wander(sp, chance) {
  const L = sp.lane;
  if (sp.random() < chance) L.tx = (sp.random() * 2 - 1) * sp.maxSlopeX;
  if (sp.random() < chance) L.ty = (sp.random() * 2 - 1) * sp.maxSlopeY;
}

// The lane's opening over a box's depth: [x0, x1] × [y0, y1], with a margin.
const R = { x0: 0, x1: 0, y0: 0, y1: 0 };
function laneRect(sp, z0, z1, width, height) {
  const a = laneAt(sp, z0, { x: 0, y: 0 });
  const b = laneAt(sp, z1, { x: 0, y: 0 });
  const m = 0.15;
  R.x0 = Math.min(a.x, b.x) - width / 2 - m;
  R.x1 = Math.max(a.x, b.x) + width / 2 + m;
  R.y0 = Math.min(a.y, b.y) - height / 2 - m;
  R.y1 = Math.max(a.y, b.y) + height / 2 + m;
  return R;
}

function blocksLane(sp, x, y, z, w, h, d) {
  const cfg = sp.config;
  const r = laneRect(sp, z - d / 2, z + d / 2, cfg.minGapWidth, cfg.minGapHeight);
  return x + w / 2 > r.x0 && x - w / 2 < r.x1 && y + h > r.y0 && y < r.y1;
}

// ---- Rows ------------------------------------------------------------------

function spawnRow(sp, z0, playerX, playerY) {
  const cfg = sp.config;
  const z1 = z0 + cfg.spawnStep;
  if (inBreather(z0, cfg) || inBreather(z1, cfg)) {
    advanceLane(sp, z1, playerX, playerY);
    return;
  }
  const info = levelForDistance(z0, cfg, sp.levels, sp.info);
  const outer = info.level.flight;
  let pattern = outer;
  if (pattern.type === 'mixed') {
    pattern = outer.sequence[Math.floor(z0 / outer.segmentLength) % outer.sequence.length];
  }
  switch (pattern.type) {
    case 'pillars': pillarsRow(sp, pattern, z0, playerX, playerY); break;
    case 'frames': framesRow(sp, pattern, z0, playerX, playerY); break;
    default: floatersRow(sp, pattern, z0, playerX, playerY);
  }
  // Bonus rings sit in the middle of the open lane, so they can always be reached.
  const spacing = outer.ringSpacing || 0;
  if (spacing > 0) {
    const rz = Math.ceil(z0 / spacing) * spacing;
    if (rz >= z0 && rz < z1) {
      const p = laneAt(sp, rz);
      sp.rings.push({ x: p.x, y: p.y, z: rz, size: cfg.ringSize, taken: false, passed: false });
    }
  }
}

// Floating blocks of different sizes at every height.
function floatersRow(sp, p, z0, playerX, playerY) {
  const cfg = sp.config;
  wander(sp, 0.2);
  advanceLane(sp, z0 + cfg.spawnStep, playerX, playerY);
  const count = Math.floor(p.density) + (sp.random() < p.density % 1 ? 1 : 0);
  const band = cfg.flightBandHalfWidth;
  for (let i = 0; i < count; i++) {
    const s = p.minSize + sp.random() * (p.maxSize - p.minSize);
    const x = playerX + (sp.random() * 2 - 1) * band;
    const y = sp.random() * (cfg.flightMaxAltitude + 1 - s);
    const z = z0 + s / 2 + sp.random() * Math.max(0, cfg.spawnStep - s);
    if (!blocksLane(sp, x, y, z, s, s, s)) addBox(sp, x, y, z, s, s, s);
  }
}

// Towers rising from the ground. Fly between them, or over the short ones.
function pillarsRow(sp, p, z0, playerX, playerY) {
  const cfg = sp.config;
  wander(sp, 0.2);
  advanceLane(sp, z0 + cfg.spawnStep, playerX, playerY);
  if (sp.random() >= p.chance) return;
  const w = 1.4 + sp.random() * 1.2;
  let h = p.minHeight + sp.random() * (cfg.flightMaxAltitude + 2 - p.minHeight);
  const x = playerX + (sp.random() * 2 - 1) * cfg.flightBandHalfWidth;
  const z = z0 + w / 2 + sp.random() * Math.max(0, cfg.spawnStep - w);
  if (blocksLane(sp, x, 0, z, w, h, w)) {
    // Too tall for the lane here: shorten it so the lane passes over the top.
    h = laneRect(sp, z - w / 2, z + w / 2, cfg.minGapWidth, cfg.minGapHeight).y0 - 0.05;
    if (h < 1) return;
  }
  addBox(sp, x, 0, z, w, h, w);
}

// Walls with a window to fly through. With a small spacing the walls join up
// into a tunnel. The window follows the open lane.
function framesRow(sp, p, z0, playerX, playerY) {
  const cfg = sp.config;
  const step = cfg.spawnStep;
  const z1 = z0 + step;
  const tunnel = p.spacing <= step;
  let fz = 0;
  let has = false;
  if (tunnel) {
    wander(sp, 0.35);
    has = true;
  } else {
    fz = Math.ceil(z0 / p.spacing) * p.spacing;
    has = fz < z1;
    if (has) {
      // Move the next window somewhere new: left/right and up/down.
      const L = sp.lane;
      L.tx = (sp.random() < 0.5 ? -1 : 1) * sp.maxSlopeX * (0.5 + 0.5 * sp.random());
      L.ty = (sp.random() < 0.5 ? -1 : 1) * sp.maxSlopeY * (0.5 + 0.5 * sp.random());
    }
  }
  advanceLane(sp, z1, playerX, playerY);
  if (!has) return;
  const depth = tunnel ? step : p.depth;
  const zc = tunnel ? z0 + step / 2 : Math.min(fz + depth / 2, z1 - depth / 2);
  const holeW = Math.max(p.holeWidth, cfg.minGapWidth + 0.3);
  const holeH = Math.max(p.holeHeight, cfg.minGapHeight + 0.3);
  const r = laneRect(sp, zc - depth / 2, zc + depth / 2, holeW, holeH);
  const hx0 = r.x0, hx1 = r.x1, hy0 = r.y0, hy1 = r.y1;
  const ox0 = hx0 - p.extent;
  const ox1 = hx1 + p.extent;
  const oy0 = tunnel ? Math.max(0, hy0 - p.extent) : 0;
  const oy1 = tunnel ? hy1 + p.extent : cfg.flightMaxAltitude + 2;
  addBox(sp, (ox0 + hx0) / 2, oy0, zc, hx0 - ox0, oy1 - oy0, depth); // left
  addBox(sp, (hx1 + ox1) / 2, oy0, zc, ox1 - hx1, oy1 - oy0, depth); // right
  if (hy0 > oy0 + 0.05) addBox(sp, (hx0 + hx1) / 2, oy0, zc, hx1 - hx0, hy0 - oy0, depth); // below
  if (oy1 > hy1 + 0.05) addBox(sp, (hx0 + hx1) / 2, hy1, zc, hx1 - hx0, oy1 - hy1, depth); // above
}

// ---- Helpers ---------------------------------------------------------------

function addBox(sp, x, y, z, w, h, d) {
  // Skip boxes that would overlap a recently placed one (looks messy).
  for (let i = Math.max(0, sp.boxes.length - 40); i < sp.boxes.length; i++) {
    const o = sp.boxes[i];
    if (Math.abs(o.x - x) < (o.w + w) / 2 - 0.01 && Math.abs(o.z - z) < (o.d + d) / 2 - 0.01 &&
        y < o.y + o.h - 0.01 && y + h > o.y + 0.01) return;
  }
  const b = sp.pool.pop() || {};
  b.x = x;
  b.y = y;
  b.z = z;
  b.w = w;
  b.h = h;
  b.d = d;
  sp.boxes.push(b);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
