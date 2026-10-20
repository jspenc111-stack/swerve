// flight.js — rules for 3D Flight mode (pure logic, no drawing, no DOM).
//
// Like Classic, the jet always flies forward and the level depends on how far
// along the course you are. The difference: you also move up and down,
// between flightMinAltitude and flightMaxAltitude. Flying through a bonus
// ring adds ringBonus points.
//
// Units: x = sideways, y = height above the ground, z = distance forward.

import { createFlightSpawner, resetFlightSpawner, updateFlightSpawner } from './flightSpawner.js';
import { levelForDistance, levelBaseSpeed, levelStartDistance } from './levels.js';
import { flightHitbox, findBoxCollision } from './collision.js';
import { capFrameTime } from './game.js';

export function createFlight(config, levels, seed = 1) {
  const f = {
    config,
    levels,
    spawner: createFlightSpawner(config, levels, seed),
    info: {},
    hitbox: {},
    events: [],
    seed,
    invincible: false,
  };
  resetFlight(f, seed);
  return f;
}

// Start a fresh run. startLevel is 0-based.
export function resetFlight(f, seed = f.seed + 1, startLevel = 0) {
  const cfg = f.config;
  const start = levelStartDistance(Math.max(0, startLevel), cfg);
  f.seed = seed;
  f.startLevel = Math.max(0, startLevel);
  f.startDistance = start;
  f.distance = start;
  f.score = 0;
  f.bonus = 0;
  f.rings = 0;
  f.x = 0;
  f.vx = 0;
  f.y = cfg.flightStartAltitude;
  f.vy = 0;
  f.time = 0;
  f.levelTime = 0;
  f.boost = 0;
  f.crashed = false;
  f.events.length = 0;
  levelForDistance(start, cfg, f.levels, f.info);
  f.levelIndex = f.info.absIndex;
  f.baseSpeed = flightBaseSpeed(f);
  f.speed = f.baseSpeed;
  resetFlightSpawner(f.spawner, seed, start, 0, f.y);
  return f;
}

function flightBaseSpeed(f) {
  return levelBaseSpeed(f.info, f.config) * f.config.flightSpeedFactor;
}

// Move a velocity toward target at `accel`, or let it drift to a stop.
function approach(v, input, max, accel, friction, dt) {
  if (input !== 0) {
    const diff = input * max - v;
    const step = accel * dt;
    return v + (Math.abs(diff) <= step ? diff : Math.sign(diff) * step);
  }
  v *= Math.exp(-friction * dt);
  return Math.abs(v) < 0.01 ? 0 : v;
}

// Advance by dt seconds. steerX: -1 left … 1 right. steerY: -1 down … 1 up.
// Returns this frame's events: { type: 'level' | 'crash' | 'ring' }.
export function stepFlight(f, dt, steerX, steerY, boosting = false) {
  const cfg = f.config;
  const events = f.events;
  events.length = 0;
  if (f.crashed) return events;
  dt = capFrameTime(dt, cfg);
  if (dt === 0) return events;

  steerX = Math.max(-1, Math.min(1, steerX || 0));
  steerY = Math.max(-1, Math.min(1, steerY || 0));
  f.vx = approach(f.vx, steerX, cfg.maxSteerSpeed, cfg.steerAccel, cfg.steerFriction, dt);
  f.vy = approach(f.vy, steerY, cfg.maxClimbSpeed, cfg.climbAccel, cfg.climbFriction, dt);
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  // The ground and the ceiling are soft limits: you stop, you don't crash.
  if (f.y < cfg.flightMinAltitude) { f.y = cfg.flightMinAltitude; f.vy = Math.max(0, f.vy); }
  if (f.y > cfg.flightMaxAltitude) { f.y = cfg.flightMaxAltitude; f.vy = Math.min(0, f.vy); }

  const boostTarget = boosting ? 1 : 0;
  f.boost += (boostTarget - f.boost) * (1 - Math.exp(-cfg.boostEase * dt));
  if (Math.abs(f.boost - boostTarget) < 0.001) f.boost = boostTarget;

  f.time += dt;
  f.levelTime += dt;
  f.baseSpeed = flightBaseSpeed(f) + cfg.speedRampPerSecond * f.levelTime;
  f.speed = f.baseSpeed * (1 + (cfg.boostMultiplier - 1) * f.boost);
  const before = f.distance;
  f.distance += f.speed * dt;

  // Level change?
  const absIndex = Math.floor((f.distance * cfg.scorePerUnit) / cfg.levelLength);
  if (absIndex !== f.levelIndex) {
    f.levelIndex = absIndex;
    levelForDistance(f.distance, cfg, f.levels, f.info);
    f.levelTime = 0;
    f.baseSpeed = flightBaseSpeed(f);
    f.speed = f.baseSpeed * (1 + (cfg.boostMultiplier - 1) * f.boost);
    events.push(LEVEL_EVENT);
  }

  // Obstacles are laid out for full-boost speed, so the open lane is always reachable.
  updateFlightSpawner(f.spawner, f.distance, f.x, f.y, f.baseSpeed * cfg.boostMultiplier);

  // Bonus rings: count one when the jet's centre passes through its opening.
  const rings = f.spawner.rings;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (ring.passed || ring.z > f.distance) continue;
    ring.passed = true;
    if (ring.z > before && Math.abs(f.x - ring.x) < ring.size / 2 && Math.abs(f.y - ring.y) < ring.size / 2) {
      ring.taken = true;
      f.rings++;
      f.bonus += cfg.ringBonus;
      events.push(RING_EVENT);
    }
  }

  const newScore = Math.floor((f.distance - f.startDistance) * cfg.scorePerUnit) + f.bonus;
  if (newScore > f.score) f.score = newScore;

  flightHitbox(f.x, f.y, f.distance, cfg, f.hitbox);
  if (!f.invincible && findBoxCollision(f.hitbox, f.spawner.boxes)) {
    f.crashed = true;
    events.push(CRASH_EVENT);
  }
  return events;
}

// Debug helper: jump to the start of a level (0-based absolute index).
export function jumpFlightToLevel(f, absIndex) {
  const cfg = f.config;
  const start = levelStartDistance(absIndex, cfg);
  f.distance = start;
  f.startDistance = start;
  f.startLevel = absIndex;
  f.score = 0;
  f.bonus = 0;
  f.levelIndex = absIndex;
  f.levelTime = 0;
  f.vx = 0;
  f.vy = 0;
  levelForDistance(start, cfg, f.levels, f.info);
  f.baseSpeed = flightBaseSpeed(f);
  f.speed = f.baseSpeed;
  resetFlightSpawner(f.spawner, f.seed + absIndex * 7919, start, f.x, f.y);
  f.events.length = 0;
  f.events.push(LEVEL_EVENT);
  return f.events;
}

const LEVEL_EVENT = Object.freeze({ type: 'level' });
const CRASH_EVENT = Object.freeze({ type: 'crash' });
const RING_EVENT = Object.freeze({ type: 'ring' });
