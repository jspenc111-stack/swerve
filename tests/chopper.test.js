// 3D Heli (two-thumb helicopter): physics, landing, crashes, score and course.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, LEVELS } from '../js/config.js';
import {
  createChopper, resetChopper, stepChopper, chopperMultiplier, chopperTopSpeed, chopperConfig,
  targetClimb, leverFor, groundY, jumpChopperToLevel, chopperHitboxes, chopperHits,
} from '../js/chopper.js';
import { createFlight, resetFlight, stepFlight } from '../js/flight.js';
import { levelForDistance } from '../js/levels.js';

const DT = 1 / 60;
const H = CONFIG.chopperHover;

// A fresh helicopter with nothing in the way (obstacles are cleared every frame).
function clearSky(seed = 1) {
  const c = createChopper(CONFIG, LEVELS, seed);
  c.spawner.boxes.length = 0;
  return c;
}
function run(c, seconds, lever, sx = 0, sy = 0) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    for (const e of stepChopper(c, DT, lever, sx, sy)) events.push(e.type);
    c.spawner.boxes.length = 0;
    if (c.crashed) break;
  }
  return events;
}
// Lift off and settle at a height, hovering.
function airborne(height = 4, seed = 1) {
  const c = clearSky(seed);
  run(c, 3, 1);
  c.y = height;
  c.vy = 0;
  run(c, 0.5, H);
  return c;
}

// ---- Collective (lift) ----

test('the lever maps to climb: above hover climbs, at hover holds, below sinks', () => {
  assert.equal(targetClimb(H, CONFIG), 0);
  assert.equal(targetClimb(1, CONFIG), CONFIG.chopperMaxClimb);
  assert.equal(targetClimb(0, CONFIG), -CONFIG.chopperMaxSink);
  assert.ok(targetClimb(H + 0.1, CONFIG) > 0 && targetClimb(H - 0.1, CONFIG) < 0);
  for (const vy of [-7, -3, 0, 2, 8]) assert.ok(Math.abs(targetClimb(leverFor(vy, CONFIG), CONFIG) - vy) < 1e-9);
});

test('above hover you climb, at hover you hold, below hover you sink', () => {
  const c = airborne(4);
  const y0 = c.y;
  run(c, 2, H);
  assert.ok(Math.abs(c.y - y0) < 0.01, `holds height at hover (moved ${(c.y - y0).toFixed(3)})`);
  run(c, 0.5, 0.8);
  assert.ok(c.y > y0 + 0.5, 'climbs above hover');
  const y1 = c.y;
  run(c, 1, 0.2);
  assert.ok(c.y < y1, 'sinks below hover');
});

test('climbing eases in rather than jumping', () => {
  const c = airborne(4);
  stepChopper(c, DT, 1, 0, 0);
  assert.ok(c.vy > 0 && c.vy < CONFIG.chopperMaxClimb * 0.2, `first frame vy ${c.vy.toFixed(2)}`);
  run(c, 0.2, 1);
  const mid = c.vy;
  assert.ok(mid > 0.2 * CONFIG.chopperMaxClimb && mid < 0.9 * CONFIG.chopperMaxClimb);
  run(c, 1.5, 1);
  assert.ok(c.vy > 0.95 * CONFIG.chopperMaxClimb || c.y === CONFIG.flightMaxAltitude);
});

test('the ceiling just stops the climb', () => {
  const c = airborne(8);
  run(c, 3, 1);
  assert.equal(c.y, CONFIG.flightMaxAltitude);
  assert.ok(!c.crashed);
  assert.ok(c.vy <= 0);
});

// ---- Cyclic (forward speed and sideways slide) ----

test('pushing forward speeds you up to top speed and no further', () => {
  const c = airborne(4);
  const top = c.topSpeed;
  assert.ok(Math.abs(top - CONFIG.baseSpeed * CONFIG.chopperTopSpeedFactor) < 1e-9);
  run(c, 0.5, H, 0, 1);
  assert.ok(c.speed > 0 && c.speed < top, 'accelerating');
  run(c, 10, H, 0, 1);
  assert.equal(c.speed, top);
});

