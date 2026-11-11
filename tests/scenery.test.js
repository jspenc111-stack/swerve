// The pure-logic parts of scenery.js: checking scene blocks, colours, the
// ridge shapes and the lightning bolt shape. (The drawing itself can't run in
// Node; it is checked by eye in the browser.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateScene, sceneColors, sceneLight, sceneSeed, ridgeHeight, boltShape, sceneOf,
  SCENE_ELEMENTS, RIDGE_STYLES, GROUND_KINDS, AMBIENT_KINDS,
} from '../js/scenery.js';
import { isValidColor } from '../js/levels.js';
import { LEVELS } from '../js/config.js';

const palette = LEVELS[0].palette;

test('scene: an empty scene and a missing scene are fine', () => {
  assert.deepEqual(validateScene({}), []);
  assert.deepEqual(sceneOf({}), {});
  assert.deepEqual(sceneOf(null), {});
});

test('scene: unknown elements and bad values are reported', () => {
  assert.ok(validateScene({ volcano: {} }).some((m) => m.includes('volcano')));
  assert.ok(validateScene({ sun: { size: 3, height: 0.1 } }).length > 0, 'sun too big');
  assert.ok(validateScene({ sun: { size: 0.1, height: 0.1, color: 'red' } }).length > 0, 'colour names are not allowed');
  assert.ok(validateScene({ sun: { size: 0.1, height: 0.1 }, moon: { size: 0.1, height: 0.1 } }).length > 0, 'sun and moon together');
  assert.ok(validateScene({ ridges: { style: 'towers', layers: 2, height: 0.05 } }).length > 0, 'unknown ridge style');
  assert.ok(validateScene({ ridges: { style: 'hills', layers: 2, height: 0.5 } }).length > 0, 'ridges too tall');
  assert.ok(validateScene({ ground: 'lava' }).length > 0);
  assert.ok(validateScene({ ambient: 'snow' }).length > 0);
  assert.ok(validateScene({ bolt: 'yes' }).length > 0);
  assert.ok(validateScene({ rain: { amount: 2 } }).length > 0);
  assert.ok(validateScene({ clouds: { layers: 3, amount: 0.5 } }).length > 0);
  assert.ok(validateScene({ stars: { count: 0 } }).length > 0);
  assert.ok(validateScene({}, { sun: 'yellow' }).length > 0, 'optional palette colours are checked too');
  assert.ok(validateScene('sunny').length > 0);
});

test('scene: the element lists cover everything the spec names', () => {
  for (const e of ['sun', 'moon', 'stars', 'clouds', 'ridges', 'haze', 'rain', 'bolt']) assert.ok(SCENE_ELEMENTS.includes(e), e);
  assert.deepEqual(RIDGE_STYLES, ['hills', 'mountains', 'mesas', 'dunes', 'islands']);
  assert.deepEqual(GROUND_KINDS, ['water', 'neon', 'wet']);
  assert.deepEqual(AMBIENT_KINDS, ['dust', 'embers']);
});

test('scene colours: sensible defaults from the palette, and explicit colours win', () => {
  const c = sceneColors(palette, {});
  for (const v of Object.values(c)) assert.ok(isValidColor(v), v);
  assert.equal(sceneColors({ ...palette, sun: '#123456' }, { sun: { size: 0.1, height: 0.1 } }).sun, '#123456');
  assert.equal(sceneColors({ ...palette, sun: '#123456' }, { sun: { size: 0.1, height: 0.1, color: '#abcdef' } }).sun, '#abcdef');
  const far = sceneColors(palette, { ridges: { style: 'hills', layers: 2, height: 0.05, color: '#000000' } });
  // Farther ridges are lighter (closer to the horizon colour).
  assert.ok(parseInt(far.ridgeFar.slice(1, 3), 16) > parseInt(far.ridgeNear.slice(1, 3), 16));
  assert.notEqual(sceneColors(palette, { clouds: { layers: 1, amount: 1, dark: true } }).cloud, sceneColors(palette, { clouds: { layers: 1, amount: 1 } }).cloud);
});

test('scene light: shadows fall away from the sun or moon', () => {
  assert.ok(sceneLight({ sun: { size: 0.1, height: 0.1, x: 0.3 } }) > 0);
  assert.ok(sceneLight({ moon: { size: 0.1, height: 0.1, x: -0.3 } }) < 0);
  const none = sceneLight({});
  assert.ok(none >= -1 && none <= 1 && none !== 0, 'a default light when there is no sun or moon');
});

test('scene seed: the same level name always gives the same layout', () => {
  assert.equal(sceneSeed('Morning'), sceneSeed('Morning'));
  assert.notEqual(sceneSeed('Morning'), sceneSeed('Sunset'));
  assert.ok(sceneSeed('') > 0);
});

test('ridge shapes: always between 0 and 1, and repeatable', () => {
  for (const style of RIDGE_STYLES) {
    let lo = Infinity, hi = -Infinity;
    for (let u = -50; u < 200; u += 0.37) {
      const v = ridgeHeight(style, u, 5, 0.8);
      assert.ok(v >= 0 && v <= 1, `${style} at ${u}: ${v}`);
      assert.equal(v, ridgeHeight(style, u, 5, 0.8));
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    assert.ok(hi - lo > 0.2, `${style} actually has shape (range ${lo.toFixed(2)}–${hi.toFixed(2)})`);
  }
  // Islands are mostly flat sea.
  let flat = 0, n = 0;
  for (let u = 0; u < 300; u += 0.5) { n++; if (ridgeHeight('islands', u, 3) === 0) flat++; }
  assert.ok(flat / n > 0.5, 'islands: mostly open water');
});

test('lightning bolt: a connected main stroke from the top down, with forks, inside the sky', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const bolt = boltShape(seed * 977);
    assert.ok(bolt.length >= 5, 'several pieces');
    assert.equal(bolt[0][1], 0, 'starts at the top of the sky');
    let lowest = 0;
    for (const [x0, y0, x1, y1] of bolt) {
      for (const v of [x0, y0, x1, y1]) assert.ok(v >= 0 && v <= 1, `inside the sky (${v})`);
      assert.ok(y1 >= y0, 'pieces only go downward');
      lowest = Math.max(lowest, y1);
    }
    assert.ok(lowest > 0.6, 'reaches well down the sky');
    // Every piece starts where an earlier piece ended (or at the top).
    for (let i = 1; i < bolt.length; i++) {
      const [x0, y0] = bolt[i];
      assert.ok(bolt.slice(0, i).some(([, , x1, y1]) => x1 === x0 && y1 === y0), `piece ${i} is attached`);
    }
  }
  assert.deepEqual(boltShape(123), boltShape(123), 'the same seed gives the same bolt');
  const reused = [];
  assert.equal(boltShape(5, reused), reused, 'fills the list it is given (nothing new each strike)');
});
