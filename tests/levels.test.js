import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  levelForScore, levelBaseSpeed, levelStartDistance, inBreather,
  blendPalette, mixColor, isValidColor, bannerText, hudLabel,
} from '../js/levels.js';
import { CONFIG, LEVELS } from '../js/config.js';

const L = CONFIG.levelLength;

test('the correct level for a given score', () => {
  assert.equal(levelForScore(0, CONFIG, LEVELS).listIndex, 0);
  assert.equal(levelForScore(L - 1, CONFIG, LEVELS).listIndex, 0);
  assert.equal(levelForScore(L, CONFIG, LEVELS).listIndex, 1);
  const fourth = levelForScore(3 * L + 10, CONFIG, LEVELS);
  assert.equal(fourth.listIndex, 3);
  assert.equal(fourth.level.name, LEVELS[3].name);
  assert.equal(fourth.lap, 1);
  const last = levelForScore(LEVELS.length * L - 1, CONFIG, LEVELS);
  assert.equal(last.listIndex, LEVELS.length - 1);
});

test('after the last level it loops to level 1 as Lap 2', () => {
  const info = levelForScore(LEVELS.length * L, CONFIG, LEVELS);
  assert.equal(info.listIndex, 0);
  assert.equal(info.lap, 2);
  assert.equal(info.absIndex, LEVELS.length);
  assert.equal(levelForScore(2 * LEVELS.length * L + L, CONFIG, LEVELS).lap, 3);
  assert.equal(bannerText(info), `Lap 2 · Level 1 · ${LEVELS[0].name}`);
  assert.equal(hudLabel(info), `Lap 2 · ${LEVELS[0].name}`);
  assert.equal(bannerText(levelForScore(3 * L, CONFIG, LEVELS)), `Level 4 · ${LEVELS[3].name}`);
});

test('looping to Lap 2 increases speed', () => {
  const lap1Start = levelBaseSpeed(levelForScore(0, CONFIG, LEVELS), CONFIG);
  const lap2Start = levelBaseSpeed(levelForScore(LEVELS.length * L, CONFIG, LEVELS), CONFIG);
  const lap1End = levelBaseSpeed(levelForScore(LEVELS.length * L - 1, CONFIG, LEVELS), CONFIG);
  assert.ok(lap2Start > lap1Start);
  assert.ok(lap2Start > lap1End - (LEVELS.at(-1).speedBonus || 0));
  // Every level is at least as fast as the one before (ignoring per-level bonuses).
  for (let i = 1; i < LEVELS.length * 2; i++) {
    const a = levelForScore((i - 1) * L, CONFIG, LEVELS);
    const b = levelForScore(i * L, CONFIG, LEVELS);
    const sa = levelBaseSpeed(a, CONFIG) - (a.level.speedBonus || 0);
    const sb = levelBaseSpeed(b, CONFIG) - (b.level.speedBonus || 0);
    assert.ok(sb > sa, `level ${i + 1} should be faster`);
  }
});

test('level start distances line up with scores', () => {
  const d = levelStartDistance(3, CONFIG);
  assert.equal(levelForScore(Math.floor(d * CONFIG.scorePerUnit), CONFIG, LEVELS).absIndex, 3);
});

test('there is a breather around each level change but not mid-level', () => {
  const b = levelStartDistance(2, CONFIG);
  assert.equal(inBreather(b, CONFIG), true);
  assert.equal(inBreather(b - CONFIG.breatherBefore + 0.1, CONFIG), true);
  assert.equal(inBreather(b + CONFIG.breatherAfter - 0.1, CONFIG), true);
  assert.equal(inBreather(b + CONFIG.breatherAfter + 1, CONFIG), false);
  assert.equal(inBreather(b - CONFIG.breatherBefore - 1, CONFIG), false);
  assert.equal(inBreather(10, CONFIG), false);
});

test('palette blending returns valid colors', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const a = LEVELS[i].palette;
    const b = LEVELS[(i + 1) % LEVELS.length].palette;
    for (const t of [0, 0.25, 0.5, 0.99, 1, -1, 2]) {
      const p = blendPalette(a, b, t);
      for (const [key, value] of Object.entries(p)) {
        if (key === 'grid' && value === null) continue;
        assert.ok(isValidColor(value), `${key}=${value} at t=${t}`);
      }
    }
    assert.equal(blendPalette(a, b, 0).sky, a.sky.toLowerCase());
    assert.equal(blendPalette(a, b, 1).sky, b.sky.toLowerCase());
  }
  assert.equal(mixColor('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(blendPalette({ ...LEVELS[0].palette, grid: undefined }, { ...LEVELS[1].palette, grid: undefined }, 0.5).grid, null);
});
