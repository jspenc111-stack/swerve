// Fairness: whatever the pattern, there must always be a way through.
//
// For each pattern and many random seeds we generate 2 minutes of obstacles,
// then sweep forward in thin slices, tracking every sideways position the
// ship could reach (it can only move sideways so fast). The test fails if the
// reachable area ever disappears, or if it ever has no gap at least
// minGapWidth wide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpawner, updateSpawner } from '../js/spawner.js';
import { createGame, resetGame, stepGame } from '../js/game.js';
import { CONFIG, LEVELS } from '../js/config.js';
import { levelForDistance, levelBaseSpeed } from '../js/levels.js';

const SECONDS = 120;
const FPS = 60;
const SEEDS = 20;
const SLICE = 0.2;

const PATTERNS = {
  'scatter (sparse)': { type: 'scatter', density: 1.6 },
  'scatter (very dense)': { type: 'scatter', density: 8 },
  clusters: { type: 'clusters', chance: 1, min: 3, max: 6 },
  gates: { type: 'gates', rowSpacing: 12, gapWidth: CONFIG.minGapWidth },
  'gates (long fences, busy)': { type: 'gates', rowSpacing: 12, gapWidth: CONFIG.minGapWidth, wingCubes: 9, between: 3 },
  canyon: { type: 'canyon', width: CONFIG.minGapWidth, wallDepth: 6, extra: 2 },
  mixed: {
    type: 'mixed', segmentLength: 60,
    sequence: [
      { type: 'scatter', density: 5 },
      { type: 'gates', rowSpacing: 12, gapWidth: 3, wingCubes: 5, between: 1 },
      { type: 'canyon', width: 5, wallDepth: 6, extra: 1 },
      { type: 'clusters', chance: 0.9, min: 3, max: 6 },
    ],
  },
};

const singleLevel = (pattern) => [{ name: 'Test', pattern, palette: LEVELS[0].palette }];

// Run the spawner like the game does, with the player holding still at x = 0.
// speedAt(distance) gives the forward speed.
function generate(levels, seed, speedAt) {
  const sp = createSpawner(CONFIG, levels, seed);
  const all = [];
  let z = 0;
  let tooClose = 0;
  let maxSpeed = 0;
  for (let i = 0; i < SECONDS * FPS; i++) {
    const speed = speedAt(z);
    maxSpeed = Math.max(maxSpeed, speed);
    z += speed / FPS;
    updateSpawner(sp, z, 0, speed);
    for (let k = sp.cubes.length - sp.lastSpawned; k < sp.cubes.length; k++) {
      const c = sp.cubes[k];
      if (c.z < z + CONFIG.fogDistance) tooClose++;
      all.push({ x: c.x, z: c.z, size: c.size });
    }
  }
  all.sort((a, b) => a.z - b.z);
  return { cubes: all, endZ: z, tooClose, maxSpeed };
}

// Subtract blocked intervals from [lo, hi]; returns free intervals.
function freeIntervals(blocked, lo, hi) {
  blocked.sort((a, b) => a[0] - b[0]);
  const out = [];
  let x = lo;
  for (const [a, b] of blocked) {
    if (a > x) out.push([x, Math.min(a, hi)]);
    x = Math.max(x, b);
    if (x >= hi) break;
  }
  if (x < hi) out.push([x, hi]);
  return out.filter(([a, b]) => b > a);
}

// Join overlapping intervals so the list stays short.
function mergeInPlace(list) {
  list.sort((a, b) => a[0] - b[0]);
  let w = 0;
  for (let i = 1; i < list.length; i++) {
    if (list[i][0] <= list[w][1]) list[w][1] = Math.max(list[w][1], list[i][1]);
    else list[++w] = list[i];
  }
  list.length = w + 1;
}

