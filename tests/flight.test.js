// 3D Flight mode: movement, limits, rings, crashes and score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, resetFlight, stepFlight } from '../js/flight.js';
import { flightHitbox, hitsBox } from '../js/collision.js';
import { CONFIG, LEVELS } from '../js/config.js';

const fresh = () => {
  const f = createFlight(CONFIG, LEVELS, 3);
  f.invincible = true;
  return f;
};
const run = (f, seconds, sx, sy, boost = false) => {
  let events = [];
  for (let i = 0; i < seconds * 60; i++) events = events.concat(stepFlight(f, 1 / 60, sx, sy, boost).slice());
  return events;
};

test('the jet starts at the start altitude and climbs/dives smoothly', () => {
  const f = fresh();
  assert.equal(f.y, CONFIG.flightStartAltitude);
  stepFlight(f, 1 / 60, 0, 1);
  assert.ok(f.vy > 0 && f.vy < CONFIG.maxClimbSpeed, 'no instant jump to full climb');
  run(f, 0.3, 0, 1);
  assert.ok(f.y > CONFIG.flightStartAltitude);
  run(f, 1, 0, 0);
  assert.ok(Math.abs(f.vy) < 0.5, 'drifting stops when you let go');
});

test('altitude stays between the ground and the ceiling, without crashing', () => {
  const f = createFlight(CONFIG, LEVELS, 4); // not invincible
  run(f, 3, 0, 1);
  assert.equal(f.y, CONFIG.flightMaxAltitude);
  run(f, 4, 0, -1);
  assert.equal(f.y, CONFIG.flightMinAltitude);
  assert.equal(f.crashed, false);
});

test('sideways steering works like Classic', () => {
  const f = fresh();
  run(f, 1, 1, 0);
  assert.ok(Math.abs(f.vx - CONFIG.maxSteerSpeed) < 1e-9);
  assert.ok(f.x > 5);
});

test('speed is a share of Classic speed, and boost multiplies it', () => {
  const f = fresh();
  stepFlight(f, 1 / 60, 0, 0);
  const expected = CONFIG.baseSpeed * CONFIG.flightSpeedFactor + CONFIG.speedRampPerSecond / 60;
  assert.ok(Math.abs(f.speed - expected) < 1e-6);
  run(f, 2, 0, 0, true);
  assert.ok(Math.abs(f.speed - f.baseSpeed * CONFIG.boostMultiplier) < 1e-6);
});

test('flying through a ring gives bonus points; missing it does not', () => {
  const f = fresh();
  f.spawner.rings.push({ x: 0, y: f.y, z: f.distance + 1, size: CONFIG.ringSize, taken: false, passed: false });
  f.spawner.rings.push({ x: 10, y: f.y, z: f.distance + 2, size: CONFIG.ringSize, taken: false, passed: false });
  const events = run(f, 0.5, 0, 0);
  assert.equal(events.filter((e) => e.type === 'ring').length, 1);
  assert.equal(f.rings, 1);
  assert.equal(f.bonus, CONFIG.ringBonus);
  assert.ok(f.score >= CONFIG.ringBonus);
});

test('the score only goes up', () => {
  const f = fresh();
  let last = 0;
  for (let i = 0; i < 1500; i++) {
    stepFlight(f, (i % 5) / 90, (i % 3) - 1, ((i >> 4) % 3) - 1, i % 200 < 50);
    assert.ok(f.score >= last);
    last = f.score;
  }
  assert.ok(f.score > 0);
});

test('hitting a box ends the run, flying over or under it does not', () => {
  const f = createFlight(CONFIG, LEVELS, 8);
  const y = f.y;
  // A box just below the jet: no crash.
  f.spawner.boxes.push({ x: 0, y: 0, z: f.distance + 0.5, w: 3, h: y - 0.5, d: 2 });
  // A box just above the jet: no crash.
  f.spawner.boxes.push({ x: 0, y: y + 0.5, z: f.distance + 0.5, w: 3, h: 3, d: 2 });
  stepFlight(f, 1 / 60, 0, 0);
  assert.equal(f.crashed, false);
  f.spawner.boxes.push({ x: 0, y: y - 0.3, z: f.distance + 0.5, w: 1, h: 0.6, d: 1 });
  const events = stepFlight(f, 1 / 60, 0, 0);
  assert.ok(events.some((e) => e.type === 'crash'));
  assert.equal(f.crashed, true);
});

test('a run can start at any level, with the score starting at 0', () => {
  const f = fresh();
  resetFlight(f, 9, 5);
  assert.equal(f.levelIndex, 5);
  assert.equal(f.info.level.name, LEVELS[5].name);
  assert.equal(f.score, 0);
  run(f, 1, 0, 0);
  assert.ok(f.score > 0 && f.score < 40);
});

