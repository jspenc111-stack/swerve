import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, capFrameTime, resetGame, classicBaseSpeed } from '../js/game.js';
import { createFlight } from '../js/flight.js';
import { chopperTopSpeed } from '../js/chopper.js';
import { levelBaseSpeed } from '../js/levels.js';
import { CONFIG, LEVELS } from '../js/config.js';

const fresh = () => {
  const g = createGame(CONFIG, LEVELS, 42);
  g.invincible = true;
  return g;
};

const K = CONFIG.classicSpeedFactor;

test('speed starts at baseSpeed × classicSpeedFactor and ramps up gently within a level', () => {
  const g = fresh();
  assert.ok(Math.abs(g.speed - CONFIG.baseSpeed * K) < 1e-9);
  for (let i = 0; i < 60; i++) stepGame(g, 1 / 60, 0); // 1 second
  const expected = CONFIG.baseSpeed * K + CONFIG.speedRampPerSecond * 1;
  assert.ok(Math.abs(g.speed - expected) < 1e-6, `speed ${g.speed} vs ${expected}`);
});

test('speed jumps by speedPerLevel at a new level', () => {
  const g = fresh();
  let levelUps = 0;
  while (g.levelIndex < 1) {
    for (const e of stepGame(g, 1 / 60, 0)) if (e.type === 'level') levelUps++;
  }
  assert.equal(levelUps, 1);
  assert.equal(g.levelTime < 0.05, true);
  const expected = (CONFIG.baseSpeed + CONFIG.speedPerLevel + (LEVELS[1].speedBonus || 0)) * K;
  assert.ok(Math.abs(g.speed - expected) < 0.01);
});

test('the frame time is capped', () => {
  assert.equal(capFrameTime(5, CONFIG), CONFIG.maxFrameTime);
  assert.equal(capFrameTime(0.01, CONFIG), 0.01);
  assert.equal(capFrameTime(-1, CONFIG), 0);
  assert.equal(capFrameTime(NaN, CONFIG), 0);
  const g = fresh();
  stepGame(g, 10, 0); // a 10 second hiccup
  assert.ok(g.distance <= CONFIG.baseSpeed * K * CONFIG.maxFrameTime * 1.01);
});

test('the score only increases, and grows with distance', () => {
  const g = fresh();
  let last = 0;
  for (let i = 0; i < 2000; i++) {
    stepGame(g, (i % 7) / 100, i % 3 - 1);
    assert.ok(g.score >= last);
    last = g.score;
  }
  assert.equal(g.score, Math.floor(g.distance * CONFIG.scorePerUnit));
  assert.ok(g.score > 0);
});

test('steering accelerates smoothly and is capped', () => {
  const g = fresh();
  stepGame(g, 1 / 60, 1);
  assert.ok(g.vx > 0 && g.vx < CONFIG.maxSteerSpeed, 'no instant jump to full speed');
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, 1);
  assert.ok(Math.abs(g.vx - CONFIG.maxSteerSpeed) < 1e-9);
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, 0);
  assert.ok(Math.abs(g.vx) < 0.5, 'friction slows the ship when you let go');
});

test('hitting a cube ends the run', () => {
  const g = createGame(CONFIG, LEVELS, 1);
  g.spawner.cubes.push({ x: 0, z: 1, size: CONFIG.cubeSize });
  const events = stepGame(g, 1 / 60, 0);
  assert.ok(events.some((e) => e.type === 'crash'));
  assert.equal(g.crashed, true);
  const d = g.distance;
  stepGame(g, 1 / 60, 0);
  assert.equal(g.distance, d, 'nothing moves after a crash');
  resetGame(g);
  assert.equal(g.crashed, false);
  assert.equal(g.score, 0);
});

test('a run can start at any level, and the score starts from 0 there', () => {
  const g = createGame(CONFIG, LEVELS, 5);
  g.invincible = true;
  resetGame(g, 9, 3); // start at level 4
  assert.equal(g.levelIndex, 3);
  assert.equal(g.info.level.name, LEVELS[3].name);
  assert.equal(g.score, 0);
  assert.equal(g.startLevel, 3);
  assert.ok(Math.abs(g.speed - levelBaseSpeed(g.info, CONFIG) * K) < 1e-9);
  for (let i = 0; i < 60; i++) stepGame(g, 1 / 60, 0);
  assert.ok(g.score > 0 && g.score < 20, `score ${g.score} counts only this run`);
  assert.equal(g.levelIndex, 3);
  // Starting again from level 1 works too.
  resetGame(g, 10, 0);
  assert.equal(g.levelIndex, 0);
  assert.equal(g.distance, 0);
});