test('pulling back brakes to 0 and never goes negative', () => {
  const c = airborne(4);
  run(c, 4, H, 0, 1);
  const fast = c.speed;
  run(c, 0.3, H, 0, -1);
  assert.ok(c.speed < fast);
  run(c, 5, H, 0, -1);
  assert.equal(c.speed, 0);
  const z = c.distance;
  run(c, 1, H, 0, -1);
  assert.equal(c.distance, z, 'no flying backwards');
});

test('with the stick centered, speed slowly fades', () => {
  const c = airborne(4);
  run(c, 4, H, 0, 1);
  const s0 = c.speed;
  run(c, 1, H, 0, 0);
  assert.ok(c.speed < s0, 'fades');
  assert.ok(c.speed > s0 * 0.9, 'but slowly');
});

test('sideways slides, then settles after you let go', () => {
  const c = airborne(4);
  run(c, 1, H, 1, 0);
  assert.ok(Math.abs(c.vx - CONFIG.chopperMaxSideSpeed) < 1e-6, 'reaches max slide speed');
  run(c, 0.1, H, 0, 0);
  assert.ok(c.vx > 0, 'still sliding just after letting go');
  run(c, 3, H, 0, 0);
  assert.equal(c.vx, 0, 'settles');
});

// ---- The ground and the helipad ----

test('a run starts on the helipad with the lever at 0, and stays put until lift-off', () => {
  const c = clearSky();
  assert.equal(c.y, groundY(CONFIG));
  assert.equal(c.lever, 0);
  assert.ok(c.onGround);
  assert.equal(c.padZ, c.distance);
  const events = run(c, 2, 0.3, 0, 1); // below hover: still sitting there
  assert.equal(c.y, groundY(CONFIG));
  assert.equal(c.speed, 0, "can't fly forward on the ground");
  assert.ok(!events.includes('liftoff'));
  assert.ok(!c.crashed);
  // Nothing is in the way for the first stretch.
  assert.ok(c.spawner.boxes.length === 0 || c.spawner.boxes.every((b) => b.z - b.d / 2 > c.distance + CONFIG.fogDistance - 1));
});

test('you take off from the helipad when the lever is past hover', () => {
  const c = clearSky();
  const events = run(c, 1, H + 0.2);
  assert.ok(events.includes('liftoff'));
  assert.ok(c.y > groundY(CONFIG) + 0.3);
  assert.ok(!c.onGround);
});

test('a gentle touchdown is a landing; a hard one is a crash', () => {
  const soft = airborne(3);
  const sinkSoft = leverFor(-(CONFIG.chopperCrashSink - 1.5), CONFIG);
  const events = run(soft, 4, sinkSoft);
  assert.ok(events.includes('land'), 'landed');
  assert.ok(!soft.crashed);
  assert.ok(soft.onGround);

  const hard = airborne(6);
  run(hard, 4, 0);
  assert.ok(hard.crashed, 'dropping at full sink crashes');
  assert.equal(hard.crashReason, 'hard landing');
});

test('on the ground, forward speed quickly drops to 0', () => {
  const c = airborne(2);
  run(c, 2, H, 0, 1);
  assert.ok(c.speed > 5);
  run(c, 4, leverFor(-2, CONFIG), 0, 0);
  assert.ok(c.onGround && !c.crashed);
  run(c, 1.5, 0.1, 0, 0);
  assert.equal(c.speed, 0);
});

// ---- Crashes: body and rotor ----

