// Helicopter mode: lift and gravity, speed, crashes, gems and the start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeli, resetHeli, stepHeli, heliHitbox } from '../js/heli.js';
import { heliBaseSpeed, heliLevelAt, heliLevelLength } from '../js/caveSpawner.js';
import { CONFIG, LEVELS } from '../js/config.js';

// A helicopter flying (already started) in a wide, empty cave.
function flying(seed = 3) {
  const h = createHeli(CONFIG, LEVELS, seed);
  stepHeli(h, 1 / 60, true); // first touch
  clearCave(h);
  return h;
}

// Make every built column a wide, flat cave with nothing in it.
function clearCave(h, top = 14, bottom = 2) {
  const sp = h.spawner;
  for (const c of sp.columns) { c.top = top; c.bottom = bottom; }
  sp.obstacles.length = 0;
  sp.gems.length = 0;
  sp.pending.length = 0;
}

const run = (h, seconds, holding) => {
  const events = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    for (const e of stepHeli(h, 1 / 60, holding)) events.push(e.type);
    clearCaveAhead(h);
  }
  return events;
};

// Keep newly built columns empty too.
function clearCaveAhead(h) {
  const sp = h.spawner;
  for (const c of sp.columns) if (c.top !== 14) { c.top = 14; c.bottom = 2; }
  sp.obstacles.length = 0;
  sp.gems.length = 0;
}

test('nothing moves before the first hold', () => {
  const h = createHeli(CONFIG, LEVELS, 1);
  const { distance, y } = h;
  for (let i = 0; i < 120; i++) stepHeli(h, 1 / 60, false);
  assert.equal(h.distance, distance);
  assert.equal(h.y, y);
  assert.equal(h.started, false);
  assert.equal(h.score, 0);
  const events = stepHeli(h, 1 / 60, true);
  assert.equal(h.started, true);
  assert.ok(events.some((e) => e.type === 'start'));
  assert.ok(h.distance > distance);
});

test('holding climbs and letting go drops', () => {
  const h = flying();
  const y0 = h.y;
  run(h, 0.3, true);
  assert.ok(h.vy > 0, 'climbing');
  assert.ok(h.y > y0);
  const y1 = h.y;
  run(h, 0.8, false);
  assert.ok(h.vy < 0, 'falling');
  assert.ok(h.y < y1);
  assert.equal(h.crashed, false);
});

test('up/down speed is clamped to heliMaxVSpeed', () => {
  const h = flying();
  h.invincible = true;
  h.y = 3;
  run(h, 0.6, true);
  assert.equal(h.vy, CONFIG.heliMaxVSpeed);
  h.y = 13;
  h.vy = 0;
  run(h, 0.6, false);
  assert.equal(h.vy, -CONFIG.heliMaxVSpeed);
});

test('the nose pitches up when climbing and down when falling', () => {
  const h = flying();
  h.invincible = true;
  run(h, 0.6, true);
  assert.ok(h.pitch > 0 && h.pitch <= CONFIG.heliPitchDeg * Math.PI / 180 + 1e-9);
  run(h, 1, false);
  assert.ok(h.pitch < 0);
});

test('forward speed rises by level, by lap and within a level', () => {
  const at = (absIndex) => heliBaseSpeed(heliLevelAt(absIndex * heliLevelLength(CONFIG) + 1, CONFIG, LEVELS, {}), CONFIG);
  assert.equal(at(0), CONFIG.heliSpeed);
  assert.ok(Math.abs(at(1) - (CONFIG.heliSpeed + CONFIG.heliSpeedPerLevel)) < 1e-9);
  const lap2 = at(LEVELS.length);
  assert.ok(Math.abs(lap2 - (CONFIG.heliSpeed + CONFIG.heliSpeedPerLevel * LEVELS.length + CONFIG.heliLapSpeedBonus)) < 1e-9);
  const h = flying();
  h.invincible = true;
  const s0 = h.speed;
  run(h, 5, false);
  assert.ok(h.speed > s0, 'speeds up within a level');
  assert.ok(Math.abs(h.speed - (CONFIG.heliSpeed + CONFIG.heliSpeedRampPerSecond * h.levelTime)) < 1e-6);
});

test('a level change is reported', () => {
  const h = flying();
  h.invincible = true;
  h.distance = heliLevelLength(CONFIG) - 0.05;
  const events = run(h, 0.1, false);
  assert.ok(events.includes('level'));
  assert.equal(h.levelIndex, 1);
});