test('boost speeds the ship up smoothly, then eases back off', () => {
  const g = fresh();
  stepGame(g, 1 / 60, 0, true);
  assert.ok(g.speed > g.baseSpeed && g.speed < g.baseSpeed * CONFIG.boostMultiplier, 'eases in');
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, 0, true);
  assert.ok(Math.abs(g.speed - g.baseSpeed * CONFIG.boostMultiplier) < 1e-6, 'full boost');
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, 0, false);
  assert.ok(Math.abs(g.speed - g.baseSpeed) < 1e-6, 'back to normal');
});

test('boosting earns points faster (more distance)', () => {
  const a = fresh();
  const b = fresh();
  for (let i = 0; i < 300; i++) { stepGame(a, 1 / 60, 0, false); stepGame(b, 1 / 60, 0, true); }
  assert.ok(b.score > a.score * 1.3);
});

test('obstacles are always laid out for full-boost speed', () => {
  const g = fresh();
  stepGame(g, 1 / 60, 0, false);
  const expected = (CONFIG.laneSlopeFactor * CONFIG.maxSteerSpeed) / (g.baseSpeed * CONFIG.boostMultiplier);
  assert.ok(Math.abs(g.spawner.maxSlope - expected) < 1e-9);
});

test('a Classic run starts with a full field: cubes out to the fog distance, none in the start breather', () => {
  for (let level = 0; level < LEVELS.length; level++) {
    const g = createGame(CONFIG, LEVELS, 5);
    resetGame(g, 300 + level, level);
    const start = g.startDistance;
    const cubes = g.spawner.cubes;
    assert.ok(cubes.length > 20, `level ${level + 1}: the field is pre-filled (${cubes.length} cubes)`);
    let nearest = Infinity;
    let farthest = -Infinity;
    for (const c of cubes) {
      nearest = Math.min(nearest, c.z - c.size / 2);
      farthest = Math.max(farthest, c.z);
    }
    assert.ok(nearest >= start + CONFIG.breatherAfter - 1e-9,
      `level ${level + 1}: a cube at ${(nearest - start).toFixed(1)} is inside the start breather`);
    assert.ok(farthest >= start + CONFIG.fogDistance - CONFIG.spawnStep,
      `level ${level + 1}: cubes reach only ${(farthest - start).toFixed(1)} ahead`);
    assert.ok(nearest <= start + CONFIG.breatherAfter + 2 * CONFIG.spawnStep + CONFIG.cubeSize * 4,
      `level ${level + 1}: the field starts right after the breather`);
  }
});

test('during play, nothing new ever appears closer than the fog distance', () => {
  for (let level = 0; level < LEVELS.length; level++) {
    const g = fresh();
    resetGame(g, 400 + level, level);
    for (let i = 0; i < 60 * 20; i++) {
      stepGame(g, 1 / 60, Math.sin(i / 50), i % 200 < 100);
      const sp = g.spawner;
      for (let k = sp.cubes.length - sp.lastSpawned; k < sp.cubes.length; k++) {
        assert.ok(sp.cubes[k].z >= g.distance + CONFIG.fogDistance, `level ${level + 1}: a cube popped up too close`);
      }
    }
  }
});

test('Classic runs 2% faster; 3D Flight and 3D Heli speeds are unchanged', () => {
  assert.equal(CONFIG.classicSpeedFactor, 1.02);
  for (let level = 0; level < LEVELS.length; level++) {
    const g = createGame(CONFIG, LEVELS, 3);
    resetGame(g, 3, level);
    const shared = levelBaseSpeed(g.info, CONFIG);
    assert.ok(Math.abs(g.speed - shared * 1.02) < 1e-9, `Classic level ${level + 1}`);
    assert.ok(Math.abs(classicBaseSpeed(g.info, CONFIG) - shared * 1.02) < 1e-9);
    // 3D Heli's top speed still comes from the shared level speed.
    assert.ok(Math.abs(chopperTopSpeed(g.info, CONFIG) - shared * CONFIG.chopperTopSpeedFactor) < 1e-9,
      `3D Heli level ${level + 1}`);
  }
  // 3D Flight starts at the shared speed × flightSpeedFactor.
  const f = createFlight(CONFIG, LEVELS, 7);
  assert.ok(Math.abs(f.speed - CONFIG.baseSpeed * CONFIG.flightSpeedFactor) < 1e-9, `3D Flight speed ${f.speed}`);
  assert.equal(CONFIG.baseSpeed, 24, 'the shared baseSpeed is unchanged');
  assert.equal(CONFIG.speedPerLevel, 2.75, 'the shared speedPerLevel is unchanged');
});

