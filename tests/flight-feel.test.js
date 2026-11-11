// v1.5.4: 3D Flight finer control.
//  - stickCurve: a softer middle on the stick (full stick is still full speed)
//  - Steering feel presets: Fine (default), Medium, Quick (= v1.5.3)
//  - the jet's bank and nose angles are eased (look only)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, stepFlight, stickCurve, flightFeelPreset } from '../js/flight.js';
import { CONFIG, LEVELS } from '../js/config.js';
import {
  getFlightSteer, getSteer, createChopperControls, thumbDown, thumbMove, updateChopperControls,
} from '../js/input.js';

const NAMES = ['fine', 'medium', 'quick'];
const close = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
const fresh = () => {
  const f = createFlight(CONFIG, LEVELS, 3);
  f.invincible = true;
  return f;
};
const clearAhead = (f) => { f.spawner.boxes.length = 0; f.spawner.targets.length = 0; };

// ---- stickCurve ----

test('stickCurve: 0 → 0 and ±1 → ±1 for any curve amount', () => {
  for (const e of [0, 0.2, 0.4, 0.6, 0.9]) {
    assert.equal(stickCurve(0, e), 0);
    close(stickCurve(1, e), 1, `e=${e}, +1`);
    close(stickCurve(-1, e), -1, `e=${e}, -1`);
  }
});

test('stickCurve: symmetric (odd) and never decreasing', () => {
  for (const e of [0, 0.4, 0.6, 0.99]) {
    let prev = -Infinity;
    for (let i = -100; i <= 100; i++) {
      const x = i / 100;
      const y = stickCurve(x, e);
      close(stickCurve(-x, e), -y, `odd at ${x}`);
      assert.ok(y >= prev, `never decreasing at ${x} (e=${e})`);
      assert.ok(Math.abs(y) <= Math.abs(x) + 1e-12, 'never stronger than the straight line');
      prev = y;
    }
  }
});

test('stickCurve: with e = 0.6, an input of 0.1 gives about 0.04; e = 0 is a straight line', () => {
  close(stickCurve(0.1, 0.6), 0.0406, 'small move', 1e-4);
  close(stickCurve(0.37, 0), 0.37, 'straight line');
});

// ---- Presets ----

test('Steering feel presets: all three exist with valid values; Fine is the default', () => {
  const P = CONFIG.flightFeelPresets;
  assert.deepEqual(Object.keys(P).sort(), [...NAMES].sort());
  for (const name of NAMES) {
    const p = P[name];
    assert.ok(p.ringPx > 0, `${name}: ringPx`);
    assert.ok(p.curve >= 0 && p.curve < 1, `${name}: curve`);
    assert.ok(p.accelScale > 0 && p.accelScale <= 1, `${name}: accelScale`);
    assert.ok(p.boost >= 1, `${name}: boost`);
  }
  assert.equal(CONFIG.flightFeelDefault, 'fine');
  assert.deepEqual(P.fine, { ringPx: 65, curve: 0.6, accelScale: 0.83, boost: 1.6 });
  assert.deepEqual(P.medium, { ringPx: 60, curve: 0.4, accelScale: 0.9, boost: 1.8 });
  assert.equal(flightFeelPreset(CONFIG, 'nonsense'), P.fine, 'unknown names give the default');
  assert.equal(flightFeelPreset(CONFIG, 'toString'), P.fine, 'only real presets');
  assert.equal(flightFeelPreset(CONFIG, 'quick'), P.quick);
});

test('Quick equals the v1.5.3 feel', () => {
  assert.deepEqual(CONFIG.flightFeelPresets.quick, { ringPx: 55, curve: 0, accelScale: 1, boost: 2.2 });
});

test('top speeds, friction, acceleration and the ceiling are unchanged', () => {
  assert.equal(CONFIG.flightMaxSteerSpeed, 13);
  assert.equal(CONFIG.flightMaxClimbSpeed, 10);
  assert.equal(CONFIG.flightSteerAccel, 90);
  assert.equal(CONFIG.climbAccel, 80);
  assert.equal(CONFIG.flightSteerFriction, 10);
  assert.equal(CONFIG.flightMaxAltitude, 12);
  assert.equal(CONFIG.maxSteerSpeed, 11, 'course layout values unchanged');
  assert.equal(CONFIG.maxClimbSpeed, 8, 'course layout values unchanged');
});

