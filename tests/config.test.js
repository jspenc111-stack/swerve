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
  if (p.swing !== undefined) {
    assert.ok(p.type === 'scatter' || p.type === 'clusters', `${where}: swing only works on scatter and clusters`);
    assert.equal(typeof p.swing, 'number', `${where}: swing must be a number`);
    assert.ok(p.swing > 0 && p.swing <= CONFIG.laneLeash - 1, `${where}: swing must be above 0 and at most laneLeash − 1`);
  }
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

const FLIGHT = ['floaters', 'pillars', 'frames', 'mixed'];
function checkFlight(p, where) {
  assert.ok(p && typeof p === 'object', `${where}: flight pattern missing`);
  assert.ok(FLIGHT.includes(p.type), `${where}: unknown flight pattern "${p.type}"`);
  const num = (k, min = 0) => {
    assert.equal(typeof p[k], 'number', `${where}: ${k} must be a number`);
    assert.ok(p[k] >= min, `${where}: ${k} too small`);
  };
  if (p.ringSpacing !== undefined) num('ringSpacing');
  switch (p.type) {
    case 'floaters': num('density'); num('minSize', 0.5); num('maxSize', p.minSize); break;
    case 'pillars': num('chance'); assert.ok(p.chance <= 1); num('minHeight', 0.5); break;
    case 'frames':
      num('spacing', 1); num('holeWidth', CONFIG.minGapWidth); num('holeHeight', CONFIG.minGapHeight);
      num('extent', 1); num('depth', 0.5);
      assert.ok(p.depth <= CONFIG.spawnStep, `${where}: depth must fit in one spawn step`);
      break;
    case 'mixed':
      num('segmentLength', CONFIG.spawnStep);
      assert.ok(Array.isArray(p.sequence) && p.sequence.length > 0);
      p.sequence.forEach((q, i) => {
        assert.notEqual(q.type, 'mixed');
        checkFlight(q, `${where} sequence[${i}]`);
      });
      break;
  }
}

