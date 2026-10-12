// spawner.js — places the cubes (pure logic, seeded random so tests repeat).
//
// How fairness is guaranteed: the spawner steers an invisible "open lane"
// ahead of the player. The lane is always at least minGapWidth wide, bends
// no more sharply than the ship can steer at the current speed, and stays
// near the player. No pattern is ever allowed to put a cube in the lane.
//
// New cubes are only ever placed beyond the fog distance, so nothing pops up
// right in front of the player.

import { levelForDistance, inBreather } from './levels.js';

// Small, fast, repeatable random number generator (returns 0 ≤ n < 1).
export function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSpawner(config, levels, seed = 1) {
  const sp = {
    config,
    levels,
    cubes: [],
    pool: [],
    random: makeRandom(seed),
    nextZ: 0,
    laneX: 0,
    laneZ: 0,
    laneSlope: 0,
    laneTarget: 0,
    maxSlope: 0.3,
    prevLaneX: 0,
    prevLaneZ: 0,
    lastSpawned: 0,
    gateFlip: 1,
    info: {},
  };
  resetSpawner(sp, seed, 0, 0);
  return sp;
}

export function resetSpawner(sp, seed, startZ, playerX) {
  for (const c of sp.cubes) sp.pool.push(c);
  sp.cubes.length = 0;
  sp.random = makeRandom(seed);
  sp.nextZ = startZ + sp.config.fogDistance;
  sp.laneX = playerX;
  sp.laneZ = sp.nextZ;
  sp.prevLaneX = playerX;
  sp.prevLaneZ = sp.nextZ;
  sp.laneSlope = 0;
  sp.laneTarget = 0;
  sp.lastSpawned = 0;
  sp.gateFlip = 1;
}

// Call every frame. Removes passed cubes and fills the road ahead.
export function updateSpawner(sp, playerZ, playerX, speed) {
  const cfg = sp.config;
  cullCubes(sp, playerZ, playerX);
  const before = sp.cubes.length;
  // The sharpest bend the lane may take (sideways units per forward unit).
  sp.maxSlope = (cfg.laneSlopeFactor * cfg.maxSteerSpeed) / Math.max(speed, 1);
  const minZ = playerZ + cfg.fogDistance;
  if (sp.nextZ < minZ) sp.nextZ = minZ;
  while (sp.nextZ < minZ + cfg.spawnStep) {
    spawnRow(sp, sp.nextZ, playerX);
    sp.nextZ += cfg.spawnStep;
  }
  sp.lastSpawned = sp.cubes.length - before;
}

function cullCubes(sp, playerZ, playerX) {
  const behind = playerZ - sp.config.cameraBack - sp.config.cubeSize;
  const side = sp.config.spawnBandHalfWidth + 20;
  const cubes = sp.cubes;
  let w = 0;
  for (let i = 0; i < cubes.length; i++) {
    const c = cubes[i];
    if (c.z < behind || Math.abs(c.x - playerX) > side) sp.pool.push(c);
    else cubes[w++] = c;
  }
  cubes.length = w;
}

// ---- The open lane ---------------------------------------------------------

// Moves the lane forward to z, bending smoothly and staying near the player.
function advanceLane(sp, z, playerX) {
  const cfg = sp.config;
  const dz = z - sp.laneZ;
  if (dz <= 0) return;
  const max = sp.maxSlope;
  if (sp.laneX > playerX + cfg.laneLeash) sp.laneTarget = -0.8 * max;
  else if (sp.laneX < playerX - cfg.laneLeash) sp.laneTarget = 0.8 * max;
  sp.laneTarget = clamp(sp.laneTarget, -max, max);
  const change = 0.5 * max * (dz / cfg.spawnStep);
  sp.laneSlope += clamp(sp.laneTarget - sp.laneSlope, -change, change);
  sp.laneSlope = clamp(sp.laneSlope, -max, max);
  sp.prevLaneX = sp.laneX;
  sp.prevLaneZ = sp.laneZ;
  sp.laneX += sp.laneSlope * dz;
  sp.laneZ = z;
}

// Lane centre at depth z: a straight line between the last two lane points.
function laneAt(sp, z) {
  if (z <= sp.prevLaneZ) return sp.prevLaneX;
  return sp.prevLaneX + sp.laneSlope * (z - sp.prevLaneZ);
}

// Half the width around the lane centre where cube centres are not allowed.
function laneClearance(sp, gapWidth) {
  const half = sp.config.cubeSize / 2;
  // Extra margin covers the lane's bend across a cube's depth.
  return gapWidth / 2 + half + sp.maxSlope * half + 0.15;
}

function wander(sp, chance) {
  if (sp.random() < chance) sp.laneTarget = (sp.random() * 2 - 1) * sp.maxSlope;
}

// ---- Rows ------------------------------------------------------------------

function spawnRow(sp, z0, playerX) {
  const cfg = sp.config;
  if (inBreather(z0, cfg) || inBreather(z0 + cfg.spawnStep, cfg)) {
    advanceLane(sp, z0 + cfg.spawnStep, playerX);
    return;
  }
  const info = levelForDistance(z0, cfg, sp.levels, sp.info);
  let pattern = info.level.pattern;
  if (pattern.type === 'mixed') pattern = mixedPart(pattern, z0);
  switch (pattern.type) {
    case 'clusters': clustersRow(sp, pattern, z0, playerX); break;
    case 'gates': gatesRow(sp, pattern, z0, playerX); break;
    case 'canyon': canyonRow(sp, pattern, z0, playerX); break;
    default: scatterRow(sp, pattern, z0, playerX);
  }
}

function mixedPart(pattern, z) {
  const seq = pattern.sequence;
  return seq[Math.floor(z / pattern.segmentLength) % seq.length];
}