test('the frame-time cap is applied', () => {
  const h = flying();
  const d = h.distance;
  const y = h.y;
  stepHeli(h, 1, false); // a one-second hiccup
  assert.ok(h.distance - d <= h.speed * CONFIG.maxFrameTime + 1e-9);
  assert.ok(Math.abs(h.y - y) < 0.1);
});

const crashes = (setup) => {
  const h = flying();
  setup(h);
  stepHeli(h, 1 / 60, false);
  return h.crashed;
};

test('crashes on the ceiling and the floor', () => {
  assert.equal(crashes((h) => { h.y = 13.9; }), true);
  assert.equal(crashes((h) => { h.y = 2.1; }), true);
  assert.equal(crashes((h) => { h.y = 8; }), false);
});

test('crashes into a block, a spike and a gate', () => {
  const block = (h) => ({ kind: 'block', x: h.distance - 0.5, w: 1.5, y0: h.y - 1, y1: h.y + 1 });
  assert.equal(crashes((h) => { h.spawner.obstacles.push(block(h)); }), true);
  const spike = (h) => ({ kind: 'spike', dir: -1, x: h.distance - 0.6, w: 1.3, cx: h.distance - 0.4, cw: 0.9, y0: h.y, y1: 16, base: 14 });
  assert.equal(crashes((h) => { h.spawner.obstacles.push(spike(h)); }), true);
  const gate = (h, lo, hi) => ({ kind: 'gate', x: h.distance, w: 0.9, y0: 0, y1: 16, winLo: lo, winHi: hi });
  assert.equal(crashes((h) => { h.spawner.obstacles.push(gate(h, h.y + 0.5, h.y + 4)); }), true, 'below the window');
  assert.equal(crashes((h) => { h.spawner.obstacles.push(gate(h, h.y - 1.5, h.y + 1.5)); }), false, 'through the window');
});

test('spikes only collide on 70% of their drawn width', () => {
  // A spike whose drawn edge reaches the hitbox, but whose collision strip doesn't.
  const h0 = flying();
  const hb = heliHitbox(h0);
  const w = 2;
  const x = hb.x + hb.halfW + 0.3 - 0.15 * w; // drawn from here; collision starts 0.15·w later
  assert.equal(crashes((h) => {
    h.spawner.obstacles.push({ kind: 'spike', dir: -1, x, w, cx: x + 0.15 * w, cw: 0.7 * w, y0: h.y - 2, y1: 16, base: 14 });
  }), false);
});

test('near-misses with the rotor tips do not crash', () => {
  // Rocks just above the hitbox (where the rotor is drawn) and just past the
  // nose: the rotor blades and the drawing's edges don't count.
  assert.equal(crashes((h) => {
    const hb = heliHitbox(h);
    const top = h.y + hb.halfH + 0.05;
    h.spawner.obstacles.push({ kind: 'block', x: h.distance - 1.2, w: 2.4, y0: top, y1: top + 2 });
  }), false);
  const scaled = (CONFIG.heliHeight * CONFIG.heliHitboxScale) / 2;
  assert.ok(scaled < CONFIG.heliHeight / 2, 'hitbox smaller than the drawing');
});

test('gems add points once each and are not solid', () => {
  const h = flying();
  h.spawner.gems.push({ x: h.distance + 0.2, y: h.y, r: 0.42, taken: false });
  const events = [];
  for (let i = 0; i < 30; i++) for (const e of stepHeli(h, 1 / 60, false)) events.push(e.type);
  assert.equal(events.filter((e) => e === 'gem').length, 1);
  assert.equal(h.gems, 1);
  assert.equal(h.crashed, false);
  const distancePoints = Math.floor((h.distance - h.startDistance) * CONFIG.heliScorePerUnit);
  assert.equal(h.score, distancePoints + CONFIG.heliGemBonus);
});

test('starting at a later level starts the score at 0', () => {
  const h = createHeli(CONFIG, LEVELS, 5);
  resetHeli(h, 5, 3);
  assert.equal(h.score, 0);
  assert.equal(h.levelIndex, 3);
  assert.equal(h.info.level.name, LEVELS[3].name);
  assert.ok(Math.abs(h.distance - 3 * heliLevelLength(CONFIG)) < 1e-9);
});