test('full stick reaches full speed (sideways and up/down) in every preset', () => {
  for (const name of NAMES) {
    const feel = flightFeelPreset(CONFIG, name);
    // Full stick after the curve is still exactly 1.
    assert.equal(stickCurve(1, feel.curve), 1);
    const f = fresh();
    f.y = 2;
    for (let i = 0; i < 60; i++) { clearAhead(f); stepFlight(f, 1 / 60, 1, 1, false, false, feel); }
    close(f.vx, CONFIG.flightMaxSteerSpeed, `${name}: sideways`);
    close(f.vy, CONFIG.flightMaxClimbSpeed, `${name}: up`);
  }
});

// ---- Physics ----

test('Fine speeds up more slowly than Quick (accelScale)', () => {
  const fine = fresh();
  const quick = fresh();
  stepFlight(fine, 1 / 60, 1, 1, false, false, flightFeelPreset(CONFIG, 'fine'));
  stepFlight(quick, 1 / 60, 1, 1, false, false, flightFeelPreset(CONFIG, 'quick'));
  close(fine.vx, 90 * 0.83 / 60, 'fine sideways');
  close(quick.vx, 90 / 60, 'quick sideways');
  close(fine.vy, 80 * 0.83 / 60, 'fine up');
  close(quick.vy, 80 / 60, 'quick up');
  assert.ok(fine.vx < quick.vx && fine.vy < quick.vy);
});

test('braking and reversing use the preset\'s boost', () => {
  for (const name of NAMES) {
    const feel = flightFeelPreset(CONFIG, name);
    const step = 90 * feel.accelScale * feel.boost / 60;
    const rev = fresh();
    rev.vx = 13;
    stepFlight(rev, 1 / 60, -1, 0, false, false, feel);
    close(rev.vx, 13 - step, `${name}: reversing`);
    const brake = fresh();
    brake.vx = -13;
    stepFlight(brake, 1 / 60, -0.2, 0, false, false, feel);
    close(brake.vx, -13 + step, `${name}: braking`);
    const up = fresh();
    up.vy = -10;
    stepFlight(up, 1 / 60, 0, 1, false, false, feel);
    close(up.vy, -10 + 80 * feel.accelScale * feel.boost / 60, `${name}: reversing up/down`);
  }
});

test('Fine still turns around (full right → half speed left) faster than v1.5.2 did (238 ms)', () => {
  const feel = flightFeelPreset(CONFIG, 'fine');
  const f = fresh();
  f.vx = 13;
  let n = 0;
  while (f.vx > -6.5 + 1e-9 && n < 600) { clearAhead(f); stepFlight(f, 1 / 60, -0.5, 0, false, false, feel); n++; }
  const ms = (n * 1000) / 60;
  assert.ok(ms < 238, `turn-around took ${ms.toFixed(0)} ms`);
});

test('with no preset given, stepFlight uses the default (Fine)', () => {
  const a = fresh();
  const b = fresh();
  stepFlight(a, 1 / 60, 1, 0);
  stepFlight(b, 1 / 60, 1, 0, false, false, flightFeelPreset(CONFIG, 'fine'));
  assert.equal(a.vx, b.vx);
});

// ---- Look smoothing ----

