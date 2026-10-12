// game.js — the game's state and rules (pure logic, no drawing, no DOM).
//
// Units: x = sideways, z = distance travelled forward. The ship sits at
// z = distance; the camera sits config.cameraBack behind it.

import { createSpawner, resetSpawner, updateSpawner } from './spawner.js';
import { levelForScore, levelBaseSpeed, levelStartDistance } from './levels.js';
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
  };
  resetGame(game, seed);
  return game;
}

export function resetGame(game, seed = game.seed + 1) {
  game.seed = seed;
  game.distance = 0;
  game.score = 0;
  game.x = 0;
  game.vx = 0;
  game.time = 0;
  game.levelTime = 0;
  game.crashed = false;
  game.invincible = game.invincible || false;
  game.events.length = 0;
  levelForScore(0, game.config, game.levels, game.info);
  game.levelIndex = 0; // absolute level index (counts across laps)
  game.speed = levelBaseSpeed(game.info, game.config);
  resetSpawner(game.spawner, seed, 0, 0);
  return game;
}

// A phone hiccup must never make the ship jump far in one frame.
export function capFrameTime(dt, config) {
  if (!(dt > 0)) return 0;
  return Math.min(dt, config.maxFrameTime);
}

// Advance the game by dt seconds. steer: -1 (full left) … 1 (full right).
// Returns a list of events for this frame: { type: 'level' } or { type: 'crash' }.
export function stepGame(game, dt, steer) {
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
    const step = cfg.steerAccel * dt;
    game.vx += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
  } else {
    game.vx *= Math.exp(-cfg.steerFriction * dt);
    if (Math.abs(game.vx) < 0.01) game.vx = 0;
  }
  game.x += game.vx * dt;

  // Forward movement, speeding up gently within the level.
  game.time += dt;
  game.levelTime += dt;
  game.speed = levelBaseSpeed(game.info, cfg) + cfg.speedRampPerSecond * game.levelTime;
  game.distance += game.speed * dt;

  // Score only ever goes up.
  const newScore = Math.floor(game.distance * cfg.scorePerUnit);
  if (newScore > game.score) game.score = newScore;

  // Level change?
  const absIndex = Math.floor(game.score / cfg.levelLength);
  if (absIndex !== game.levelIndex) {
    game.levelIndex = absIndex;
    levelForScore(game.score, cfg, game.levels, game.info);
    game.levelTime = 0;
    game.speed = levelBaseSpeed(game.info, cfg);
    events.push(LEVEL_EVENT);
  }

  updateSpawner(game.spawner, game.distance, game.x, game.speed);

  shipHitbox(game.x, game.distance, cfg, game.hitbox);
  if (!game.invincible && findCollision(game.hitbox, game.spawner.cubes)) {
    game.crashed = true;
    events.push(CRASH_EVENT);
  }
  return events;
}

// Debug helper: jump straight to the start of a level (0-based absolute index).
export function jumpToLevel(game, absIndex) {
  const cfg = game.config;
  const start = levelStartDistance(absIndex, cfg);
  game.distance = start;
  game.score = Math.floor(start * cfg.scorePerUnit);
  game.levelIndex = absIndex;
  game.levelTime = 0;
  game.vx = 0;
  levelForScore(game.score, cfg, game.levels, game.info);
  game.speed = levelBaseSpeed(game.info, cfg);
  resetSpawner(game.spawner, game.seed + absIndex * 7919, start, game.x);
  game.events.length = 0;
  game.events.push(LEVEL_EVENT);
  return game.events;
}

const LEVEL_EVENT = Object.freeze({ type: 'level' });
const CRASH_EVENT = Object.freeze({ type: 'crash' });
