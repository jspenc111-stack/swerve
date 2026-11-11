// Classic must give the player enough to do. A careful "reactive" test pilot
// flies every level: it looks 0.9 seconds ahead, and only when a cube is on a
// collision course does it pick the nearest clear line and steer to it.
// Otherwise it doesn't steer. We count:
//   dodges       — how often it has to steer out of the way
//   close passes — cubes going by within 1.2 units of the ship's side
// and check every level has enough of both, so Classic can't drift back to
// thin, quiet levels.
//
// If the owner asks for a calmer or busier Classic, change the targets below
// to match (and say so in the PR).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, resetGame, stepGame } from '../js/game.js';
import { CONFIG, LEVELS } from '../js/config.js';
import { setSpawnBand } from '../js/spawner.js';

const FPS = 60;
const SEEDS = 24;
const BAND = 62;            // about what a phone's view needs
const LOOK_AHEAD_SEC = 0.9;
const CLOSE = 1.2;          // a "close pass" is within this of the ship's side
const TARGET = { dodgesPer10s: 6, closePerSec: 0.5 };
// A pure corridor level (Canyon) is a different kind of busy: the walls rush
// past on both sides the whole time and you steer to follow the bends, so the
// pilot makes fewer separate "dodges". It gets its own, lower dodge target;
// the close-pass target is the same as everywhere else.
const CORRIDOR_DODGES_PER_10S = 3;
const LAGOON_VS_SUNSET = 0.8;

const HALF_SHIP = CONFIG.shipWidth / 2;
const MARGIN = 0.25;        // the pilot leaves this much room beside a cube

// Nearest sideways position to `x` that is clear of every cube in `ahead`.
function nearestClearLine(x, ahead) {
  const blocked = ahead
    .map((c) => [c.x - c.size / 2 - HALF_SHIP - MARGIN, c.x + c.size / 2 + HALF_SHIP + MARGIN])
    .sort((a, b) => a[0] - b[0]);
  // Join overlapping stretches, then find the one the ship is inside.
  const merged = [];
  for (const b of blocked) {
    const last = merged[merged.length - 1];
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else merged.push([b[0], b[1]]);
  }
  for (const [lo, hi] of merged) {
    if (x > lo && x < hi) return x - lo < hi - x ? lo : hi;
  }
  return x;
}

// Fly one level with the reactive pilot. Returns counts and the time flown.
export function flyLevel(level, seed, config = CONFIG, levels = LEVELS) {
  const game = createGame(config, levels, seed);
  setSpawnBand(game.spawner, BAND);
  game.invincible = true;
  resetGame(game, seed, level);
  const end = game.startDistance + config.levelLength / config.scorePerUnit;
  let dodging = false;
  let dodges = 0;
  let close = 0;
  let lastAction = 0;
  let quiet = 0;
  const ahead = [];
  while (game.distance < end) {
    const reach = game.speed * LOOK_AHEAD_SEC;
    ahead.length = 0;
    let threat = false;
    for (const c of game.spawner.cubes) {
      const dz = c.z - game.distance;
      if (dz < -c.size / 2 || dz > reach) continue;
      ahead.push(c);
      if (Math.abs(c.x - game.x) < c.size / 2 + HALF_SHIP) threat = true;
    }
    if (threat && !dodging) {
      // A new dodge: a cube is on a collision course.
      dodging = true;
      dodges++;
      quiet = Math.max(quiet, game.time - lastAction);
      lastAction = game.time;
    }
    let steer = 0;
    if (dodging) {
      // Steer to the nearest clear line; once on it, stop steering.
      const dx = nearestClearLine(game.x, ahead) - game.x;
      if (dx === 0) dodging = false;
      else steer = Math.sign(dx);
    }
    const before = game.distance;
    stepGame(game, 1 / FPS, steer, false);
    for (const c of game.spawner.cubes) {
      if (c.z > before && c.z <= game.distance) {
        const gap = Math.abs(c.x - game.x) - c.size / 2 - HALF_SHIP;
        if (gap < CLOSE) {
          close++;
          quiet = Math.max(quiet, game.time - lastAction);
          lastAction = game.time;
        }
      }
    }
  }
  quiet = Math.max(quiet, game.time - lastAction);
  return { dodges, close, time: game.time, quiet };
}

export function measureLevel(level, seeds = SEEDS) {
  let dodges = 0;
  let close = 0;
  let time = 0;
  let quiet = 0;
  for (let s = 1; s <= seeds; s++) {
    const r = flyLevel(level, s * 1301);
    dodges += r.dodges;
    close += r.close;
    time += r.time;
    quiet += r.quiet;
  }
  return { dodgesPer10s: (dodges / time) * 10, closePerSec: close / time, quiet: quiet / seeds };
}

const results = LEVELS.map((_, i) => measureLevel(i));

LEVELS.forEach((level, i) => {
  test(`classic action: ${level.name} (level ${i + 1}) keeps the pilot busy`, () => {
    const r = results[i];
    const need = level.pattern.type === 'canyon' ? CORRIDOR_DODGES_PER_10S : TARGET.dodgesPer10s;
    assert.ok(r.dodgesPer10s >= need,
      `${level.name}: ${r.dodgesPer10s.toFixed(1)} dodges per 10 s; need at least ${need}`);
    assert.ok(r.closePerSec >= TARGET.closePerSec,
      `${level.name}: ${r.closePerSec.toFixed(2)} close passes per second; need at least ${TARGET.closePerSec}`);
  });
});

// Comparing two levels means dividing one noisy number by another, so this
// check averages over more seeds than the per-level checks (the free-ride
// test does the same for its comparison).
const COMPARE_SEEDS = 144;
test('classic action: Lagoon is not quieter than Sunset', () => {
  const s = LEVELS.findIndex((l) => l.name === 'Sunset');
  const l = LEVELS.findIndex((l) => l.name === 'Lagoon');
  assert.ok(s >= 0 && l >= 0, 'Sunset and Lagoon exist');
  const sunset = measureLevel(s, COMPARE_SEEDS);
  const lagoon = measureLevel(l, COMPARE_SEEDS);
  assert.ok(lagoon.closePerSec >= LAGOON_VS_SUNSET * sunset.closePerSec,
    `Lagoon ${lagoon.closePerSec.toFixed(2)} close passes/s vs Sunset ${sunset.closePerSec.toFixed(2)} (need at least ${LAGOON_VS_SUNSET * 100}%)`);
});