test('the jet\'s bank eases toward a sudden reversal instead of flipping in one step', () => {
  assert.equal(CONFIG.flightAttitudeEase, 10);
  const f = fresh();
  assert.equal(f.bankLook, 0);
  assert.equal(f.pitchLook, 0);
  const quick = flightFeelPreset(CONFIG, 'quick');
  // Hold full right until the look has settled.
  for (let i = 0; i < 120; i++) { clearAhead(f); stepFlight(f, 1 / 60, 1, 0, false, false, quick); }
  close(f.bankLook, CONFIG.flightRollDeg, 'settled at full bank', 1e-3);
  // Now the speed is flipped all at once (a sudden full reversal).
  f.vx = -CONFIG.flightMaxSteerSpeed;
  clearAhead(f);
  stepFlight(f, 1 / 60, -1, 0, false, false, quick);
  const target = -CONFIG.flightRollDeg;
  assert.ok(f.bankLook < CONFIG.flightRollDeg && f.bankLook > target + 40, `one frame later it has only moved part way (${f.bankLook.toFixed(1)}°)`);
  let prev = f.bankLook;
  for (let i = 0; i < 30; i++) {
    clearAhead(f);
    stepFlight(f, 1 / 60, -1, 0, false, false, quick);
    assert.ok(f.bankLook <= prev + 1e-12, 'keeps moving toward the new angle');
    prev = f.bankLook;
  }
  for (let i = 0; i < 60; i++) { clearAhead(f); stepFlight(f, 1 / 60, -1, 0, false, false, quick); }
  close(f.bankLook, target, 'gets there', 1e-2);
});

test('the nose angle eases too', () => {
  const f = fresh();
  f.y = 2;
  f.vy = CONFIG.flightMaxClimbSpeed;
  clearAhead(f);
  stepFlight(f, 1 / 60, 0, 1);
  assert.ok(f.pitchLook > 0 && f.pitchLook < CONFIG.flightPitchDeg * 0.5, `part way (${f.pitchLook.toFixed(2)}°)`);
});

test('look smoothing does not change the physics', () => {
  const steer = (i) => [Math.sin(i * 0.37), Math.cos(i * 0.21)];
  const a = createFlight(CONFIG, LEVELS, 5);
  const b = createFlight({ ...CONFIG, flightAttitudeEase: 1000 }, LEVELS, 5);
  a.invincible = true;
  b.invincible = true;
  for (let i = 0; i < 600; i++) {
    const [sx, sy] = steer(i);
    stepFlight(a, 1 / 60, sx, sy);
    stepFlight(b, 1 / 60, sx, sy);
  }
  assert.equal(a.vx, b.vx);
  assert.equal(a.vy, b.vy);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.deepEqual(a.hitbox, b.hitbox);
  assert.notEqual(a.bankLook, b.bankLook, 'only the look differs');
});

// ---- Joystick, tilt and keyboard ----

const touch = (x, y) => ({ config: CONFIG, mode: 'drag', pointers: [{ id: 1, startX: x, startY: y, x, y }] });
const FINE = flightFeelPreset(CONFIG, 'fine');
const MEDIUM = flightFeelPreset(CONFIG, 'medium');
const QUICK = flightFeelPreset(CONFIG, 'quick');

test('joystick: a 5 px drag gives a smaller input with Fine than with Medium, and Medium than Quick', () => {
  const at = (feel, dx) => {
    const input = touch(200, 400);
    input.pointers[0].x = 200 + dx;
    input.pointers[0].y = 400 - dx;
    return getFlightSteer(input, {}, false, feel);
  };
  for (const dx of [5, 15]) {
    const f = at(FINE, dx), m = at(MEDIUM, dx), q = at(QUICK, dx);
    assert.ok(f.x > 0 && f.x < m.x && m.x < q.x, `${dx} px sideways: ${f.x} < ${m.x} < ${q.x}`);
    assert.ok(f.y > 0 && f.y < m.y && m.y < q.y, `${dx} px up: ${f.y} < ${m.y} < ${q.y}`);
  }
  // Roughly the prototype's numbers (speed = input × top speed 13).
  close(at(QUICK, 5).x * 13, 1.18, 'Quick 5 px', 0.01);
  close(at(MEDIUM, 5).x * 13, 0.65, 'Medium 5 px', 0.01);
  close(at(FINE, 5).x * 13, 0.40, 'Fine 5 px', 0.01);
  // The default (no preset given) is Fine.
  const input = touch(200, 400);
  input.pointers[0].x = 205;
  assert.equal(getFlightSteer(input, {}).x, at(FINE, 5).x);
});

test('joystick: full deflection is still full speed, and the ring size comes from the preset', () => {
  for (const feel of [FINE, MEDIUM, QUICK]) {
    const input = touch(200, 400);
    const p = input.pointers[0];
    p.x = 200 + feel.ringPx;
    const out = getFlightSteer(input, {}, false, feel);
    assert.equal(out.x, 1);
    assert.equal(out.ringPx, feel.ringPx, 'ring size for drawing');
    p.x = 200 + feel.ringPx - 1;
    assert.ok(getFlightSteer(input, {}, false, feel).x < 1, 'just inside the ring is less than full');
  }
});

