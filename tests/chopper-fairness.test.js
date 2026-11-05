// 3D Heli fairness: there must always be a way through, for a helicopter.
//
// 3D Heli flies the 3D Flight courses, but laid out with the helicopter's own
// settings (chopperConfig): its sideways and up/down speeds, its top speed
// and its level length. For every level, laps 1–3 and 20 seeds we check:
//   1. Reachable sweep — the same sweep as the 3D Flight fairness test: a
//      minGapWidth × minGapHeight opening is always reachable by a
//      helicopter that can only slide and climb so fast, and every bonus ring
//      can be flown through.
//   2. The hitbox, rotor included, fits within 80% of the minimum gap.
//   3. The autopilot survives 2 minutes at top speed, using only the
//      collective lever and the cyclic stick (also once with uneven frames).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, LEVELS } from '../js/config.js';
import { createFlightSpawner, resetFlightSpawner, updateFlightSpawner } from '../js/flightSpawner.js';
import { levelForDistance, levelStartDistance } from '../js/levels.js';
import {
  chopperConfig, chopperTopSpeed, chopperOuterBox, createChopper, resetChopper, stepChopper,
  chopperAutopilot, chopperHitboxes, chopperHits,
} from '../js/chopper.js';
import { makeRandom } from '../js/spawner.js';

const COURSE = chopperConfig(CONFIG);
const SEEDS = 20;
const LAPS = 3;
const SECONDS = 120;
const FPS = 60;
const CELL = 0.25;
const SLICE = 0.5;
const OUTER = chopperOuterBox(CONFIG);

// The fastest you can be going at distance z (the top speed of that level).
function topSpeedAt(z) {
  return chopperTopSpeed(levelForDistance(z, COURSE, LEVELS, {}), COURSE);
}

// Build one level's course (plus the start of the next) the way the game
// does, with the player holding still at (0, py) and the course laid out for
// top speed. Everything that was placed is kept.
function generate(startLevel, seed, py) {
  const sp = createFlightSpawner(COURSE, LEVELS, seed, { drones: false, recordPath: true });
  const start = levelStartDistance(startLevel, COURSE);
  resetFlightSpawner(sp, seed, start, 0, py);
  const boxes = [];
  const rings = [];
  let z = start;
  let tooClose = 0;
  let maxSpeed = 0;
  let drones = 0;
  const end = start + CONFIG.chopperLevelDistance * 1.15;
  while (z < end) {
    const speed = Math.max(topSpeedAt(z), topSpeedAt(z + CONFIG.fogDistance + CONFIG.spawnStep));
    maxSpeed = Math.max(maxSpeed, speed);
    z += speed / FPS;
    updateFlightSpawner(sp, z, 0, py, speed);
    for (let k = sp.boxes.length - sp.lastSpawned; k < sp.boxes.length; k++) {
      const b = sp.boxes[k];
      if (b.z - b.d / 2 < z + CONFIG.fogDistance - 1e-9) tooClose++;
      boxes.push({ ...b, z: b.z - start });
    }
    for (let k = sp.rings.length - sp.lastRings; k < sp.rings.length; k++) rings.push({ ...sp.rings[k], z: sp.rings[k].z - start });
    drones += sp.targets.length;
  }
  return { boxes, rings, endZ: z - start, tooClose, maxSpeed, drones };
}

