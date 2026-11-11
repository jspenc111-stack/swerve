// particles.js: the pooled particles and the ship's trail (pure logic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createParticles, spawn, update, clearParticles, setParticleLimit, KIND,
  PARTICLE_CAP_FULL, PARTICLE_CAP_LITE, createTrail, pushTrail, trailIndex, clearTrail,
} from '../js/particles.js';

test('particles: the caps are 300 on Full and 80 on Lite', () => {
  assert.equal(PARTICLE_CAP_FULL, 300);
  assert.equal(PARTICLE_CAP_LITE, 80);
});

test('particles: the pool never exceeds its cap', () => {
  const ps = createParticles(50);
  let made = 0;
  for (let i = 0; i < 200; i++) if (spawn(ps, KIND.spark, 0, 0, 0, 1, 0, 0, 1)) made++;
  assert.equal(made, 50);
  assert.equal(ps.count, 50);
  assert.equal(ps.items.length, 50, 'no new particle objects were created');
  assert.equal(spawn(ps, KIND.spark, 0, 0, 0, 0, 0, 0, 1), null, 'a full pool refuses');
});

test('particles: the Lite limit is respected, and lowering it drops the extras', () => {
  const ps = createParticles(PARTICLE_CAP_FULL);
  for (let i = 0; i < 500; i++) spawn(ps, KIND.dust, 0, 0, 0, 0, 0, 0, 5);
  assert.equal(ps.count, 300);
  setParticleLimit(ps, PARTICLE_CAP_LITE);
  assert.equal(ps.count, 80);
  for (let i = 0; i < 500; i++) spawn(ps, KIND.dust, 0, 0, 0, 0, 0, 0, 5);
  assert.equal(ps.count, 80);
  setParticleLimit(ps, 9999);
  assert.equal(ps.limit, 300, 'never above the pool size');
});

test('particles: they expire, and their slots are reused', () => {
  const ps = createParticles(10);
  for (let i = 0; i < 10; i++) spawn(ps, KIND.spark, i, 0, 0, 0, 0, 0, 0.1 + i * 0.1);
  update(ps, 0.35);
  assert.equal(ps.count, 7, 'the three shortest-lived ones are gone');
  for (let i = 0; i < ps.count; i++) assert.ok(ps.items[i].life > 0);
  const objects = new Set(ps.items);
  assert.equal(objects.size, 10, 'still the same ten objects, none lost or duplicated');
  assert.ok(spawn(ps, KIND.spark, 0, 0, 0, 0, 0, 0, 1), 'freed slots can be used again');
  update(ps, 100);
  assert.equal(ps.count, 0);
});

test('particles: update moves and fades them', () => {
  const ps = createParticles(4);
  const p = spawn(ps, KIND.spark, 1, 2, 3, 10, 0, -5, 2, 0.2, '#ff0000');
  update(ps, 0.5);
  assert.ok(Math.abs(p.x - 6) < 1e-9);
  assert.ok(Math.abs(p.z - 0.5) < 1e-9);
  assert.ok(Math.abs(p.alpha - 0.75) < 1e-9, 'fades with its remaining life');
  assert.equal(p.color, '#ff0000');
  assert.equal(p.size, 0.2);
});

test('particles: gravity, drag, spin and the soft ground bounce', () => {
  const ps = createParticles(4);
  const p = spawn(ps, KIND.shard, 0, 1, 0, 4, 0, 0, 5);
  p.gravity = 10; p.spin = 6; p.ground = true;
  update(ps, 0.1);
  assert.ok(p.vy < 0, 'falls');
  assert.ok(Math.abs(p.rot - 0.6) < 1e-9, 'spins');
  for (let i = 0; i < 100; i++) update(ps, 0.02);
  assert.ok(p.y >= 0, 'never sinks through the ground');
  const q = spawn(ps, KIND.dust, 0, 5, 0, 10, 0, 0, 5);
  q.drag = 3;
  update(ps, 0.5);
  assert.ok(q.vx < 10 && q.vx > 0, 'drag slows it');
});

test('particles: a new particle starts clean (no leftovers from the slot it reuses)', () => {
  const ps = createParticles(1);
  const p = spawn(ps, KIND.shard, 0, 0, 0, 0, 0, 0, 0.1);
  p.gravity = 20; p.spin = 9; p.ground = true; p.drag = 2;
  update(ps, 1);
  const q = spawn(ps, KIND.spark, 0, 0, 0, 0, 0, 0, 1);
  assert.equal(q, p, 'the same object is reused');
  assert.equal(q.gravity, 0);
  assert.equal(q.spin, 0);
  assert.equal(q.drag, 0);
  assert.equal(q.ground, false);
  assert.equal(q.alpha, 1);
});

test('particles: zero or negative time and lifetimes do nothing; clear empties the pool', () => {
  const ps = createParticles(4);
  assert.equal(spawn(ps, KIND.spark, 0, 0, 0, 0, 0, 0, 0), null);
  const p = spawn(ps, KIND.spark, 0, 0, 0, 1, 1, 1, 1);
  update(ps, 0);
  update(ps, -1);
  assert.equal(p.x, 0);
  clearParticles(ps);
  assert.equal(ps.count, 0);
});

test('trail: remembers the newest points first, in a fixed-size ring', () => {
  const t = createTrail(8);
  assert.equal(trailIndex(t, 0), -1);
  for (let i = 0; i < 20; i++) pushTrail(t, i, 0, i * 1.0);
  assert.equal(t.count, 8);
  assert.equal(t.x[trailIndex(t, 0)], 19, 'newest first');
  assert.equal(t.x[trailIndex(t, 7)], 12, 'oldest kept');
  assert.equal(trailIndex(t, 8), -1);
  clearTrail(t);
  assert.equal(t.count, 0);
});

test('trail: points too close together replace the newest instead of piling up', () => {
  const t = createTrail(8);
  pushTrail(t, 0, 0, 0);
  pushTrail(t, 1, 0, 0.01);
  pushTrail(t, 2, 0, 0.02);
  assert.equal(t.count, 1);
  assert.equal(t.x[trailIndex(t, 0)], 2);
  pushTrail(t, 3, 0, 0.5);
  assert.equal(t.count, 2);
});
