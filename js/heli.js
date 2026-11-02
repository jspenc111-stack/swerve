// heli.js — rules for Helicopter mode (pure logic, no drawing, no DOM).
//
// A side view: the helicopter flies right through an endless cave. Hold to
// rise, let go to drop. Touching a wall, block, spike or gate ends the run.
// Flying through a gem adds heliGemBonus points.
//
// Units: x = distance forward (the helicopter is at x = distance),
// y = height (up is positive), speeds in units per second.

import {
  createCaveSpawner, resetCaveSpawner, updateCaveSpawner, caveHit, pathYAt,
  heliLevelAt, heliLevelStart, heliBaseSpeed,
} from './caveSpawner.js';
import { capFrameTime } from './game.js';

export function createHeli(config, levels, seed = 1) {
  const h = {
    config,
    levels,
    spawner: createCaveSpawner(config, levels, seed),
    info: {},
    hitbox: {},
    events: [],
    seed,
    invincible: false,
  };
  resetHeli(h, seed);
  return h;
}

// Start a fresh run. startLevel is 0-based. The helicopter hovers until the
// first hold.
export function resetHeli(h, seed = h.seed + 1, startLevel = 0) {
  const cfg = h.config;
  const start = heliLevelStart(Math.max(0, startLevel), cfg);
  h.seed = seed;
  h.startLevel = Math.max(0, startLevel);
  h.startDistance = start;
  h.distance = start;
  h.score = 0;
  h.gems = 0;
  h.y = cfg.heliWorldHeight / 2;
  h.vy = 0;
  h.pitch = 0;          // radians, nose up is positive
  h.holding = false;
  h.started = false;    // nothing moves until the first hold
  h.time = 0;           // seconds of flying (stops while paused)
  h.clock = 0;          // seconds, including the hover before the start (for animation)
  h.levelTime = 0;
  h.crashed = false;
  h.events.length = 0;
  heliLevelAt(start, cfg, h.levels, h.info);
  h.levelIndex = h.info.absIndex;
  h.baseSpeed = heliBaseSpeed(h.info, cfg);
  h.speed = h.baseSpeed;
  resetCaveSpawner(h.spawner, seed, start, h.y);
  heliHitbox(h, h.hitbox);
  return h;
}

// The hitbox covers the body and skids only (not the rotor blades), and is a
// little smaller than the drawing so near-misses feel fair.
export function heliHitbox(h, out = {}) {
  const cfg = h.config;
  out.x = h.distance;
  out.y = h.y;
  out.halfW = (cfg.heliWidth * cfg.heliHitboxScale) / 2;
  out.halfH = (cfg.heliHeight * cfg.heliHitboxScale) / 2;
  return out;
}

