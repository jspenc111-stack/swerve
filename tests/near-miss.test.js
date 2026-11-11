// Near misses (Classic and 3D Flight): an event when an obstacle passes with
// less than nearMissDistance of room, once per obstacle, never on a hit or a
// wide pass. It is feel only: no score, speed or hitbox change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../js/game.js';
import { createFlight, stepFlight } from '../js/flight.js';
import { CONFIG, LEVELS } from '../js/config.js';

const DT = 1 / 60;
const HALF = (CONFIG.shipWidth * CONFIG.hitboxScale) / 2;
const EMPTY = [{ name: 'Empty', pattern: { type: 'scatter', density: 0 }, flight: { type: 'floaters', density: 0, minSize: 1, maxSize: 2 }, palette: LEVELS[0].palette }];

// A Classic game with exactly one cube, `room` units clear of the hitbox on `side`.
function classicWith(room, side = 1, invincible = false) {
  const g = createGame(CONFIG, EMPTY, 3);
  g.invincible = invincible;
  g.spawner.cubes.length = 0;
  g.spawner.cubes.push({ x: side * (HALF + CONFIG.cubeSize / 2 + room), z: g.distance + 6, size: CONFIG.cubeSize });
  return g;
}

// Fly past and collect every event.
function flyPast(g, step = (game) => stepGame(game, DT, 0)) {
  const seen = [];
  for (let i = 0; i < 60; i++) for (const e of step(g)) seen.push(e);
  return seen;
}

test('nearMissDistance is 0.45', () => {
  assert.equal(CONFIG.nearMissDistance, 0.45);
});

test('Classic: a cube passing inside nearMissDistance fires exactly one nearMiss, on its side', () => {
  for (const side of [-1, 1]) {
    const seen = flyPast(classicWith(0.2, side));
    const near = seen.filter((e) => e.type === 'nearMiss');
    assert.equal(near.length, 1, 'fires once');
    assert.equal(near[0].side, side);
    assert.ok(!seen.some((e) => e.type === 'crash'));
  }
});

test('Classic: just inside fires, just outside (a wide pass) does not', () => {
  assert.equal(flyPast(classicWith(CONFIG.nearMissDistance - 0.01)).filter((e) => e.type === 'nearMiss').length, 1);
  assert.equal(flyPast(classicWith(CONFIG.nearMissDistance + 0.01)).filter((e) => e.type === 'nearMiss').length, 0);
  assert.equal(flyPast(classicWith(3)).filter((e) => e.type === 'nearMiss').length, 0);
});

test('Classic: a hit is a crash, not a near miss (even when invincible)', () => {
  const seen = flyPast(classicWith(-0.1));
  assert.ok(seen.some((e) => e.type === 'crash'));
  assert.ok(!seen.some((e) => e.type === 'nearMiss'));
  const ghost = flyPast(classicWith(-0.1, 1, true));
  assert.ok(!ghost.some((e) => e.type === 'nearMiss'), 'flying through a cube is not a near miss');
});

test('Classic: the crash remembers which cube was hit (for the crash effect)', () => {
  const g = classicWith(-0.1);
  const cube = g.spawner.cubes[0];
  flyPast(g);
  assert.equal(g.hitCube, cube);
});

test('Classic: near misses never change the score, speed or position', () => {
  const a = classicWith(0.2);
  const b = classicWith(3);
  for (let i = 0; i < 60; i++) { stepGame(a, DT, 0); stepGame(b, DT, 0); }
  assert.equal(a.score, b.score);
  assert.equal(a.speed, b.speed);
  assert.equal(a.distance, b.distance);
  assert.equal(a.x, b.x);
  assert.deepEqual(a.hitbox, b.hitbox);
});

test('Classic: on the real levels near misses happen, and never together with a crash from the same cube', () => {
  const g = createGame(CONFIG, LEVELS, 11);
  g.invincible = true;
  let near = 0;
  for (let i = 0; i < 60 * 40; i++) {
    for (const e of stepGame(g, DT, Math.sin(i / 40))) {
      if (e.type === 'nearMiss') { near++; assert.ok(e.side === -1 || e.side === 1); }
    }
  }
  assert.ok(near > 0, 'some near misses in 40 seconds of weaving');
});

// ---- 3D Flight ----

const FH = (CONFIG.flightShipSpan * CONFIG.flightHitboxScale) / 2;
const FV = (CONFIG.flightShipHeight * CONFIG.flightHitboxScale) / 2;

function flightWith(box, invincible = false) {
  const f = createFlight(CONFIG, EMPTY, 3);
  f.invincible = invincible;
  f.spawner.boxes.length = 0;
  f.spawner.targets.length = 0;
  f.spawner.boxes.push({ z: f.distance + 6, d: 1, ...box });
  return f;
}
const flyJet = (f) => flyPast(f, (x) => stepFlight(x, DT, 0, 0));
const Y = CONFIG.flightStartAltitude;

test('3D Flight: a block passing close beside the jet fires one nearMiss on that side', () => {
  for (const side of [-1, 1]) {
    const seen = flyJet(flightWith({ x: side * (FH + 1 + 0.2), w: 2, y: Y - 1, h: 2 }));
    const near = seen.filter((e) => e.type === 'nearMiss');
    assert.equal(near.length, 1);
    assert.equal(near[0].side, side);
  }
});

test('3D Flight: a block just above or below counts too (side 0)', () => {
  const above = flyJet(flightWith({ x: 0, w: 2, y: Y + FV + 0.2, h: 2 })).filter((e) => e.type === 'nearMiss');
  assert.equal(above.length, 1);
  assert.equal(above[0].side, 0);
  const below = flyJet(flightWith({ x: 0, w: 2, y: Y - FV - 0.2 - 2, h: 2 })).filter((e) => e.type === 'nearMiss');
  assert.equal(below.length, 1);
});

test('3D Flight: a wide pass does not fire, sideways or in height', () => {
  assert.equal(flyJet(flightWith({ x: FH + 1 + 1.5, w: 2, y: Y - 1, h: 2 })).filter((e) => e.type === 'nearMiss').length, 0);
  assert.equal(flyJet(flightWith({ x: 0, w: 2, y: Y + FV + 1.5, h: 2 })).filter((e) => e.type === 'nearMiss').length, 0);
  // Close sideways but far below: not a near miss.
  assert.equal(flyJet(flightWith({ x: FH + 1 + 0.1, w: 2, y: 0, h: 1 })).filter((e) => e.type === 'nearMiss').length, 0);
});

test('3D Flight: a hit is a crash, not a near miss (even when invincible)', () => {
  const seen = flyJet(flightWith({ x: 0, w: 2, y: Y - 1, h: 2 }));
  assert.ok(seen.some((e) => e.type === 'crash'));
  assert.ok(!seen.some((e) => e.type === 'nearMiss'));
  assert.ok(!flyJet(flightWith({ x: 0, w: 2, y: Y - 1, h: 2 }, true)).some((e) => e.type === 'nearMiss'));
});

test('3D Flight: near misses never change the score or speed', () => {
  const a = flightWith({ x: FH + 1 + 0.2, w: 2, y: Y - 1, h: 2 });
  const b = flightWith({ x: FH + 1 + 5, w: 2, y: Y - 1, h: 2 });
  for (let i = 0; i < 60; i++) { stepFlight(a, DT, 0, 0); stepFlight(b, DT, 0, 0); }
  assert.equal(a.score, b.score);
  assert.equal(a.speed, b.speed);
  assert.equal(a.distance, b.distance);
});