// The 3D Flight sweep, with the helicopter's speeds and its whole hitbox
// (body and rotor together). Positions within laneLeash + 4 of the player's
// line are tracked (a narrower area only makes the check stricter).
function checkPassable({ boxes, endZ, maxSpeed }) {
  const hb = { halfW: OUTER.halfW, halfH: OUTER.halfH, halfD: OUTER.halfD };
  const B = CONFIG.laneLeash + 4;
  const X0 = -B;
  const Y0 = CONFIG.flightMinAltitude;
  const nx = Math.floor((2 * B) / CELL) + 1;
  const ny = Math.floor((CONFIG.flightMaxAltitude - Y0) / CELL) + 1;
  let R = new Uint8Array(nx * ny).fill(1);
  let T = new Uint8Array(nx * ny);
  const F = new Uint8Array(nx * ny);
  const sat = new Int32Array((nx + 1) * (ny + 1));
  const reachX = (0.85 * COURSE.maxSteerSpeed) / maxSpeed;
  const reachY = (0.85 * COURSE.maxClimbSpeed) / maxSpeed;
  const needX = Math.max(1, Math.floor((CONFIG.minGapWidth - 2 * hb.halfW) / CELL));
  const needY = Math.max(1, Math.floor((CONFIG.minGapHeight - 2 * hb.halfH) / CELL));
  const sorted = boxes.slice().sort((a, b) => (a.z - a.d / 2) - (b.z - b.d / 2));
  const active = [];
  let next = 0;
  let ax = 0;
  let ay = 0;
  for (let z = CONFIG.fogDistance; z < endZ; z += SLICE) {
    ax += reachX * SLICE;
    ay += reachY * SLICE;
    while (ax >= CELL) {
      ax -= CELL;
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        for (let i = 0; i < nx; i++) T[row + i] = R[row + i] | (i > 0 ? R[row + i - 1] : 0) | (i < nx - 1 ? R[row + i + 1] : 0);
      }
      [R, T] = [T, R];
    }
    while (ay >= CELL) {
      ay -= CELL;
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        for (let i = 0; i < nx; i++) T[row + i] = R[row + i] | (j > 0 ? R[row - nx + i] : 0) | (j < ny - 1 ? R[row + nx + i] : 0);
      }
      [R, T] = [T, R];
    }
    while (next < sorted.length && sorted[next].z - sorted[next].d / 2 - hb.halfD < z) active.push(sorted[next++]);
    F.fill(1);
    let w = 0;
    for (const b of active) {
      if (b.z + b.d / 2 + hb.halfD <= z) continue;
      active[w++] = b;
      const i0 = Math.max(0, Math.ceil((b.x - b.w / 2 - hb.halfW - X0) / CELL));
      const i1 = Math.min(nx - 1, Math.floor((b.x + b.w / 2 + hb.halfW - X0) / CELL));
      const j0 = Math.max(0, Math.ceil((b.y - hb.halfH - Y0) / CELL));
      const j1 = Math.min(ny - 1, Math.floor((b.y + b.h + hb.halfH - Y0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) F[j * nx + i] = 0;
    }
    active.length = w;
    let any = 0;
    for (let k = 0; k < R.length; k++) { R[k] &= F[k]; any |= R[k]; }
    if (!any) return { ok: false, z, why: 'no reachable path' };
    for (let j = 0; j < ny; j++) {
      let rowSum = 0;
      for (let i = 0; i < nx; i++) {
        rowSum += R[j * nx + i];
        sat[(j + 1) * (nx + 1) + i + 1] = sat[j * (nx + 1) + i + 1] + rowSum;
      }
    }
    let found = false;
    for (let j = needY; j <= ny && !found; j++) {
      for (let i = needX; i <= nx; i++) {
        const s = sat[j * (nx + 1) + i] - sat[(j - needY) * (nx + 1) + i] - sat[j * (nx + 1) + i - needX] + sat[(j - needY) * (nx + 1) + i - needX];
        if (s === needX * needY) { found = true; break; }
      }
    }
    if (!found) return { ok: false, z, why: 'no reachable opening of the minimum size' };
  }
  return { ok: true };
}

// A helicopter sitting at (x, y, z) for hitbox checks.
function chopperAt(x, y, z) {
  const c = { config: CONFIG, x, y, distance: z, hitbox: {}, rotorBox: {} };
  chopperHitboxes(c);
  return c;
}

test('3D Heli hitbox (rotor included) fits within 80% of the minimum gap', () => {
  assert.ok(2 * OUTER.halfW <= 0.8 * CONFIG.minGapWidth + 1e-9,
    `hitbox ${(2 * OUTER.halfW).toFixed(2)} wide, limit ${(0.8 * CONFIG.minGapWidth).toFixed(2)}`);
  assert.ok(2 * OUTER.halfH <= 0.8 * CONFIG.minGapHeight + 1e-9,
    `hitbox ${(2 * OUTER.halfH).toFixed(2)} tall, limit ${(0.8 * CONFIG.minGapHeight).toFixed(2)}`);
  // The outer box really covers both the body and the rotor.
  const c = chopperAt(0, 3, 0);
  for (const b of [c.hitbox, c.rotorBox]) {
    assert.ok(b.halfW <= OUTER.halfW + 1e-9 && b.halfD <= OUTER.halfD + 1e-9);
    assert.ok(b.y - b.halfH >= 3 + OUTER.bottom - 1e-9 && b.y + b.halfH <= 3 + OUTER.top + 1e-9);
  }
});