test('3D collision: overlap needed in all three directions, touching is not a hit', () => {
  const hb = flightHitbox(0, 5, 10, CONFIG);
  const box = (x, y, z, w, h, d) => ({ x, y, z, w, h, d });
  assert.equal(hitsBox(hb, box(0, 4, 10, 2, 2, 2)), true);
  assert.equal(hitsBox(hb, box(0, 5 + hb.halfH, 10, 2, 2, 2)), false, 'box resting on top of hitbox');
  assert.equal(hitsBox(hb, box(0, 5 - hb.halfH - 2, 10, 2, 2, 2)), false, 'box just under');
  assert.equal(hitsBox(hb, box(hb.halfW + 1, 4, 10, 2, 2, 2)), false, 'box just beside');
  assert.equal(hitsBox(hb, box(0, 4, 10 + hb.halfD + 1, 2, 2, 2)), false, 'box just ahead');
  assert.ok(hb.halfW < CONFIG.flightShipSpan / 2, 'hitbox is smaller than the drawn jet');
});

// ---- Shooting --------------------------------------------------------------

const drone = (f, dz, big = false, dx = 0) => {
  const size = big ? CONFIG.bigTargetSize : CONFIG.targetSize;
  const t = {
    x0: f.x + dx, x: f.x + dx, y: f.y, z: f.distance + dz, size, amp: 0, phase: 0,
    hp: big ? CONFIG.bigTargetHits : 1, maxHp: big ? CONFIG.bigTargetHits : 1, big, alive: true, flash: 0,
  };
  f.spawner.targets.push(t);
  return t;
};
const clearAhead = (f) => { f.spawner.boxes.length = 0; f.spawner.targets.length = 0; };

test('auto-fire shoots fireRate shots a second, only when firing is on', () => {
  const f = fresh();
  clearAhead(f);
  let shots = 0;
  for (let i = 0; i < 60; i++) {
    stepFlight(f, 1 / 60, 0, 0, false, false);
    clearAhead(f);
  }
  assert.equal(f.bullets.length, 0, 'no shots with auto-fire off');
  for (let i = 0; i < 60; i++) {
    shots += stepFlight(f, 1 / 60, 0, 0, false, true).filter((e) => e.type === 'shot').length;
    clearAhead(f);
  }
  assert.ok(shots >= CONFIG.fireRate - 1 && shots <= CONFIG.fireRate + 1, `${shots} shots in one second`);
});

test('a shot destroys a small drone and scores its points', () => {
  const f = fresh();
  clearAhead(f);
  const t = drone(f, 25);
  const events = [];
  for (let i = 0; i < 60 && t.alive; i++) events.push(...stepFlight(f, 1 / 60, 0, 0, false, true));
  assert.equal(t.alive, false);
  assert.equal(f.kills, 1);
  assert.equal(f.bonus, CONFIG.targetPoints);
  const d = events.find((e) => e.type === 'destroy');
  assert.ok(d && d.points === CONFIG.targetPoints && d.big === false);
  assert.ok(f.score >= CONFIG.targetPoints);
});

test(`a big drone takes ${CONFIG.bigTargetHits} hits`, () => {
  const f = fresh();
  clearAhead(f);
  const t = drone(f, 40, true);
  const events = [];
  for (let i = 0; i < 120 && t.alive; i++) events.push(...stepFlight(f, 1 / 60, 0, 0, false, true));
  assert.equal(t.alive, false);
  assert.equal(events.filter((e) => e.type === 'hit').length, CONFIG.bigTargetHits - 1);
  assert.equal(f.bonus, CONFIG.bigTargetPoints);
});

test('aim assist helps shots hit a drone slightly off the line of fire', () => {
  const f = fresh();
  clearAhead(f);
  const t = drone(f, 30, false, 1.6); // off to the side: straight shots would miss
  for (let i = 0; i < 60 && t.alive; i++) stepFlight(f, 1 / 60, 0, 0, false, true);
  assert.equal(t.alive, false);
});

test('shots stop at obstacles and cannot hit drones behind them', () => {
  const f = fresh();
  clearAhead(f);
  f.spawner.boxes.push({ x: f.x, y: 0, z: f.distance + 15, w: 6, h: 12, d: 1.2 });
  const t = drone(f, 30);
  for (let i = 0; i < 40; i++) stepFlight(f, 1 / 60, 0, 0, false, true);
  assert.equal(t.alive, true, 'the wall protected the drone');
  assert.equal(f.kills, 0);
});

test('flying into a drone is a crash', () => {
  const f = createFlight(CONFIG, LEVELS, 21);
  clearAhead(f);
  drone(f, 0.5);
  const events = stepFlight(f, 1 / 60, 0, 0, false, false);
  assert.ok(events.some((e) => e.type === 'crash'));
});

test('drones sway side to side but stay within their sway', () => {
  const f = fresh();
  clearAhead(f);
  const t = drone(f, 60);
  t.amp = 1.5;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 300; i++) {
    stepFlight(f, 1 / 60, 0, 0, false, false);
    f.spawner.boxes.length = 0;
    min = Math.min(min, t.x);
    max = Math.max(max, t.x);
  }
  assert.ok(max - min > 2, 'it moves');
  assert.ok(min >= t.x0 - 1.5 - 1e-9 && max <= t.x0 + 1.5 + 1e-9, 'within its sway');
});