function checkPassable({ cubes, endZ, maxSpeed }) {
  const hw = (CONFIG.shipWidth * CONFIG.hitboxScale) / 2;
  const hd = (CONFIG.shipLength * CONFIG.hitboxScale) / 2;
  const B = CONFIG.spawnBandHalfWidth;
  // How far sideways the ship can move per unit forward, with a safety margin
  // for the time it takes to build up sideways speed.
  const reach = (0.85 * CONFIG.maxSteerSpeed) / maxSpeed;
  const needed = CONFIG.minGapWidth - 2 * hw - 1e-6; // gap, in ship-centre terms
  let reachable = [[-B, B]];
  let first = 0;
  let narrowest = Infinity;
  for (let z = CONFIG.fogDistance; z < endZ; z += SLICE) {
    while (first < cubes.length && cubes[first].z + cubes[first].size / 2 + hd <= z) first++;
    const blocked = [];
    for (let i = first; i < cubes.length && cubes[i].z - cubes[i].size / 2 - hd < z; i++) {
      const c = cubes[i];
      if (Math.abs(c.z - z) < c.size / 2 + hd) blocked.push([c.x - c.size / 2 - hw, c.x + c.size / 2 + hw]);
    }
    const free = freeIntervals(blocked, -B, B);
    const next = [];
    for (const [a, b] of free) {
      for (const [ra, rb] of reachable) {
        const lo = Math.max(a, ra - reach * SLICE);
        const hi = Math.min(b, rb + reach * SLICE);
        if (hi >= lo) next.push([lo, hi]);
      }
    }
    if (next.length === 0) return { ok: false, z, why: 'no reachable path' };
    mergeInPlace(next);
    let widest = 0;
    for (const [a, b] of next) widest = Math.max(widest, b - a);
    narrowest = Math.min(narrowest, widest);
    if (widest < needed) return { ok: false, z, why: `widest reachable gap ${(widest + 2 * hw).toFixed(2)} < minGapWidth` };
    reachable = next;
  }
  return { ok: true, narrowest: narrowest + 2 * hw };
}

for (const [name, pattern] of Object.entries(PATTERNS)) {
  for (const speed of [CONFIG.baseSpeed, CONFIG.baseSpeed + 45]) {
    test(`fairness: ${name} at speed ${speed} always leaves a passable gap`, () => {
      const levels = singleLevel(pattern);
      let cubesSeen = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const run = generate(levels, seed * 7717, () => speed);
        cubesSeen += run.cubes.length;
        assert.equal(run.tooClose, 0, `seed ${seed}: a cube appeared closer than the fog distance`);
        const result = checkPassable(run);
        assert.ok(result.ok, `seed ${seed}: blocked at z=${result.z?.toFixed(1)} (${result.why})`);
      }
      assert.ok(cubesSeen > SEEDS * 50, 'the pattern should actually place cubes');
    });
  }
}

test('fairness: the real level list, played start to finish with real speeds', () => {
  const info = {};
  const speedAt = (z) => levelBaseSpeed(levelForDistance(z, CONFIG, LEVELS, info), CONFIG);
  for (let seed = 1; seed <= 6; seed++) {
    // Long enough to pass through every level and into lap 2.
    const sp = { cubes: [], endZ: 0 };
    const levelsDist = (CONFIG.levelLength / CONFIG.scorePerUnit) * (LEVELS.length + 1);
    let run;
    {
      const spawner = createSpawner(CONFIG, LEVELS, seed);
      const all = [];
      let z = 0;
      let tooClose = 0;
      let maxSpeed = 0;
      while (z < levelsDist) {
        const speed = speedAt(z);
        maxSpeed = Math.max(maxSpeed, speed);
        z += speed / FPS;
        updateSpawner(spawner, z, 0, speed);
        for (let k = spawner.cubes.length - spawner.lastSpawned; k < spawner.cubes.length; k++) {
          const c = spawner.cubes[k];
          if (c.z < z + CONFIG.fogDistance) tooClose++;
          all.push({ x: c.x, z: c.z, size: c.size });
        }
      }
      all.sort((a, b) => a.z - b.z);
      run = { cubes: all, endZ: z, tooClose, maxSpeed };
    }
    assert.equal(run.tooClose, 0);
    const result = checkPassable(run);
    assert.ok(result.ok, `seed ${seed}: blocked at z=${result.z?.toFixed(1)} (${result.why})`);
    sp.cubes = run.cubes;
  }
});

