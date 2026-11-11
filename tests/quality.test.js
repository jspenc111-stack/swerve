// Auto quality: the step-down / step-up decision (pure logic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuality, updateQuality, qualityScale, resetQualityRun, pauseQuality } from '../js/quality.js';
import { CONFIG } from '../js/config.js';

const SMOOTH = 1000 / 60;
const SLOW = SMOOTH * 1.6;

// Feed `seconds` of frames of `ms` each; returns the list of changes.
function run(q, ms, seconds, allowUp = true) {
  const changes = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const c = updateQuality(q, ms, allowUp);
    if (c) changes.push(c);
  }
  return changes;
}

test('quality: stays at the sharpest step while frames are smooth', () => {
  const q = createQuality();
  assert.deepEqual(run(q, SMOOTH, 60), []);
  assert.equal(q.step, 0);
  assert.equal(qualityScale(q), 2);
  assert.equal(q.lite, false);
});

test('quality: steps down after about 2 slow seconds, not sooner', () => {
  const q = createQuality();
  // The first second only fills the 60-frame average; 2 s of "slow" follow.
  assert.deepEqual(run(q, SLOW, 2.5), []);
  assert.deepEqual(run(q, SLOW, 1.5), ['down']);
  assert.equal(q.step, 1);
  assert.equal(qualityScale(q), 1.5);
});

test('quality: a short slow spell does not change anything', () => {
  const q = createQuality();
  run(q, SMOOTH, 5);
  assert.deepEqual(run(q, SLOW, 1.2), []);
  assert.deepEqual(run(q, SMOOTH, 5), []);
  assert.equal(q.step, 0);
});

test('quality: never goes below the lowest step; then switches effects to Lite once', () => {
  const q = createQuality();
  const changes = run(q, SLOW, 60);
  assert.deepEqual(changes, ['down', 'down', 'lite']);
  assert.equal(q.step, q.steps.length - 1);
  assert.equal(qualityScale(q), 1.25);
  assert.equal(q.lite, true);
  assert.deepEqual(run(q, SLOW, 60), [], 'nothing further to lower');
  assert.equal(q.step, q.steps.length - 1);
});

test('quality: steps back up after 10 smooth seconds, at most once every 20 seconds', () => {
  const q = createQuality();
  run(q, SLOW, 12);
  assert.equal(q.step, 2);
  const t = [];
  let clock = 0;
  for (; clock < 60000; clock += SMOOTH) if (updateQuality(q, SMOOTH)) t.push(clock / 1000);
  assert.equal(t.length, 2, 'two steps back up to the top');
  assert.ok(t[0] >= 10 && t[0] < 12.5, `first step up after ~10 smooth seconds (was ${t[0].toFixed(1)})`);
  assert.ok(t[1] - t[0] >= 20, `second step up at least 20 s later (was ${(t[1] - t[0]).toFixed(1)})`);
  assert.equal(q.step, 0);
});

test('quality: never steps up mid-crash', () => {
  const q = createQuality();
  run(q, SLOW, 5);
  assert.equal(q.step, 1);
  assert.deepEqual(run(q, SMOOTH, 40, false), []);
  assert.equal(q.step, 1);
  assert.deepEqual(run(q, SMOOTH, 1, true), ['up']);
});

test("quality: doesn't flip-flop — a step up that brings the slowness back isn't retried", () => {
  const q = createQuality();
  run(q, SLOW, 5);                 // down to step 1
  assert.equal(q.step, 1);
  assert.deepEqual(run(q, SMOOTH, 25), ['up']);
  assert.deepEqual(run(q, SLOW, 5), ['down']); // step 0 is too much for this phone
  assert.equal(q.step, 1);
  assert.deepEqual(run(q, SMOOTH, 120), [], 'stays at step 1 from now on');
  assert.equal(q.step, 1);
});

test('quality: frames between "smooth" and "too slow" change nothing either way', () => {
  const q = createQuality();
  run(q, SLOW, 5);
  assert.equal(q.step, 1);
  assert.deepEqual(run(q, SMOOTH * 1.18, 60), []);
  assert.equal(q.step, 1);
});

test('quality: learns a 120 Hz screen, and judges "slow" against it', () => {
  const q = createQuality();
  run(q, 1000 / 120, 3);
  assert.ok(Math.abs(q.refreshMs - 1000 / 120) < 0.01);
  // 60 fps on a 120 Hz screen is too slow.
  assert.deepEqual(run(q, 1000 / 60, 4), ['down']);
});

test('quality: slow frames never make it think the screen is slower', () => {
  const q = createQuality();
  run(q, 40, 5);
  assert.ok(Math.abs(q.refreshMs - 1000 / 60) < 0.01);
});

test('quality: hiccups and pauses are ignored; a new run goes back to the chosen effects', () => {
  const q = createQuality();
  run(q, SMOOTH, 3);
  assert.equal(updateQuality(q, 900), null);
  assert.equal(updateQuality(q, 0), null);
  assert.equal(q.step, 0);
  run(q, SLOW, 60);
  assert.equal(q.lite, true);
  const step = q.step;
  resetQualityRun(q);
  assert.equal(q.lite, false);
  assert.equal(q.step, step, 'the resolution step is kept');
  run(q, SLOW, 1.5);
  pauseQuality(q);
  assert.deepEqual(run(q, SLOW, 2.5), [], 'a pause restarts the measurement');
});

test('quality: the config values are sensible', () => {
  assert.ok(Array.isArray(CONFIG.qualitySteps) && CONFIG.qualitySteps.length >= 2);
  for (let i = 1; i < CONFIG.qualitySteps.length; i++) assert.ok(CONFIG.qualitySteps[i] < CONFIG.qualitySteps[i - 1]);
  assert.ok(CONFIG.qualitySteps[0] <= CONFIG.maxDevicePixelRatio);
  assert.ok(CONFIG.qualitySteps.at(-1) >= 1);
  assert.ok(CONFIG.qualitySlowFactor > 1.1);
  assert.ok(CONFIG.qualityDownSec > 0 && CONFIG.qualityUpSec > CONFIG.qualityDownSec && CONFIG.qualityUpGapSec >= CONFIG.qualityUpSec);
});
