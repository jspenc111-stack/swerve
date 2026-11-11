// game.js — the game's state and rules (pure logic, no drawing, no DOM).
//
// Units: x = sideways, z = distance travelled forward. The ship sits at
// z = distance; the camera sits config.cameraBack behind it.
//
// The level depends on how far along the course you are (so you can start a
// run at any level). The score counts only the distance covered in this run.

import { createSpawner, resetSpawner, updateSpawner, prefillSpawner } from './spawner.js';
import { levelForDistance, levelBaseSpeed, levelStartDistance } from './levels.js';
import { shipHitbox, findCollision } from './collision.js';

export function createGame(config, levels, seed = 1) {
  const game = {
    config,
    levels,
    spawner: createSpawner(config, levels, seed),
    info: {},
    hitbox: {},
    events: [],
    seed,
    invincible: false,
  };
  resetGame(game, seed);
  return game;
}

// Start a fresh run. startLevel is 0-based (0 = the first level).
export function resetGame(game, seed = game.seed + 1, startLevel = 0) {
  const cfg = game.config;
  const start = levelStartDistance(Math.max(0, startLevel), cfg);
  game.seed = seed;
  game.startLevel = Math.max(0, startLevel);
  game.startDistance = start;
  game.distance = start;
  game.score = 0;
  game.x = 0;
  game.vx = 0;
  game.leanLook = 0; // eased sideways speed, -1 … 1, for drawing the ship's lean (look only)
  game.time = 0;
  game.levelTime = 0;
  game.boost = 0; // 0 = normal speed … 1 = full boost (eases in and out)
  game.crashed = false;
  game.hitCube = null; // the cube that was hit (for the crash effect; look only)
  game.events.length = 0;
  levelForDistance(start, cfg, game.levels, game.info);
  game.levelIndex = game.info.absIndex; // absolute level index (counts across laps)
  game.baseSpeed = classicBaseSpeed(game.info, cfg);
  game.speed = game.baseSpeed;
  resetSpawner(game.spawner, seed, start, 0);
  // Start with a full field: only the level-start breather stays empty.
  prefillSpawner(game.spawner, start, 0, game.baseSpeed * cfg.boostMultiplier);
  return game;
}

// A phone hiccup must never make the ship jump far in one frame.
export function capFrameTime(dt, config) {
  if (!(dt > 0)) return 0;
  return Math.min(dt, config.maxFrameTime);
}