// Advance by dt seconds. holding: true while the player holds the screen.
// Returns this frame's events: { type: 'start' | 'level' | 'gem' | 'crash' }.
export function stepHeli(h, dt, holding) {
  const cfg = h.config;
  const events = h.events;
  events.length = 0;
  if (h.crashed) return events;
  dt = capFrameTime(dt, cfg);
  if (dt === 0) return events;
  h.clock += dt;
  h.holding = !!holding;

  if (!h.started) {
    if (!holding) return events; // hovering, waiting for the first touch
    h.started = true;
    events.push(START_EVENT);
  }

  // Up and down: lift while holding, gravity always.
  const accel = holding ? cfg.heliLift - cfg.heliGravity : -cfg.heliGravity;
  h.vy += accel * dt;
  if (h.vy > cfg.heliMaxVSpeed) h.vy = cfg.heliMaxVSpeed;
  if (h.vy < -cfg.heliMaxVSpeed) h.vy = -cfg.heliMaxVSpeed;
  h.y += h.vy * dt;
  if (h.invincible) {
    // Debug: stay inside the world instead of crashing.
    const top = cfg.heliWorldHeight - 0.5;
    if (h.y > top) { h.y = top; h.vy = Math.min(0, h.vy); }
    if (h.y < 0.5) { h.y = 0.5; h.vy = Math.max(0, h.vy); }
  }

  // Nose tips up while climbing, down while falling, following smoothly.
  const pitchTarget = (h.vy / cfg.heliMaxVSpeed) * cfg.heliPitchDeg * (Math.PI / 180);
  h.pitch += (pitchTarget - h.pitch) * (1 - Math.exp(-8 * dt));

  // Forward, speeding up gently within the level.
  h.time += dt;
  h.levelTime += dt;
  h.speed = heliBaseSpeed(h.info, cfg) + cfg.heliSpeedRampPerSecond * h.levelTime;
  h.distance += h.speed * dt;

  // Level change?
  heliLevelAt(h.distance, cfg, h.levels, LEVEL_SCRATCH);
  if (LEVEL_SCRATCH.absIndex !== h.levelIndex) {
    heliLevelAt(h.distance, cfg, h.levels, h.info);
    h.levelIndex = h.info.absIndex;
    h.levelTime = 0;
    h.baseSpeed = heliBaseSpeed(h.info, cfg);
    h.speed = h.baseSpeed;
    events.push(LEVEL_EVENT);
  }

  updateCaveSpawner(h.spawner, h.distance);
  heliHitbox(h, h.hitbox);

  // Gems: flying through one collects it (they aren't solid).
  const hb = h.hitbox;
  const gems = h.spawner.gems;
  for (let i = 0; i < gems.length; i++) {
    const gem = gems[i];
    if (gem.taken) continue;
    if (Math.abs(gem.x - hb.x) < hb.halfW + gem.r && Math.abs(gem.y - hb.y) < hb.halfH + gem.r) {
      gem.taken = true;
      h.gems++;
      events.push(GEM_EVENT);
    }
  }

  const newScore = Math.floor((h.distance - h.startDistance) * cfg.heliScorePerUnit) +
    h.gems * cfg.heliGemBonus;
  if (newScore > h.score) h.score = newScore;

  if (!h.invincible && caveHit(h.spawner, hb)) {
    h.crashed = true;
    events.push(CRASH_EVENT);
  }
  return events;
}

// The autopilot: decides "hold or not" from the helicopter's height and
// vertical speed and the open path ahead. It looks about 0.35 seconds ahead:
// "where will I be then, and where will the path be?" Used by the menu
// preview and by the fairness tests.
export const AUTOPILOT_LOOKAHEAD = 0.35;

export function autopilot(h) {
  const T = AUTOPILOT_LOOKAHEAD;
  const target = pathYAt(h.spawner, h.distance + h.speed * T);
  if (target === null) return false;
  return h.y + h.vy * T < target;
}

// Debug helper: jump to the start of a level (0-based absolute index).
export function jumpHeliToLevel(h, absIndex) {
  const cfg = h.config;
  const start = heliLevelStart(absIndex, cfg);
  h.distance = start;
  h.startDistance = start;
  h.startLevel = absIndex;
  h.score = 0;
  h.gems = 0;
  h.levelTime = 0;
  h.vy = 0;
  h.y = cfg.heliWorldHeight / 2;
  heliLevelAt(start, cfg, h.levels, h.info);
  h.levelIndex = h.info.absIndex;
  h.baseSpeed = heliBaseSpeed(h.info, cfg);
  h.speed = h.baseSpeed;
  resetCaveSpawner(h.spawner, h.seed + absIndex * 7919, start, h.y);
  heliHitbox(h, h.hitbox);
  h.events.length = 0;
  h.events.push(LEVEL_EVENT);
  return h.events;
}

const LEVEL_SCRATCH = {};
const START_EVENT = Object.freeze({ type: 'start' });
const LEVEL_EVENT = Object.freeze({ type: 'level' });
const GEM_EVENT = Object.freeze({ type: 'gem' });
const CRASH_EVENT = Object.freeze({ type: 'crash' });
