import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxesOverlap, shipHitbox, cubeBox, findCollision } from '../js/collision.js';
import { CONFIG } from '../js/config.js';

const box = (x, z, halfW, halfD) => ({ x, z, halfW, halfD });

test('overlapping boxes collide', () => {
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(1.5, 0.5, 1, 1)), true);
});

test('separate boxes do not collide', () => {
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(3, 0, 1, 1)), false); // apart sideways
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(0, 5, 1, 1)), false); // apart in depth
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(3, 5, 1, 1)), false);
});

test('overlap is needed in BOTH x and z', () => {
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(0.5, 3, 1, 1)), false);
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(3, 0.5, 1, 1)), false);
});

test('edges just touching is not a crash', () => {
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(2, 0, 1, 1)), false);
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(0, 2, 1, 1)), false);
  assert.equal(boxesOverlap(box(0, 0, 1, 1), box(1.999, 0, 1, 1)), true);
});

test('the ship hitbox is scaled down by hitboxScale', () => {
  const hb = shipHitbox(2, 10, CONFIG);
  assert.equal(hb.x, 2);
  assert.equal(hb.z, 10);
  assert.ok(Math.abs(hb.halfW - (CONFIG.shipWidth * CONFIG.hitboxScale) / 2) < 1e-9);
  assert.ok(Math.abs(hb.halfD - (CONFIG.shipLength * CONFIG.hitboxScale) / 2) < 1e-9);
  assert.ok(hb.halfW < CONFIG.shipWidth / 2, 'hitbox should be smaller than the drawn ship');

  // A cube that would touch the full-size ship but not the smaller hitbox: no crash.
  const cube = { x: 0, z: 10, size: CONFIG.cubeSize };
  cube.x = CONFIG.shipWidth / 2 + CONFIG.cubeSize / 2 - 0.05;
  assert.equal(findCollision(shipHitbox(0, 10, CONFIG), [cube]), null);
  const full = { x: 0, z: 10, halfW: CONFIG.shipWidth / 2, halfD: CONFIG.shipLength / 2 };
  assert.equal(boxesOverlap(full, cubeBox(cube)), true);
});

test('findCollision returns the cube that was hit', () => {
  const cubes = [{ x: 5, z: 10, size: 1.6 }, { x: 0.3, z: 10.4, size: 1.6 }];
  assert.equal(findCollision(shipHitbox(0, 10, CONFIG), cubes), cubes[1]);
  assert.equal(findCollision(shipHitbox(0, 30, CONFIG), cubes), null);
});
