// v1.5.3: quicker direction changes in 3D Flight.
//  - the joystick's centre follows the thumb (per axis), so turning back is instant
//  - approach() uses the boosted pull for braking as well as reversing
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approach, flightFeelPreset } from '../js/flight.js';
import {
  getFlightSteer, getSteer, createChopperControls, thumbDown, thumbMove, updateChopperControls,
} from '../js/input.js';
import { CONFIG } from '../js/config.js';

// These v1.5.3 tests use the Quick Steering feel (= v1.5.3). The other
// presets are tested in flight-feel.test.js.
const QUICK = flightFeelPreset(CONFIG, 'quick');
const R = QUICK.ringPx;
const touch = (x, y) => ({ config: CONFIG, mode: 'drag', pointers: [{ id: 1, startX: x, startY: y, x, y }] });
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// ---- Fix 1: the stick's centre follows the thumb ----

test('3D Flight joystick: dragging far right moves the centre to 55 px behind the thumb', () => {
  assert.equal(R, 55, 'ring size unchanged');
  const input = touch(200, 400);
  const p = input.pointers[0];
  p.x = 320; // 120 px right
  let out = getFlightSteer(input, {}, false, QUICK);
  assert.equal(out.x, 1);
  assert.equal(p.startX, 320 - R, 'centre slid along to 55 px behind');
  assert.equal(out.joystick.startX, 265, 'the ring (drawn at the centre) follows');
  p.x = 320 - 55; // back 55 px: middle
  out = getFlightSteer(input, {}, false, QUICK);
  close(out.x, 0, 'back 55 px gives about 0');
  p.x = 320 - 110; // back 110 px: full left
  out = getFlightSteer(input, {}, false, QUICK);
  assert.equal(out.x, -1, 'back 110 px gives full left');
  // Same the other way.
  p.x = 0;
  getFlightSteer(input, {}, false, QUICK);
  assert.equal(p.startX, R);
});

test('3D Flight joystick: the up/down axis follows the thumb too', () => {
  const input = touch(200, 400);
  const p = input.pointers[0];
  p.y = 400 - 120; // 120 px up (screen y goes down)
  let out = getFlightSteer(input, {}, false, QUICK);
  assert.equal(out.y, 1);
  assert.equal(p.startY, 280 + R);
  p.y = 280 + 55;
  close(getFlightSteer(input, {}, false, QUICK).y, 0, 'back 55 px gives about 0');
  p.y = 280 + 110;
  assert.equal(getFlightSteer(input, {}, false, QUICK).y, -1, 'back 110 px gives full down');
  // Pushed far down, then back up.
  p.y = 700;
  getFlightSteer(input, {}, false, QUICK);
  assert.equal(p.startY, 700 - R);
  p.y = 700 - 110;
  assert.equal(getFlightSteer(input, {}, false, QUICK).y, 1);
  // Inverted up/down still flips the reading.
  p.y = 900;
  assert.equal(getFlightSteer(input, {}, true, QUICK).y, 1);
});

test('3D Flight joystick: a diagonal drag still gives full sideways and full up/down together', () => {
  for (const [dx, dy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
    const input = touch(300, 300);
    const p = input.pointers[0];
    p.x = 300 + dx * 150;
    p.y = 300 + dy * 150;
    const out = getFlightSteer(input, {}, false, QUICK);
    assert.equal(out.x, dx);
    assert.equal(out.y, -dy);
    assert.equal(Math.abs(p.x - p.startX), R);
    assert.equal(Math.abs(p.y - p.startY), R);
  }
});

test('3D Flight joystick: inside the ring, the centre stays put', () => {
  const input = touch(200, 400);
  const p = input.pointers[0];
  p.x = 240;
  p.y = 370;
  getFlightSteer(input, {}, false, QUICK);
  assert.equal(p.startX, 200);
  assert.equal(p.startY, 400);
});

test('Classic drag steering is unchanged: its centre does not move', () => {
  const input = touch(200, 400);
  const p = input.pointers[0];
  p.x = 200 + CONFIG.dragRangePx * 3;
  assert.equal(getSteer(input, 1000), 1);
  assert.equal(p.startX, 200, 'centre stays where the thumb first touched');
  p.x = 200 + CONFIG.dragRangePx; // back a long way, still full right
  assert.equal(getSteer(input, 1000), 1);
  p.x = 200 - CONFIG.dragRangePx / 2;
  close(getSteer(input, 1000), -0.5, 'measured from the first touch');
});

test('3D Heli cyclic is unchanged: its centre does not move', () => {
  const cc = createChopperControls(CONFIG);
  thumbDown(cc, 2, 700, 500, 1000);
  thumbMove(cc, 2, 700 + 200, 500 - 200);
  updateChopperControls(cc, 1 / 60);
  assert.equal(cc.stickX, 1);
  assert.equal(cc.stickY, 1);
  const t = cc.thumbs[0];
  assert.equal(t.x0, 700);
  assert.equal(t.y0, 500);
  thumbMove(cc, 2, 700 + 100, 500);
  updateChopperControls(cc, 1 / 60);
  assert.equal(cc.stickX, 1, 'still full right 100 px out (70 px ring)');
  assert.equal(cc.stickY + 0, 0);
});

// ---- Fix 2: quick braking ----

test('Quick\'s boost is 2.2 (v1.5.3); top speeds unchanged', () => {
  assert.equal(QUICK.boost, 2.2);
  assert.equal(CONFIG.flightMaxSteerSpeed, 13);
  assert.equal(CONFIG.flightMaxClimbSpeed, 10);
});

test('approach(): easing the stick from 1 to 0.3 slows the jet at the boosted rate', () => {
  const dt = 1 / 60;
  const max = 13, accel = 90, boost = 2.2;
  close(approach(13, 0.3, max, accel, 10, dt, boost), 13 - accel * boost * dt, 'braking right');
  close(approach(-13, -0.3, max, accel, 10, dt, boost), -13 + accel * boost * dt, 'braking left');
  // Close to the target: lands exactly on it, no overshoot.
  close(approach(4, 0.3, max, accel, 10, dt, boost), 3.9, 'lands on the target');
});

test('approach(): reversing still uses the boosted rate', () => {
  const dt = 1 / 60;
  close(approach(13, -1, 13, 90, 10, dt, 2.2), 13 - 90 * 2.2 * dt, 'reversing');
  close(approach(-2, 1, 10, 60, 7, dt, 2), 0, 'reversing (old test values)');
});

test('approach(): speeding up uses the normal rate', () => {
  const dt = 1 / 60;
  close(approach(0, 1, 13, 90, 10, dt, 2.2), 90 * dt, 'from rest');
  close(approach(3, 1, 13, 90, 10, dt, 2.2), 3 + 90 * dt, 'faster the same way');
  close(approach(3, 0.5, 13, 90, 10, dt, 2.2), 3 + 90 * dt, 'up to a partial target');
});

test('approach(): letting go still uses friction', () => {
  const dt = 1 / 60;
  close(approach(13, 0, 13, 90, 10, dt, 2.2), 13 * Math.exp(-10 * dt), 'friction');
});
