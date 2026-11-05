// No free rides in Classic: a pilot who never steers must not be able to
// coast for long. For each level we start a run there, hold perfectly still
// (no steering, no boost) and time how long the ship survives, counted from
// the moment the first cube reaches it. The median over many seeds must land
// in the target range.
//
// If the owner asks for easier or harder Classic levels, change the target
// range below to match (and say so in the PR).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, resetGame, stepGame } from '../js/game.js';
import { CONFIG, LEVELS } from '../js/config.js';

const FPS = 60;
const SEEDS = 60;
const TARGET = { min: 0.4, max: 3.0 }; // seconds, every level
const FIRST_LEVEL = { min: 1.5, max: 3.5 }; // Morning stays a gentle start

// Seconds a non-steering pilot survives on `level`, from the first cube's arrival.
// band: optional band half-width (null = the default).
function coastTime(level, seed, band = null) {
  const game = createGame(CONFIG, LEVELS, seed);
  if (band) game.spawner.band = band;
  resetGame(game, seed, level);
  const hd = (CONFIG.shipLength * CONFIG.hitboxScale) / 2;
  const end = game.startDistance + CONFIG.levelLength / CONFIG.scorePerUnit;
  let first = null;
  while (game.distance < end) {
    const events = stepGame(game, 1 / FPS, 0, false);
    if (first === null) {
      for (const c of game.spawner.cubes) {
        if (c.z - c.size / 2 <= game.distance + hd) { first = game.time; break; }
      }
    }
    if (events.some((e) => e.type === 'crash')) break;
  }
  return game.time - (first ?? game.time);
}

function medianCoast(level, band = null) {
  const times = [];
  for (let s = 1; s <= SEEDS; s++) times.push(coastTime(level, s * 977, band));
  times.sort((a, b) => a - b);
  return (times[SEEDS / 2 - 1] + times[SEEDS / 2]) / 2;
}

const defaultMedians = [];

LEVELS.forEach((level, i) => {
  test(`no free rides: ${level.name} (level ${i + 1})`, () => {
    const m = medianCoast(i);
    defaultMedians[i] = m;
    const range = i === 0 ? FIRST_LEVEL : TARGET;
    assert.ok(m >= range.min && m <= range.max,
      `${level.name}: a pilot who never steers survives ${m.toFixed(2)} s (median); target ${range.min}–${range.max} s`);
  });
});