test('every level has a valid 3D Flight layout', () => {
  LEVELS.forEach((level, i) => checkFlight(level.flight, `level ${i + 1}`));
  assert.ok(CONFIG.flightMinAltitude < CONFIG.flightStartAltitude);
  assert.ok(CONFIG.flightStartAltitude < CONFIG.flightMaxAltitude);
  assert.ok(CONFIG.flightMaxAltitude - CONFIG.flightMinAltitude > CONFIG.minGapHeight * 2);
  assert.ok(CONFIG.minGapHeight >= CONFIG.flightShipHeight * 2.5);
  assert.ok(CONFIG.flightHitboxScale > 0 && CONFIG.flightHitboxScale <= 1);
  assert.ok(CONFIG.ringSize >= CONFIG.minGapWidth);
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

const HELI = ['cave', 'spikes', 'gates', 'snake', 'mixed'];
function checkHeli(p, where) {
  assert.ok(p && typeof p === 'object', `${where}: heli pattern missing`);
  assert.ok(HELI.includes(p.type), `${where}: unknown heli pattern "${p.type}"`);
  const num = (k, min = 0) => {
    assert.equal(typeof p[k], 'number', `${where}: ${k} must be a number`);
    assert.ok(p[k] >= min, `${where}: ${k} too small`);
  };
  if (p.speedBonus !== undefined) num('speedBonus');
  if (p.type === 'mixed') {
    num('segmentLength', 20);
    assert.ok(Array.isArray(p.sequence) && p.sequence.length > 0, `${where}: sequence must be a list`);
    p.sequence.forEach((q, i) => {
      assert.notEqual(q.type, 'mixed', `${where}: mixed can't contain mixed`);
      checkHeli(q, `${where} sequence[${i}]`);
    });
    return;
  }
  num('opening', CONFIG.heliMinGap);
  // Room for the opening (plus the wider breather) with both walls on screen.
  assert.ok(p.opening + 2 <= CONFIG.heliWorldHeight - 2, `${where}: opening too big for the screen`);
  num('wander'); assert.ok(p.wander <= 1, `${where}: wander must be 0–1`);
  num('roughness'); assert.ok(p.roughness <= 1, `${where}: roughness must be 0–1`);
  switch (p.type) {
    case 'cave': num('blockSpacing', 4); num('blockMin', 0.5); num('blockMax', p.blockMin); break;
    case 'spikes':
      num('spikeChance'); assert.ok(p.spikeChance <= 1, `${where}: spikeChance must be 0–1`);
      num('spikeMin', 0.5); num('spikeMax', p.spikeMin); break;
    case 'gates': num('spacing', 4); num('window', CONFIG.heliMinGap); break;
  }
}

test('every level has a valid Helicopter cave', () => {
  LEVELS.forEach((level, i) => checkHeli(level.heli, `level ${i + 1}`));
  assert.ok(CONFIG.heliLift > CONFIG.heliGravity, 'holding must make you climb');
  assert.ok(CONFIG.heliMinGap >= CONFIG.heliHeight * 2.5, 'heliMinGap must be at least 2.5× the helicopter height');
  assert.ok(CONFIG.heliHitboxScale > 0 && CONFIG.heliHitboxScale <= 1);
  assert.ok(CONFIG.heliScreenX > 0 && CONFIG.heliScreenX < 0.5);
  assert.ok(CONFIG.caveSlopeFactor > 0 && CONFIG.caveSlopeFactor <= 1);
  assert.ok(CONFIG.caveCurveFactor > 0 && CONFIG.caveCurveFactor <= 1);
  assert.ok(CONFIG.caveStep > 0 && CONFIG.caveStep <= 1);
  assert.ok(CONFIG.heliGemSpacing > 0);
});

const CHOPPER_KEYS = [
  'chopperTopSpeedFactor', 'chopperForwardAccel', 'chopperBrake', 'chopperForwardDrag',
  'chopperSideAccel', 'chopperMaxSideSpeed', 'chopperSideFriction', 'chopperHover',
  'chopperMaxClimb', 'chopperMaxSink', 'chopperClimbEase', 'chopperCrashSink', 'collectiveTravelPx',
  'chopperPitchDeg', 'chopperRollDeg', 'chopperLength', 'chopperBodyWidth', 'chopperBodyHeight',
  'chopperRotorDiameter', 'chopperHitboxScale', 'chopperCameraBack', 'chopperCameraAbove',
  'chopperScorePerUnit', 'chopperMaxMultiplier', 'chopperLevelDistance',
];

test('3D Heli values are all present and sensible', () => {
  for (const k of CHOPPER_KEYS) {
    assert.equal(typeof CONFIG[k], 'number', `${k} missing`);
    assert.ok(Number.isFinite(CONFIG[k]) && CONFIG[k] > 0, `${k} must be above 0`);
  }
  assert.ok(CONFIG.chopperHover > 0 && CONFIG.chopperHover < 1, 'chopperHover must be between 0 and 1');
  assert.ok(CONFIG.chopperTopSpeedFactor <= 1, 'top speed is at most Classic speed');
  assert.ok(CONFIG.chopperHitboxScale > 0 && CONFIG.chopperHitboxScale <= 1);
  assert.ok(CONFIG.chopperMaxMultiplier >= 1);
  assert.ok(CONFIG.chopperCrashSink < CONFIG.chopperMaxSink, 'dropping at full sink must be a crash');
  assert.ok(CONFIG.chopperSideFriction < CONFIG.chopperSideAccel, 'it slides a little');
  assert.ok(CONFIG.chopperForwardDrag < 1, 'speed fades slowly');
  assert.ok(CONFIG.chopperLevelDistance > CONFIG.breatherBefore + CONFIG.breatherAfter + CONFIG.fogDistance);
  assert.ok(CONFIG.chopperCameraBack > CONFIG.chopperLength, 'camera sits behind the helicopter');
  assert.ok(CONFIG.collectiveTravelPx >= 60);
});