test('3D Heli course is laid out for the helicopter, not the jet', () => {
  assert.equal(COURSE.maxSteerSpeed, CONFIG.chopperMaxSideSpeed);
  assert.equal(COURSE.maxClimbSpeed, Math.min(CONFIG.chopperMaxClimb, CONFIG.chopperMaxSink));
  assert.equal(levelStartDistance(1, COURSE), CONFIG.chopperLevelDistance);
  // Fairness settings are shared with 3D Flight, never loosened here.
  for (const k of ['minGapWidth', 'minGapHeight', 'laneLeash', 'laneSlopeFactor', 'flightLaneLeashY']) {
    assert.equal(COURSE[k], CONFIG[k], k);
  }
});

for (let li = 0; li < LEVELS.length; li++) {
  for (let lap = 1; lap <= LAPS; lap++) {
    const startLevel = (lap - 1) * LEVELS.length + li;
    const where = `${LEVELS[li].name} lap ${lap}`;

    test(`3D Heli course always leaves a way through: ${where}`, () => {
      let boxesSeen = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const py = seed % 2 ? CONFIG.flightStartAltitude : 7;
        const run = generate(startLevel, seed * 9173 + li, py);
        boxesSeen += run.boxes.length;
        assert.equal(run.drones, 0, `seed ${seed}: no drones in 3D Heli`);
        assert.equal(run.tooClose, 0, `seed ${seed}: an obstacle appeared closer than the fog distance`);
        const result = checkPassable(run);
        assert.ok(result.ok, `seed ${seed}: blocked at z=${result.z?.toFixed(1)} (${result.why})`);
        for (const ring of run.rings) {
          const c = chopperAt(ring.x, ring.y - OUTER.centreY, ring.z);
          assert.ok(!chopperHits(c, run.boxes), `seed ${seed}: ring at z=${ring.z.toFixed(1)} is blocked`);
          assert.ok(ring.y >= CONFIG.flightMinAltitude && ring.y <= CONFIG.flightMaxAltitude, 'ring within reach');
        }
      }
      assert.ok(boxesSeen > SEEDS * 20, 'the layout should actually place obstacles');
    });

    test(`3D Heli autopilot survives 2 minutes at top speed: ${where}`, () => {
      const out = {};
      const fly = (seed, dtFn) => {
        const c = createChopper(CONFIG, LEVELS, seed);
        resetChopper(c, seed, startLevel);
        let t = 0;
        let atTop = 0;
        let flying = 0;
        while (t < SECONDS) {
          const dt = dtFn();
          chopperAutopilot(c, out);
          stepChopper(c, dt, out.lever, out.stickX, out.stickY);
          const used = Math.min(dt, CONFIG.maxFrameTime);
          t += used;
          if (t > 10) { flying += used; if (c.speed >= c.topSpeed - 0.5) atTop += used; }
          if (c.crashed) return { crashed: true, t, c };
        }
        return { crashed: false, t, c, topShare: atTop / flying };
      };
      for (let seed = 1; seed <= SEEDS; seed++) {
        const run = fly(seed * 101 + li, () => 1 / FPS);
        assert.ok(!run.crashed,
          `seed ${seed}: autopilot crashed (${run.c.crashReason}) after ${run.t.toFixed(1)} s at z=${run.c.distance.toFixed(1)}`);
        assert.ok(run.topShare > 0.9, `seed ${seed}: autopilot should fly at top speed`);
      }
      const rand = makeRandom(7 + startLevel);
      const run = fly(999 + li, () => 0.004 + rand() * (CONFIG.maxFrameTime - 0.004));
      assert.ok(!run.crashed, `uneven frames: autopilot crashed after ${run.t.toFixed(1)} s`);
    });
  }
}