function scatterRow(sp, pattern, z0, playerX) {
  const cfg = sp.config;
  wander(sp, 0.2);
  advanceLane(sp, z0 + cfg.spawnStep, playerX);
  const count = Math.floor(pattern.density) + (sp.random() < pattern.density % 1 ? 1 : 0);
  const keepOut = laneClearance(sp, cfg.minGapWidth);
  const band = cfg.spawnBandHalfWidth;
  for (let i = 0; i < count; i++) {
    const x = playerX + (sp.random() * 2 - 1) * band;
    const z = z0 + cfg.cubeSize / 2 + sp.random() * cfg.spawnStep;
    if (Math.abs(x - laneAt(sp, z)) < keepOut) continue;
    addCube(sp, x, z);
  }
}

// Small groups of 3–6 touching cubes, with open ground between groups.
const CELLS = [[0, 0], [1, 0], [0, 1], [-1, 0], [1, 1], [0, -1], [-1, 1], [1, -1], [-1, -1]];

function clustersRow(sp, pattern, z0, playerX) {
  const cfg = sp.config;
  wander(sp, 0.2);
  advanceLane(sp, z0 + cfg.spawnStep, playerX);
  if (sp.random() >= pattern.chance) return;
  const size = cfg.cubeSize;
  const keepOut = laneClearance(sp, cfg.minGapWidth);
  const band = cfg.spawnBandHalfWidth;
  let cx = playerX + (sp.random() * 2 - 1) * (band - size);
  const cz = z0 + size * 1.5 + sp.random() * cfg.spawnStep;
  // Don't let a group sit on the open lane: slide it to one side.
  const lane = laneAt(sp, cz);
  const push = keepOut + size * 1.5;
  if (Math.abs(cx - lane) < push) cx = lane + (cx >= lane ? 1 : -1) * (push + sp.random() * 2);
  const count = pattern.min + Math.floor(sp.random() * (pattern.max - pattern.min + 1));
  // Pick `count` neighbouring cells around the group's centre.
  const start = Math.floor(sp.random() * 4);
  for (let i = 0; i < Math.min(count, CELLS.length); i++) {
    const cell = CELLS[(i === 0 ? 0 : 1 + ((i - 1 + start) % (CELLS.length - 1)))];
    const x = cx + cell[0] * size;
    const z = cz + cell[1] * size;
    if (Math.abs(x - laneAt(sp, z)) < keepOut) continue;
    addCube(sp, x, z);
  }
}

// Rows of cubes across the field, each with one gap. The gap swings left and
// right from row to row, so you weave through like a slalom.
function gatesRow(sp, pattern, z0, playerX) {
  const cfg = sp.config;
  const z1 = z0 + cfg.spawnStep;
  const rowZ = Math.ceil(z0 / pattern.rowSpacing) * pattern.rowSpacing;
  const hasRow = rowZ < z1;
  if (hasRow) {
    sp.gateFlip = -sp.gateFlip;
    sp.laneTarget = sp.gateFlip * sp.maxSlope * (0.6 + 0.4 * sp.random());
  }
  advanceLane(sp, z1, playerX);
  if (!hasRow) return;
  const half = cfg.cubeSize / 2;
  const z = rowZ + half;
  const gap = Math.max(pattern.gapWidth, cfg.minGapWidth + 2 * sp.maxSlope * half + 0.3);
  const centre = laneAt(sp, z);
  const band = cfg.spawnBandHalfWidth;
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; ; k++) {
      const x = centre + side * (gap / 2 + half + k * cfg.cubeSize);
      if (Math.abs(x - centre) > band) break; // rows are centred on the gap
      addCube(sp, x, z);
    }
  }
}

// Two thick walls forming a winding corridor that follows the open lane.
function canyonRow(sp, pattern, z0, playerX) {
  const cfg = sp.config;
  const size = cfg.cubeSize;
  const half = size / 2;
  const z1 = z0 + cfg.spawnStep;
  wander(sp, 0.35);
  advanceLane(sp, z1, playerX);
  const width = Math.max(pattern.width, cfg.minGapWidth + 2 * sp.maxSlope * size + 0.3);
  const layers = Math.max(1, Math.ceil(pattern.wallDepth / size));
  // Wall cubes sit on a fixed grid along z, so the walls are continuous.
  for (let m = Math.ceil(z0 / size); m * size < z1; m++) {
    const z = m * size + half;
    const centre = laneAt(sp, z);
    for (let k = 0; k < layers; k++) {
      addCube(sp, centre - width / 2 - half - k * size, z);
      addCube(sp, centre + width / 2 + half + k * size, z);
    }
  }
  // A few stray cubes outside the walls.
  const extra = Math.floor(pattern.extra) + (sp.random() < pattern.extra % 1 ? 1 : 0);
  const band = cfg.spawnBandHalfWidth;
  const outside = width / 2 + layers * size + half;
  for (let i = 0; i < extra; i++) {
    const x = playerX + (sp.random() * 2 - 1) * band;
    const z = z0 + half + sp.random() * cfg.spawnStep;
    if (Math.abs(x - laneAt(sp, z)) < outside) continue;
    addCube(sp, x, z);
  }
}

// ---- Helpers ---------------------------------------------------------------

function addCube(sp, x, z) {
  const size = sp.config.cubeSize;
  // Skip cubes that would overlap a recently placed one.
  for (let i = Math.max(0, sp.cubes.length - 60); i < sp.cubes.length; i++) {
    const o = sp.cubes[i];
    if (Math.abs(o.x - x) < size - 0.01 && Math.abs(o.z - z) < size - 0.01) return;
  }
  const c = sp.pool.pop() || {};
  c.x = x;
  c.z = z;
  c.size = size;
  sp.cubes.push(c);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
