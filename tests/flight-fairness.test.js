// 3D Flight fairness: there must always be a way through, sideways AND up/down.
//
// For each layout and several random seeds we generate obstacles, then sweep
// forward in thin slices over a grid of (sideways, height) positions, tracking
// every position the jet could reach (it can only steer and climb so fast).
// The test fails if the reachable area ever vanishes, or if it never contains
// an opening at least minGapWidth wide and minGapHeight tall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlightSpawner, updateFlightSpawner } from '../js/flightSpawner.js';
import { createFlight, resetFlight, stepFlight } from '../js/flight.js';
import { flightHitbox, hitsBox } from '../js/collision.js';
import { CONFIG, LEVELS } from '../js/config.js';

const FPS = 60;
const SECONDS = 30;
const SEEDS = 4;
const CELL = 0.25;
const SLICE = 0.5;

const PATTERNS = {
  floaters: { type: 'floaters', density: 2, minSize: 1.4, maxSize: 2.6, ringSpacing: 40 },
  'floaters (very dense)': { type: 'floaters', density: 9, minSize: 1.2, maxSize: 3, ringSpacing: 40 },
  pillars: { type: 'pillars', chance: 1, minHeight: 2, ringSpacing: 40 },
  'walls with windows': { type: 'frames', spacing: 18, holeWidth: 2.4, holeHeight: 2.4, extent: 9, depth: 1.2, ringSpacing: 36 },
  tunnel: { type: 'frames', spacing: 4, holeWidth: 2.4, holeHeight: 2.4, extent: 4, depth: 4, ringSpacing: 40 },
  mixed: {
    type: 'mixed', segmentLength: 60, ringSpacing: 30,
    sequence: [
      { type: 'floaters', density: 5, minSize: 1.2, maxSize: 2.8 },
      { type: 'frames', spacing: 4, holeWidth: 3, holeHeight: 2.6, extent: 4, depth: 4 },
      { type: 'pillars', chance: 1, minHeight: 2 },
      { type: 'frames', spacing: 16, holeWidth: 3, holeHeight: 2.6, extent: 7, depth: 1.2 },
    ],
  },
};

const levelWith = (flight) => [{ name: 'Test', pattern: LEVELS[0].pattern, flight, palette: LEVELS[0].palette }];

// Run the spawner as the game does, with the player holding still at (0, py).
function generate(levels, seed, speed, py) {
  const sp = createFlightSpawner(CONFIG, levels, seed);
  const boxes = [];
  const rings = [];
  let z = 0;
  let tooClose = 0;
  for (let i = 0; i < SECONDS * FPS; i++) {
    z += speed / FPS;
    updateFlightSpawner(sp, z, 0, py, speed);
    for (let k = sp.boxes.length - sp.lastSpawned; k < sp.boxes.length; k++) {
      const b = sp.boxes[k];
      if (b.z - b.d / 2 < z + CONFIG.fogDistance - 1e-9) tooClose++;
      boxes.push({ ...b });
    }
    for (let k = sp.rings.length - sp.lastRings; k < sp.rings.length; k++) rings.push({ ...sp.rings[k] });
  }
  return { boxes, rings, endZ: z, tooClose, maxSpeed: speed };
}

function checkPassable({ boxes, endZ, maxSpeed }) {
  const hb = flightHitbox(0, 0, 0, CONFIG);
  const B = CONFIG.flightBandHalfWidth;
  const X0 = -B;
  const Y0 = CONFIG.flightMinAltitude;
  const nx = Math.floor((2 * B) / CELL) + 1;
  const ny = Math.floor((CONFIG.flightMaxAltitude - Y0) / CELL) + 1;
  let R = new Uint8Array(nx * ny).fill(1);
  let T = new Uint8Array(nx * ny);
  const F = new Uint8Array(nx * ny);
  const sat = new Int32Array((nx + 1) * (ny + 1));
  const reachX = (0.85 * CONFIG.maxSteerSpeed) / maxSpeed;
  const reachY = (0.85 * CONFIG.maxClimbSpeed) / maxSpeed;
  const needX = Math.max(1, Math.floor((CONFIG.minGapWidth - 2 * hb.halfW) / CELL));
  const needY = Math.max(1, Math.floor((CONFIG.minGapHeight - 2 * hb.halfH) / CELL));
  const sorted = boxes.slice().sort((a, b) => (a.z - a.d / 2) - (b.z - b.d / 2));
  const active = [];
  let next = 0;
  let ax = 0;
  let ay = 0;
  for (let z = CONFIG.fogDistance; z < endZ; z += SLICE) {
    // Grow the reachable area by how far the jet can move in this slice.
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
    // Remove positions blocked by obstacles in this slice.
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
    // Is there a reachable opening of the required size? (summed-area table)
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

const base = CONFIG.baseSpeed * CONFIG.flightSpeedFactor * CONFIG.boostMultiplier;
for (const [name, pattern] of Object.entries(PATTERNS)) {
  for (const speed of [base, base + 45]) {
    test(`3D fairness: ${name} at speed ${speed.toFixed(0)} always leaves a way through`, () => {
      const levels = levelWith(pattern);
      let boxesSeen = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const py = seed % 2 ? CONFIG.flightStartAltitude : 7;
        const run = generate(levels, seed * 9173, speed, py);
        boxesSeen += run.boxes.length;
        assert.equal(run.tooClose, 0, `seed ${seed}: an obstacle appeared closer than the fog distance`);
        const result = checkPassable(run);
        assert.ok(result.ok, `seed ${seed}: blocked at z=${result.z?.toFixed(1)} (${result.why})`);
        // Every bonus ring can be flown through without hitting anything.
        for (const ring of run.rings) {
          const hb = flightHitbox(ring.x, ring.y, ring.z, CONFIG);
          assert.ok(!run.boxes.some((b) => hitsBox(hb, b)), `seed ${seed}: ring at z=${ring.z} is blocked`);
          assert.ok(ring.y >= CONFIG.flightMinAltitude && ring.y <= CONFIG.flightMaxAltitude, 'ring within reach');
        }
      }
      assert.ok(boxesSeen > SEEDS * 20, 'the layout should actually place obstacles');
    });
  }
}

test('3D fairness: real play from every start level, boost on and off', () => {
  for (let start = 0; start < LEVELS.length; start++) {
    const f = createFlight(CONFIG, LEVELS, 50 + start);
    f.invincible = true;
    resetFlight(f, 60 + start, start);
    const boxes = [];
    let maxSpeed = 0;
    let boosting = false;
    const end = f.distance + (CONFIG.levelLength / CONFIG.scorePerUnit) * 0.8;
    for (let i = 0; f.distance < end; i++) {
      if (i % 80 === 0) boosting = !boosting;
      stepFlight(f, 1 / FPS, 0, 0, boosting);
      maxSpeed = Math.max(maxSpeed, f.speed);
      const sp = f.spawner;
      for (let k = sp.boxes.length - sp.lastSpawned; k < sp.boxes.length; k++) {
        const b = sp.boxes[k];
        boxes.push({ ...b, z: b.z - f.startDistance });
      }
    }
    const result = checkPassable({ boxes, endZ: f.distance - f.startDistance, maxSpeed });
    assert.ok(result.ok, `start level ${start + 1} (${LEVELS[start].name}): blocked at z=${result.z?.toFixed(1)} (${result.why})`);
  }
});