// ---- v1.6: quicker turn-arounds (classicReverseBoost) and the eased lean ----

function quietGame() {
  // A level with no cubes, so only the steering is being tested.
  const levels = [{ name: 'Empty', pattern: { type: 'scatter', density: 0 }, palette: LEVELS[0].palette }];
  return createGame(CONFIG, levels, 5);
}

test('Classic: classicReverseBoost and shipLeanEase are set', () => {
  assert.equal(CONFIG.classicReverseBoost, 1.8);
  assert.equal(CONFIG.shipLeanEase, 12);
});

test('Classic: steering against the slide uses the boosted rate', () => {
  const g = quietGame();
  const dt = 1 / 120;
  g.vx = CONFIG.maxSteerSpeed;
  stepGame(g, dt, -1);
  const drop = CONFIG.maxSteerSpeed - g.vx;
  assert.ok(Math.abs(drop - CONFIG.steerAccel * CONFIG.classicReverseBoost * dt) < 1e-9, `dropped ${drop}`);
});

test('Classic: speeding up from rest, top speed and friction are unchanged', () => {
  const g = quietGame();
  const dt = 1 / 120;
  stepGame(g, dt, 1);
  assert.ok(Math.abs(g.vx - CONFIG.steerAccel * dt) < 1e-9, 'from rest: the normal rate');
  stepGame(g, dt, 1);
  assert.ok(Math.abs(g.vx - 2 * CONFIG.steerAccel * dt) < 1e-9, 'same way: the normal rate');
  for (let i = 0; i < 240; i++) stepGame(g, dt, 1);
  assert.ok(Math.abs(g.vx - CONFIG.maxSteerSpeed) < 1e-9, 'top speed unchanged');
  stepGame(g, dt, 0);
  assert.ok(Math.abs(g.vx - CONFIG.maxSteerSpeed * Math.exp(-CONFIG.steerFriction * dt)) < 1e-9, 'friction unchanged');
});

test('Classic: full left to full right is much quicker than before', () => {
  const g = quietGame();
  const dt = 1 / 1000;
  g.vx = -CONFIG.maxSteerSpeed;
  let stopped = null;
  let fast = null;
  for (let t = dt; t < 1 && fast === null; t += dt) {
    stepGame(g, dt, 1);
    if (stopped === null && g.vx >= 0) stopped = t;
    if (g.vx >= 0.9 * CONFIG.maxSteerSpeed) fast = t;
  }
  assert.ok(Math.abs(stopped - 0.112) < 0.004, `stops sliding the old way in ${(stopped * 1000).toFixed(0)} ms (target 112)`);
  assert.ok(Math.abs(fast - 0.292) < 0.004, `reaches 90% the new way in ${(fast * 1000).toFixed(0)} ms (target 292)`);
});

test("Classic: the ship's lean eases toward its speed (look only)", () => {
  const g = quietGame();
  const dt = 1 / 60;
  g.vx = CONFIG.maxSteerSpeed;
  stepGame(g, dt, 1);
  assert.ok(g.leanLook > 0 && g.leanLook < 0.5, `one frame in, the lean has only started (${g.leanLook})`);
  for (let i = 0; i < 60; i++) stepGame(g, dt, 1);
  assert.ok(Math.abs(g.leanLook - 1) < 0.01, 'and settles at full lean');
  // A snap reversal doesn't snap the lean.
  g.vx = -CONFIG.maxSteerSpeed;
  stepGame(g, dt, -1);
  assert.ok(g.leanLook > 0.5, 'the lean follows smoothly');
  // Look only: the same inputs give the same flight with or without easing.
  const a = quietGame();
  const b = createGame({ ...CONFIG, shipLeanEase: 3 }, a.levels, 5);
  for (let i = 0; i < 200; i++) {
    const steer = i % 50 < 25 ? 1 : -1;
    stepGame(a, dt, steer);
    stepGame(b, dt, steer);
  }
  assert.equal(a.x, b.x);
  assert.equal(a.vx, b.vx);
  assert.equal(a.distance, b.distance);
});
