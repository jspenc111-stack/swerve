// Checks js/config.js so a typo there can't break the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, LEVELS, APP_VERSION } from '../js/config.js';
import { isValidColor, PALETTE_KEYS } from '../js/levels.js';

const PATTERNS = ['scatter', 'clusters', 'gates', 'canyon', 'mixed'];

function checkPattern(p, where) {
  assert.ok(p && typeof p === 'object', `${where}: pattern missing`);
  assert.ok(PATTERNS.includes(p.type), `${where}: unknown pattern "${p.type}"`);
  const num = (k, min = 0) => {
    assert.equal(typeof p[k], 'number', `${where}: ${k} must be a number`);
    assert.ok(p[k] >= min, `${where}: ${k} too small`);
  };
  switch (p.type) {
    case 'scatter': num('density'); break;
    case 'clusters':
      num('chance'); assert.ok(p.chance <= 1, `${where}: chance must be 0–1`);
      num('min', 1); num('max', p.min); break;
    case 'gates':
      num('rowSpacing', CONFIG.cubeSize * 2);
      num('gapWidth', CONFIG.minGapWidth);
      if (p.wingCubes !== undefined) num('wingCubes', 2);
      if (p.between !== undefined) num('between'); break;
    case 'canyon':
      num('width', CONFIG.minGapWidth); num('wallDepth', CONFIG.cubeSize); num('extra'); break;
    case 'mixed':
      num('segmentLength', CONFIG.spawnStep);
      assert.ok(Array.isArray(p.sequence) && p.sequence.length > 0, `${where}: sequence must be a list`);
      p.sequence.forEach((s, i) => {
        assert.notEqual(s.type, 'mixed', `${where}: mixed can't contain mixed`);
        checkPattern(s, `${where} sequence[${i}]`);
      });
      break;
  }
}

test('APP_VERSION is set', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test('every level has all required fields', () => {
  assert.ok(LEVELS.length >= 1);
  const names = new Set();
  LEVELS.forEach((level, i) => {
    const where = `level ${i + 1}`;
    assert.equal(typeof level.name, 'string', `${where}: name`);
    assert.ok(level.name.length > 0 && level.name.length <= 20, `${where}: name length`);
    assert.ok(!names.has(level.name), `${where}: duplicate name`);
    names.add(level.name);
    checkPattern(level.pattern, where);
    assert.ok(level.palette, `${where}: palette`);
    for (const key of PALETTE_KEYS) assert.ok(key in level.palette, `${where}: palette.${key} missing`);
    if (level.speedBonus !== undefined) assert.equal(typeof level.speedBonus, 'number');
    if (level.effects) {
      const e = level.effects;
      for (const k of Object.keys(e)) assert.ok(['glow', 'roll', 'lightning'].includes(k), `${where}: unknown effect ${k}`);
      if ('glow' in e) assert.equal(typeof e.glow, 'boolean');
      if (e.roll) { assert.ok(e.roll.degrees > 0 && e.roll.degrees <= 30); assert.ok(e.roll.periodSec > 0); }
      if (e.lightning) assert.ok(e.lightning.minGapSec > 0 && e.lightning.maxGapSec >= e.lightning.minGapSec);
    }
  });
});

test('all colors are valid', () => {
  LEVELS.forEach((level, i) => {
    for (const [key, value] of Object.entries(level.palette)) {
      assert.ok(isValidColor(value), `level ${i + 1} palette.${key} = "${value}" is not #rrggbb`);
    }
  });
});

test('the ship contrasts with the ground on every level', () => {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (const level of LEVELS) {
    const [a, b] = [lum(level.palette.ship), lum(level.palette.ground)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    assert.ok(ratio >= 2.5, `${level.name}: ship/ground contrast ${ratio.toFixed(2)} too low`);
  }
});

test('tuning numbers are sensible', () => {
  for (const [key, value] of Object.entries(CONFIG)) {
    assert.equal(typeof value, 'number', `${key} should be a number`);
    assert.ok(Number.isFinite(value) && value >= 0, `${key} should be a positive number`);
  }
  assert.ok(CONFIG.minGapWidth >= CONFIG.shipWidth * 2.5 - 1e-9, 'minGapWidth must be at least 2.5× the ship width');
  assert.ok(CONFIG.hitboxScale > 0 && CONFIG.hitboxScale <= 1);
  assert.ok(CONFIG.fogStart < CONFIG.fogDistance);
  assert.ok(CONFIG.maxFrameTime <= 0.05);
  assert.ok(CONFIG.laneLeash < CONFIG.spawnBandHalfWidth);
  assert.ok(CONFIG.cameraHeight > CONFIG.cubeSize, 'camera must see the cube tops');
});