test('the open lane follows a player who moves sideways', () => {
  const sp = createSpawner(CONFIG, singleLevel(PATTERNS.gates), 3);
  let z = 0;
  let px = 0;
  for (let i = 0; i < 60 * 60; i++) {
    z += CONFIG.baseSpeed / FPS;
    px += 4 / FPS; // drifting right steadily (slower than the lane can bend)
    updateSpawner(sp, z, px, CONFIG.baseSpeed);
  }
  // Every cube is near the player's side band, and the lane kept up.
  assert.ok(Math.abs(sp.laneX - px) < CONFIG.laneLeash + 2, `lane ${sp.laneX} vs player ${px}`);
  for (const c of sp.cubes) assert.ok(Math.abs(c.x - px) < CONFIG.spawnBandHalfWidth + 20);
});

test('fairness: real play with boost switched on and off, starting from every level', () => {
  for (let start = 0; start < LEVELS.length; start++) {
    const game = createGame(CONFIG, LEVELS, 100 + start);
    game.invincible = true;
    resetGame(game, 200 + start, start);
    const all = [];
    let tooClose = 0;
    let maxSpeed = 0;
    let boosting = false;
    const end = game.distance + (CONFIG.levelLength / CONFIG.scorePerUnit) * 1.5;
    for (let i = 0; game.distance < end; i++) {
      if (i % 90 === 0) boosting = !boosting; // toggle every 1.5 s
      stepGame(game, 1 / FPS, 0, boosting);
      maxSpeed = Math.max(maxSpeed, game.speed);
      const sp = game.spawner;
      for (let k = sp.cubes.length - sp.lastSpawned; k < sp.cubes.length; k++) {
        const c = sp.cubes[k];
        if (c.z < game.distance + CONFIG.fogDistance) tooClose++;
        all.push({ x: c.x, z: c.z, size: c.size });
      }
    }
    all.sort((a, b) => a.z - b.z);
    // Shift so the check starts where this run's obstacles begin.
    const offset = game.startDistance;
    const run = { cubes: all.map((c) => ({ ...c, z: c.z - offset })), endZ: game.distance - offset, tooClose, maxSpeed };
    assert.equal(run.tooClose, 0);
    const result = checkPassable(run);
    assert.ok(result.ok, `start level ${start + 1}: blocked at z=${result.z?.toFixed(1)} (${result.why})`);
  }
});

test('islands are separate cubes, not clumps', () => {
  const run = generate(singleLevel(PATTERNS.clusters), 42, () => CONFIG.baseSpeed);
  const s = CONFIG.cubeSize;
  let touching = 0;
  for (let i = 0; i < run.cubes.length; i++) {
    for (let j = i + 1; j < run.cubes.length && run.cubes[j].z - run.cubes[i].z < s + 0.1; j++) {
      if (Math.abs(run.cubes[j].x - run.cubes[i].x) < s + 0.1) touching++;
    }
  }
  assert.ok(touching / run.cubes.length < 0.1, `${touching} touching pairs among ${run.cubes.length} cubes`);
});

test('gates are fences of spaced posts with one opening, not walls across the field', () => {
  const run = generate(singleLevel({ type: 'gates', rowSpacing: 16, gapWidth: 3.2, wingCubes: 5 }), 7, () => CONFIG.baseSpeed);
  const rows = new Map();
  for (const c of run.cubes) {
    const key = c.z.toFixed(2);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(c.x);
  }
  for (const xs of rows.values()) {
    assert.equal(xs.length, 10, 'five posts on each side');
    xs.sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i] - CONFIG.cubeSize);
    const opening = Math.max(...gaps);
    assert.ok(opening >= 3.2 - 1e-6, 'one real opening');
    for (const g of gaps) if (g !== opening) assert.ok(g > 0.2 && g < CONFIG.shipWidth * CONFIG.hitboxScale, 'posts are spaced but too close to squeeze through');
  }
});