test('body strikes and rotor strikes crash; rings do not', () => {
  const c = airborne(4);
  chopperHitboxes(c);
  const hb = c.hitbox;
  const rb = c.rotorBox;
  // A block level with the body.
  assert.ok(chopperHits(c, [{ x: c.x + hb.halfW + 0.2, y: c.y - 0.5, z: c.distance, w: 0.6, h: 1, d: 1 }]));
  // A block that misses the narrow body but clips the wide rotor disc.
  const tip = { x: c.x + rb.halfW + 0.1, y: rb.y - 0.05, z: c.distance, w: 0.4, h: 0.5, d: 0.5 };
  assert.ok(tip.x - tip.w / 2 > c.x + hb.halfW, 'the block is beside the body');
  assert.ok(chopperHits(c, [tip]), 'rotor strike counts');
  // A block well clear of both.
  assert.ok(!chopperHits(c, [{ x: c.x + 3, y: 0, z: c.distance, w: 1, h: 9, d: 1 }]));

  // In play: a pillar beside the body but in the rotor's way ends the run.
  const p = airborne(4);
  p.spawner.boxes.push({ x: p.x + rb.halfW + 0.05, y: 0, z: p.distance + 1, w: 0.3, h: 4.5, d: 0.3 });
  p.speed = 5;
  for (let i = 0; i < 30 && !p.crashed; i++) stepChopper(p, DT, H, 0, 0);
  assert.ok(p.crashed);
  assert.equal(p.crashReason, 'rotor strike');
  // …and one straight ahead hits the body.
  const q = airborne(4);
  q.spawner.boxes.push({ x: q.x, y: 0, z: q.distance + 1, w: 0.3, h: 9, d: 0.3 });
  q.speed = 5;
  for (let i = 0; i < 30 && !q.crashed; i++) stepChopper(q, DT, H, 0, 0);
  assert.equal(q.crashReason, 'hit');

  // A ring isn't solid: flying through one scores.
  const r = airborne(4);
  r.speed = 10;
  r.spawner.rings.push({ x: r.x, y: r.y, z: r.distance + 2, size: CONFIG.ringSize, taken: false, passed: false });
  const events = [];
  for (let i = 0; i < 30; i++) for (const e of stepChopper(r, DT, H, 0, 0)) events.push(e.type);
  assert.ok(events.includes('ring'));
  assert.ok(!r.crashed);
  assert.equal(r.rings, 1);
});

// ---- Score and levels ----

test('the multiplier is ×1 at half speed or slower and ×2 at top speed', () => {
  assert.equal(chopperMultiplier(0, 20, CONFIG), 1);
  assert.equal(chopperMultiplier(10, 20, CONFIG), 1);
  assert.equal(chopperMultiplier(15, 20, CONFIG), 1.5);
  assert.equal(chopperMultiplier(20, 20, CONFIG), CONFIG.chopperMaxMultiplier);
  assert.equal(CONFIG.chopperMaxMultiplier, 2);
});

test('score = distance × multiplier, plus ring bonuses; top multiplier is remembered', () => {
  const slow = airborne(4);
  slow.speed = slow.topSpeed / 2;
  const z0 = slow.distance;
  for (let i = 0; i < 120; i++) stepChopper(slow, DT, H, 0, 0.0001);
  assert.ok(Math.abs(slow.score - Math.floor((slow.distance - z0) * CONFIG.chopperScorePerUnit)) <= 1);

  const fast = airborne(4);
  fast.speed = fast.topSpeed;
  const z1 = fast.distance;
  for (let i = 0; i < 120; i++) stepChopper(fast, DT, H, 0, 1);
  const d = fast.distance - z1;
  assert.ok(Math.abs(fast.score - Math.floor(d * 2 * CONFIG.chopperScorePerUnit)) <= 1);
  assert.equal(fast.topMultiplier, 2);
});

test('levels advance by distance only, every chopperLevelDistance', () => {
  const c = airborne(4);
  const L = CONFIG.chopperLevelDistance;
  c.distance = L - 1;
  c.speed = c.topSpeed;
  let levelUps = 0;
  for (let i = 0; i < 60; i++) for (const e of stepChopper(c, DT, H, 0, 1)) if (e.type === 'level') levelUps++;
  assert.equal(levelUps, 1);
  assert.equal(c.levelIndex, 1);
  assert.equal(c.info.level, LEVELS[1]);
  // Same distance, any speed: same level.
  const info = levelForDistance(L * 2.5, chopperConfig(CONFIG), LEVELS, {});
  assert.equal(info.absIndex, 2);
  // Top speed follows Classic's level speed (with laps and the level's speedBonus).
  const storm = levelForDistance(L * 7 + 1, chopperConfig(CONFIG), LEVELS, {});
  assert.equal(storm.level.name, 'Storm');
  const expect = (CONFIG.baseSpeed + CONFIG.speedPerLevel * 7 + 3) * CONFIG.chopperTopSpeedFactor;
  assert.ok(Math.abs(chopperTopSpeed(storm, chopperConfig(CONFIG)) - expect) < 1e-9);
  const lap2 = levelForDistance(L * LEVELS.length + 1, chopperConfig(CONFIG), LEVELS, {});
  assert.equal(lap2.lap, 2);
});