test('joystick: the centre follows the thumb at the preset\'s ringPx (both axes)', () => {
  for (const feel of [FINE, MEDIUM, QUICK]) {
    const R = feel.ringPx;
    const input = touch(200, 400);
    const p = input.pointers[0];
    p.x = 400;
    p.y = 100;
    getFlightSteer(input, {}, false, feel);
    assert.equal(p.startX, 400 - R);
    assert.equal(p.startY, 100 + R);
    p.x = 400 - 2 * R; // two ring-widths back: full the other way
    assert.equal(getFlightSteer(input, {}, false, feel).x, -1);
    assert.equal(p.startX, 400 - R, 'inside the ring, the centre stays put');
  }
});

test('joystick: diagonals still give full x and y together in every preset', () => {
  for (const feel of [FINE, MEDIUM, QUICK]) {
    for (const [dx, dy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
      const input = touch(300, 300);
      const p = input.pointers[0];
      p.x = 300 + dx * 200;
      p.y = 300 + dy * 200;
      const out = getFlightSteer(input, {}, false, feel);
      assert.equal(out.x, dx);
      assert.equal(out.y, -dy);
      assert.equal(getFlightSteer(input, {}, true, feel).y, dy, 'inverted up/down still flips');
    }
  }
});

test('tilt: the curve softens small tilts on both axes; full tilt is still full', () => {
  const tiltInput = (gamma, beta) => ({
    config: CONFIG, mode: 'tilt', pointers: [], gamma, beta, neutral: 0, neutralBeta: 0,
  });
  const small = CONFIG.tiltDeadZoneDeg + 2;
  const fine = getFlightSteer(tiltInput(small, -small), {}, false, FINE);
  const quick = getFlightSteer(tiltInput(small, -small), {}, false, QUICK);
  assert.ok(fine.x > 0 && fine.x < quick.x, `sideways: ${fine.x} < ${quick.x}`);
  assert.ok(fine.y < 0 && fine.y > quick.y, `up/down: ${fine.y} vs ${quick.y}`);
  close(fine.x, stickCurve(quick.x, FINE.curve), 'the same curve as the joystick');
  const full = getFlightSteer(tiltInput(-60, 60), {}, false, FINE);
  assert.equal(full.x, -1);
  assert.equal(full.y, 1);
});

test('keyboard steering is not curved: it stays ±1', () => {
  for (const feel of [FINE, MEDIUM, QUICK]) {
    const input = { ...touch(200, 400), left: true, upKey: true };
    input.pointers[0].x = 203; // a touch is ignored while keys are held
    const out = getFlightSteer(input, {}, false, feel);
    assert.equal(out.x, -1);
    assert.equal(out.y, 1);
  }
});

test('Classic drag is unaffected by the Steering feel (no curve, its own 80 px range)', () => {
  const input = touch(200, 400);
  input.pointers[0].x = 200 + CONFIG.dragRangePx / 4;
  close(getSteer(input, 1000), 0.25, 'straight line');
  input.pointers[0].x = 200 + CONFIG.dragRangePx * 2;
  assert.equal(getSteer(input, 1000), 1);
  // v1.6: Classic drag's centre follows the thumb at its own 80 px range.
  assert.equal(input.pointers[0].startX, 200 + CONFIG.dragRangePx, 'its centre follows at dragRangePx, not the Steering feel ring');
});

test('3D Heli cyclic is unaffected (no curve, its own 70 px ring)', () => {
  assert.equal(CONFIG.joystickRadiusPx, 70);
  const cc = createChopperControls(CONFIG);
  thumbDown(cc, 2, 700, 500, 1000);
  thumbMove(cc, 2, 700 + 7, 500 - 14);
  updateChopperControls(cc, 1 / 60);
  close(cc.stickX, 0.1, 'straight line sideways');
  close(cc.stickY, 0.2, 'straight line forward');
});