// Advance the game by dt seconds.
//   steer: -1 (full left) … 1 (full right)
//   boosting: true while the speed-up button is held
// Returns a list of events for this frame: { type: 'level' }, { type: 'crash' }
// or { type: 'nearMiss', side } (side: -1 = the cube passed on the left, 1 =
// on the right). A near miss is look and sound only: it never changes the
// score, the speed or the hitbox.
export function stepGame(game, dt, steer, boosting = false) {
  const cfg = game.config;
  const events = game.events;
  events.length = 0;
  if (game.crashed) return events;
  dt = capFrameTime(dt, cfg);
  if (dt === 0) return events;

  // Sideways movement with acceleration, top speed and friction.
  steer = Math.max(-1, Math.min(1, steer || 0));
  if (steer !== 0) {
    const target = steer * cfg.maxSteerSpeed;
    const diff = target - game.vx;
    // Steering against the way you're sliding (turning around) pulls harder,
    // so changing direction is quick. Speeding up from rest is unchanged.
    const reversing = game.vx !== 0 && Math.sign(steer) !== Math.sign(game.vx);
    const step = cfg.steerAccel * (reversing ? (cfg.classicReverseBoost ?? 1) : 1) * dt;
    game.vx += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
  } else {
    game.vx *= Math.exp(-cfg.steerFriction * dt);
    if (Math.abs(game.vx) < 0.01) game.vx = 0;
  }
  game.x += game.vx * dt;
  // The ship's lean eases toward its sideways speed, so a quick turn-around
  // doesn't make it rock. Look only: nothing else uses it.
  game.leanLook += (game.vx / cfg.maxSteerSpeed - game.leanLook) * (1 - Math.exp(-(cfg.shipLeanEase ?? 1e9) * dt));

  // Boost eases in and out so the speed change feels smooth.
  const boostTarget = boosting ? 1 : 0;
  game.boost += (boostTarget - game.boost) * (1 - Math.exp(-cfg.boostEase * dt));
  if (Math.abs(game.boost - boostTarget) < 0.001) game.boost = boostTarget;

  // Forward movement, speeding up gently within the level.
  game.time += dt;
  game.levelTime += dt;
  game.baseSpeed = classicBaseSpeed(game.info, cfg) + cfg.speedRampPerSecond * game.levelTime;
  game.speed = game.baseSpeed * (1 + (cfg.boostMultiplier - 1) * game.boost);
  const before = game.distance;
  game.distance += game.speed * dt;

  // Score only ever goes up, and counts only this run's distance.
  const newScore = Math.floor((game.distance - game.startDistance) * cfg.scorePerUnit);
  if (newScore > game.score) game.score = newScore;

  // Level change?
  const absIndex = Math.floor((game.distance * cfg.scorePerUnit) / cfg.levelLength);
  if (absIndex !== game.levelIndex) {
    game.levelIndex = absIndex;
    levelForDistance(game.distance, cfg, game.levels, game.info);
    game.levelTime = 0;
    game.baseSpeed = classicBaseSpeed(game.info, cfg);
    game.speed = game.baseSpeed * (1 + (cfg.boostMultiplier - 1) * game.boost);
    events.push(LEVEL_EVENT);
  }

  // Obstacles are always laid out for the fastest you could be going (full
  // boost), so the open path stays reachable whether or not you boost.
  updateSpawner(game.spawner, game.distance, game.x, game.baseSpeed * cfg.boostMultiplier);

  shipHitbox(game.x, game.distance, cfg, game.hitbox);
  const hit = game.invincible ? null : findCollision(game.hitbox, game.spawner.cubes);
  if (hit) {
    game.crashed = true;
    game.hitCube = hit;
    events.push(CRASH_EVENT);
    return events;
  }
  nearMisses(game, before, events);
  return events;
}

// Near misses: a cube whose middle went past the ship this frame, with less
// than nearMissDistance of room beside the hitbox (and no overlap). Each cube
// passes the ship once, so each fires at most once.
function nearMisses(game, before, events) {
  const limit = game.config.nearMissDistance;
  if (!(limit > 0)) return;
  const cubes = game.spawner.cubes;
  const hb = game.hitbox;
  for (let i = 0; i < cubes.length; i++) {
    const c = cubes[i];
    if (c.z <= before || c.z > game.distance) continue;
    const room = Math.abs(c.x - game.x) - c.size / 2 - hb.halfW;
    if (room >= 0 && room < limit) events.push(c.x < game.x ? NEAR_LEFT : NEAR_RIGHT);
  }
}

// Debug helper: jump straight to the start of a level (0-based absolute index).
// The score restarts from 0, as if the run had started there.
export function jumpToLevel(game, absIndex) {
  const cfg = game.config;
  const start = levelStartDistance(absIndex, cfg);
  game.distance = start;
  game.startDistance = start;
  game.startLevel = absIndex;
  game.score = 0;
  game.levelIndex = absIndex;
  game.levelTime = 0;
  game.vx = 0;
  game.leanLook = 0;
  levelForDistance(start, cfg, game.levels, game.info);
  game.baseSpeed = classicBaseSpeed(game.info, cfg);
  game.speed = game.baseSpeed;
  resetSpawner(game.spawner, game.seed + absIndex * 7919, start, game.x);
  prefillSpawner(game.spawner, start, game.x, game.baseSpeed * cfg.boostMultiplier);
  game.events.length = 0;
  game.events.push(LEVEL_EVENT);
  return game.events;
}

// Classic's own speed for a level: the shared level speed × classicSpeedFactor.
// (3D Flight and 3D Heli use levelBaseSpeed directly, so they don't change.)
export function classicBaseSpeed(info, cfg) {
  return levelBaseSpeed(info, cfg) * (cfg.classicSpeedFactor ?? 1);
}

const LEVEL_EVENT = Object.freeze({ type: 'level' });
const CRASH_EVENT = Object.freeze({ type: 'crash' });
const NEAR_LEFT = Object.freeze({ type: 'nearMiss', side: -1 });
const NEAR_RIGHT = Object.freeze({ type: 'nearMiss', side: 1 });