test('starting at a level and jumping to a level work', () => {
  const c = createChopper(CONFIG, LEVELS, 5);
  resetChopper(c, 6, 3);
  assert.equal(c.levelIndex, 3);
  assert.equal(c.info.level.name, LEVELS[3].name);
  assert.equal(c.distance, 3 * CONFIG.chopperLevelDistance);
  const events = jumpChopperToLevel(c, 6);
  assert.equal(events[0].type, 'level');
  assert.equal(c.levelIndex, 6);
  assert.equal(c.score, 0);
});

test('a phone hiccup never moves the helicopter further than maxFrameTime allows', () => {
  const c = airborne(4);
  c.speed = c.topSpeed;
  const z = c.distance;
  stepChopper(c, 5, H, 0, 1);
  assert.ok(c.distance - z <= c.topSpeed * CONFIG.maxFrameTime + 1e-9);
});

// ---- Course: no drones in 3D Heli, 3D Flight unchanged ----

test('the course has no drones in 3D Heli, and 3D Flight still does', () => {
  const c = createChopper(CONFIG, LEVELS, 3);
  c.invincible = true;
  let drones = 0;
  let boxes = 0;
  for (let i = 0; i < 60 * 40; i++) {
    stepChopper(c, DT, 0.6, 0, 1);
    drones += c.spawner.targets.length;
    boxes += c.spawner.lastSpawned;
  }
  assert.equal(drones, 0);
  assert.ok(boxes > 20, 'but it has obstacles');
  assert.ok(c.spawner.path.length > 10, 'and the open path is recorded for the autopilot');

  const f = createFlight(CONFIG, LEVELS, 3);
  f.invincible = true;
  resetFlight(f, 4, 0);
  let seen = 0;
  for (let i = 0; i < 60 * 20; i++) {
    stepFlight(f, DT, 0, 0, false, false);
    seen += f.spawner.targets.length;
  }
  assert.ok(seen > 0, '3D Flight still has drones');
  assert.equal(f.spawner.path.length, 0, '3D Flight does not record the path');
});

// ---- Two-thumb input (js/input.js; pure logic, no screen needed) ----

import {
  createChopperControls, thumbRole, thumbDown, thumbMove, thumbUp, updateChopperControls,
  resetChopperControls, stickThumb, leverHeld, COLLECTIVE_ZONE,
} from '../js/input.js';

const W = 1000; // screen width in pixels for these tests

test('touches keep the role of the zone they started in', () => {
  assert.equal(COLLECTIVE_ZONE, 0.4);
  assert.equal(thumbRole(100, W), 'lever');
  assert.equal(thumbRole(399, W), 'lever');
  assert.equal(thumbRole(401, W), 'stick');
  assert.equal(thumbRole(900, W), 'stick');
  const cc = createChopperControls(CONFIG);
  thumbDown(cc, 1, 100, 500, W);     // left thumb: lever
  thumbDown(cc, 2, 800, 500, W);     // right thumb: stick
  thumbMove(cc, 1, 700, 500 - CONFIG.collectiveTravelPx / 2); // wanders into the right side
  thumbMove(cc, 2, 150, 500);        // wanders into the left side
  updateChopperControls(cc, DT);
  assert.ok(Math.abs(cc.lever - 0.5) < 1e-9, 'left thumb still works the lever');
  assert.equal(cc.stickX, -1, 'right thumb still works the stick');
  assert.equal(stickThumb(cc).id, 2);
  assert.ok(leverHeld(cc));
});

