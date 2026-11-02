// Helicopter fairness: there must always be a way through the cave, at the
// fastest speed you can be going at that point (level + lap).
//
// For every level, laps 1–3 and 20 seeds we build 2 minutes of cave and check:
//   1. Geometry — nothing (walls, blocks, spikes, gates) enters the open
//      corridor; the corridor is always at least heliMinGap tall; the path is
//      never steeper or bendier than allowed; every gem is on the open path.
//   2. The autopilot survives the 2 minutes, flying with the real physics at
//      the real speed, using only hold and release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, LEVELS } from '../js/config.js';
import {
  createCaveSpawner, resetCaveSpawner, updateCaveSpawner, obstacleRects,
  heliLevelAt, heliTopSpeed, pathLimits, heliLevelLength,
} from '../js/caveSpawner.js';
import { createHeli, resetHeli, stepHeli, autopilot } from '../js/heli.js';
import { makeRandom } from '../js/spawner.js';

const SEEDS = 20;
const SECONDS = 120;
const LAPS = 3;
const EPS = 1e-9;

// Build the cave the way the game does, keeping everything that was made.
function buildCave(startLevel, seed) {
  const sp = createCaveSpawner(CONFIG, LEVELS, seed);
  const start = startLevel * heliLevelLength(CONFIG);
  sp.record = null;
  resetCaveSpawner(sp, seed, start, CONFIG.heliWorldHeight / 2);
  // Record from scratch (the reset already built the first screen).
  sp.record = { columns: sp.columns.slice(), obstacles: sp.obstacles.slice(), gems: sp.gems.slice() };
  // Fastest possible travel: the top speed of the last level reached.
  let x = start;
  const info = {};
  for (let t = 0; t < SECONDS; t += 0.25) {
    heliLevelAt(x, CONFIG, LEVELS, info);
    x += heliTopSpeed(info, CONFIG) * 0.25;
    updateCaveSpawner(sp, x);
  }
  return sp.record;
}

function checkGeometry(rec, where) {
  const g = CONFIG.heliMinGap;
  const step = CONFIG.caveStep;
  const info = {};
  const info2 = {};
  const lim = {};
  const cols = rec.columns;
  assert.ok(cols.length > 100, `${where}: cave too short`);
  let prevSlope = null;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (i > 0) assert.ok(Math.abs(c.x0 - cols[i - 1].x1) < 1e-6, `${where}: columns must touch`);
    assert.ok(c.hi - c.lo >= g - EPS, `${where} x=${c.x0}: corridor shorter than heliMinGap`);
    assert.ok(c.top >= c.hi + 0.3 - EPS, `${where} x=${c.x0}: ceiling inside the corridor`);
    assert.ok(c.bottom <= c.lo - 0.3 + EPS, `${where} x=${c.x0}: floor inside the corridor`);
    assert.ok(c.top <= CONFIG.heliWorldHeight && c.bottom >= 0, `${where}: walls off screen`);
    // Path limits at the fastest speed you can be going here.
    heliLevelAt(Math.max(0, c.x0), CONFIG, LEVELS, info);
    heliLevelAt(Math.max(0, c.x1), CONFIG, LEVELS, info2);
    const top = Math.max(heliTopSpeed(info, CONFIG), heliTopSpeed(info2, CONFIG));
    pathLimits(top, CONFIG, lim);
    const slope = (c.p1 - c.p0) / step;
    assert.ok(Math.abs(slope) <= lim.slope + EPS,
      `${where} x=${c.x0}: path too steep (${slope.toFixed(3)} > ${lim.slope.toFixed(3)})`);
    if (prevSlope !== null) {
      const bend = Math.abs(slope - prevSlope) / step;
      assert.ok(bend <= lim.curve + EPS,
        `${where} x=${c.x0}: path bends too sharply (${bend.toFixed(4)} > ${lim.curve.toFixed(4)})`);
    }
    prevSlope = slope;
  }
  const first = cols[0].x0;
  const colsIn = (a, b) => {
    const out = [];
    const i0 = Math.max(0, Math.floor((a - first) / step));
    for (let i = i0; i < cols.length && cols[i].x0 < b; i++) if (cols[i].x1 > a) out.push(cols[i]);
    return out;
  };
  const rects = [];
  for (const o of rec.obstacles) {
    obstacleRects(o, rects);
    for (const [x0, x1, y0, y1] of rects) {
      const over = colsIn(x0, x1);
      assert.ok(over.length > 0, `${where}: obstacle outside the cave`);
      for (const c of over) {
        assert.ok(y1 <= c.lo + EPS || y0 >= c.hi - EPS,
          `${where} x=${x0.toFixed(2)}: ${o.kind} enters the open corridor`);
      }
    }
  }
  for (const gem of rec.gems) {
    const [c] = colsIn(gem.x, gem.x + 1e-6);
    assert.ok(c && gem.y >= c.lo && gem.y <= c.hi, `${where}: gem off the open path`);
  }
  return { obstacles: rec.obstacles.length, gems: rec.gems.length };
}

// Fly with the autopilot. dtFn gives each frame's time step.
function fly(startLevel, seed, dtFn) {
  const h = createHeli(CONFIG, LEVELS, seed);
  resetHeli(h, seed, startLevel);
  stepHeli(h, 1 / 60, true); // first touch starts the run
  let t = 0;
  while (t < SECONDS) {
    const dt = dtFn();
    stepHeli(h, dt, autopilot(h));
    t += Math.min(dt, CONFIG.maxFrameTime);
    if (h.crashed) return { crashed: true, t, h };
  }
  return { crashed: false, t, h };
}

for (let li = 0; li < LEVELS.length; li++) {
  for (let lap = 1; lap <= LAPS; lap++) {
    const startLevel = (lap - 1) * LEVELS.length + li;
    const where = `${LEVELS[li].name} lap ${lap}`;
    test(`helicopter cave is fair: ${where}`, () => {
      let obstacles = 0;
      let gems = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = checkGeometry(buildCave(startLevel, seed * 101 + li), `${where} seed ${seed}`);
        obstacles += r.obstacles;
        gems += r.gems;
        const run = fly(startLevel, seed * 101 + li, () => 1 / 60);
        assert.ok(!run.crashed,
          `${where} seed ${seed}: autopilot crashed after ${run.t.toFixed(1)} s at x=${run.h.distance.toFixed(1)}`);
      }
      assert.ok(gems > 0, `${where}: no gems`);
      if (LEVELS[li].heli.type !== 'snake') assert.ok(obstacles > 0, `${where}: no obstacles were placed`);
      // And once with uneven frame times, up to the frame-time cap.
      const rand = makeRandom(7 + startLevel);
      const run = fly(startLevel, 999 + li, () => 0.004 + rand() * (CONFIG.maxFrameTime - 0.004));
      assert.ok(!run.crashed, `${where}: autopilot crashed with uneven frames after ${run.t.toFixed(1)} s`);
    });
  }
}
