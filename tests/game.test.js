import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, capFrameTime, resetGame } from '../js/game.js';
import { CONFIG, LEVELS } from '../js/config.js';

const fresh = () => {
  const g = createGame(CONFIG, LEVELS, 42);
  g.invincible = true;
  return g;
};

test('speed starts at baseSpeed and ramps up gently within a level', () => {
  const g = fresh();
  assert.equal(g.speed, CONFIG.baseSpeed);
  for (let i = 0; i < 60; i++) stepGame(g, 1 / 60, 0); // 1 second
  const expected = CONFIG.baseSpeed + CONFIG.speedRampPerSecond * 1;
  assert.ok(Math.abs(g.speed - expected) < 1e-6, `speed ${g.speed} vs ${expected}`);
});

test('speed jumps by speedPerLevel at a new level', () => {
  const g = fresh();
  let levelUps = 0;
  while (g.levelIndex < 1) {
    for (const e of stepGame(g, 1 / 60, 0)) if (e.type === 'level') levelUps++;
  }
  assert.equal(levelUps, 1);
  assert.equal(g.levelTime < 0.05, true);
  const expected = CONFIG.baseSpeed + CONFIG.speedPerLevel + (LEVELS[1].speedBonus || 0);
  assert.ok(Math.abs(g.speed - expected) < 0.01);
});

test('the frame time is capped', () => {
  assert.equal(capFrameTime(5, CONFIG), CONFIG.maxFrameTime);
  assert.equal(capFrameTime(0.01, CONFIG), 0.01);
  assert.equal(capFrameTime(-1, CONFIG), 0);
  assert.equal(capFrameTime(NaN, CONFIG), 0);
  const g = fresh();
  stepGame(g, 10, 0); // a 10 second hiccup
  assert.ok(g.distance <= CONFIG.baseSpeed * CONFIG.maxFrameTime * 1.01);
});

test('the score only increases, and grows with distance', () => {
  const g = fresh();
  let last = 0;
  for (let i = 0; i < 2000; i++) {
    stepGame(g, (i % 7) / 100, i % 3 - 1);
    assert.ok(g.score >= last);
    last = g.score;
  }
  assert.equal(g.score, Math.floor(g.distance * CONFIG.scorePerUnit));
  assert.ok(g.score > 0);
});

test('steering accelerates smoothly and is capped', () => {
  const g = fresh();
  stepGame(g, 1 / 60, 1);
  assert.ok(g.vx > 0 && g.vx < CONFIG.maxSteerSpeed, 'no instant jump to full speed');
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, 1);
  assert.ok(Math.abs(g.vx - CONFIG.maxSteerSpeed) < 1e-9);
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, 0);
  assert.ok(Math.abs(g.vx) < 0.5, 'friction slows the ship when you let go');
});

test('hitting a cube ends the run', () => {
  const g = createGame(CONFIG, LEVELS, 1);
  g.spawner.cubes.push({ x: 0, z: 1, size: CONFIG.cubeSize });
  const events = stepGame(g, 1 / 60, 0);
  assert.ok(events.some((e) => e.type === 'crash'));
  assert.equal(g.crashed, true);
  const d = g.distance;
  stepGame(g, 1 / 60, 0);
  assert.equal(g.distance, d, 'nothing moves after a crash');
  resetGame(g);
  assert.equal(g.crashed, false);
  assert.equal(g.score, 0);
});