test('the lever drags relatively, covers its range in collectiveTravelPx, and stays put', () => {
  const cc = createChopperControls(CONFIG);
  const T = CONFIG.collectiveTravelPx;
  thumbDown(cc, 1, 50, 600, W);
  thumbMove(cc, 1, 60, 600 - T * 0.25);
  assert.ok(Math.abs(cc.lever - 0.25) < 1e-9);
  thumbMove(cc, 1, 60, 600 - T * 2); // way past the top: clamps at 1
  assert.equal(cc.lever, 1);
  thumbMove(cc, 1, 60, 600 - T * 2 + T * 0.1); // moving down responds right away
  assert.ok(Math.abs(cc.lever - 0.9) < 1e-9);
  thumbUp(cc, 1);
  updateChopperControls(cc, 1);
  assert.ok(Math.abs(cc.lever - 0.9) < 1e-9, 'stays put when released');
  // A new touch anywhere in the zone picks up from there (no need to hit the handle).
  thumbDown(cc, 3, 300, 100, W);
  thumbMove(cc, 3, 300, 100 + T * 0.4);
  assert.ok(Math.abs(cc.lever - 0.5) < 1e-9);
});

test('crossing the hover mark flags a tiny buzz', () => {
  const cc = createChopperControls(CONFIG);
  thumbDown(cc, 1, 50, 600, W);
  thumbMove(cc, 1, 50, 600 - CONFIG.collectiveTravelPx * 0.3);
  assert.equal(cc.hoverTick, false);
  thumbMove(cc, 1, 50, 600 - CONFIG.collectiveTravelPx * 0.6);
  assert.equal(cc.hoverTick, true);
});

test('the left-handed swap puts the collective on the right', () => {
  assert.equal(thumbRole(900, W, 'right'), 'lever');
  assert.equal(thumbRole(100, W, 'right'), 'stick');
  assert.equal(thumbRole(599, W, 'right'), 'stick');
  const cc = createChopperControls(CONFIG);
  cc.side = 'right';
  thumbDown(cc, 1, 950, 500, W);
  thumbDown(cc, 2, 200, 500, W);
  thumbMove(cc, 1, 950, 500 - CONFIG.collectiveTravelPx);
  thumbMove(cc, 2, 200, 500 - CONFIG.joystickRadiusPx);
  updateChopperControls(cc, DT);
  assert.equal(cc.lever, 1);
  assert.equal(cc.stickY, 1);
  assert.equal(cc.stickX, 0);
});

test('the joystick floats where the thumb lands and springs back when released', () => {
  const cc = createChopperControls(CONFIG);
  const R = CONFIG.joystickRadiusPx;
  thumbDown(cc, 5, 700, 300, W);
  thumbMove(cc, 5, 700 + R / 2, 300 + R);
  updateChopperControls(cc, DT);
  assert.equal(cc.stickX, 0.5);
  assert.equal(cc.stickY, -1, 'pulling back');
  thumbUp(cc, 5);
  updateChopperControls(cc, DT);
  assert.ok(cc.stickY > -1 && cc.stickY < 0, 'easing back');
  for (let i = 0; i < 30; i++) updateChopperControls(cc, DT);
  assert.equal(cc.stickX, 0);
  assert.equal(cc.stickY, 0);
});

test('keyboard: W/S move the lever (it stays), arrows work the cyclic', () => {
  const cc = createChopperControls(CONFIG);
  for (let i = 0; i < 60; i++) updateChopperControls(cc, DT, { up: true });
  const held = cc.lever;
  assert.ok(held > 0.5 && held < 1);
  updateChopperControls(cc, DT, {});
  assert.equal(cc.lever, held);
  updateChopperControls(cc, DT, { fwd: true, left: true });
  assert.equal(cc.stickY, 1);
  assert.equal(cc.stickX, -1);
  resetChopperControls(cc);
  assert.equal(cc.lever, 0);
});
