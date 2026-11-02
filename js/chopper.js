// chopper.js — rules for 3D Heli mode (pure logic, no drawing, no DOM).
//
// A helicopter flies the 3D Flight courses (same levels, no drones), using two
// controls like a real one:
//   lever  — the collective, 0 (bottom) … 1 (top). At chopperHover it holds
//            height; above, it climbs; below, it sinks. (The lever "staying
//            put" is the input's job: this file just reads its position.)
//   stickX — the cyclic sideways, -1 left … 1 right: slide sideways.
//   stickY — the cyclic forward/back, -1 pull back … 1 push forward: speed up
//            or brake. There is no flying backwards.
// You choose your own speed, up to the level's top speed. Faster flying earns
// a score multiplier of up to chopperMaxMultiplier.
//
// A run starts on a helipad on the ground with the lever at 0. Touching down
// gently is a landing; dropping faster than chopperCrashSink is a crash. Any
// block hitting the body OR the main rotor is a crash (rotor strike).
//
// Units: x = sideways, y = height of the body's centre, z = distance forward.
// "Levels" here are chopperLevelDistance units long (distance only, so the
// multiplier never skips levels).

import { createFlightSpawner, resetFlightSpawner, updateFlightSpawner } from './flightSpawner.js';
import { levelForDistance, levelBaseSpeed, levelStartDistance } from './levels.js';
import { findBoxCollision } from './collision.js';
import { capFrameTime } from './game.js';

// Thickness of the rotor's hitbox (a thin flat box on top of the body).
export const ROTOR_THICKNESS = 0.12;

// The settings the course is built with in this mode: 3D Flight's settings,
// but with this mode's level length and the helicopter's own sideways and
// up/down speeds (the slower of climbing and sinking), so the always-open
// path only bends as sharply as the helicopter can follow at full speed.
export function chopperConfig(config) {
  return {
    ...config,
    levelLength: config.chopperLevelDistance * config.scorePerUnit,
    maxSteerSpeed: config.chopperMaxSideSpeed,
    maxClimbSpeed: Math.min(config.chopperMaxClimb, config.chopperMaxSink),
  };
}

// Top speed for a level (info from levelForDistance with the chopper settings).
// It follows Classic's speed for that level and lap, including speedBonus.
export function chopperTopSpeed(info, config) {
  return levelBaseSpeed(info, config) * config.chopperTopSpeedFactor;
}

// Score multiplier: ×1 at or below half of top speed, rising in a straight
// line to ×chopperMaxMultiplier at top speed.
export function chopperMultiplier(speed, topSpeed, config) {
  const half = topSpeed / 2;
  if (!(topSpeed > 0) || speed <= half) return 1;
  const t = Math.min(1, (speed - half) / half);
  return 1 + (config.chopperMaxMultiplier - 1) * t;
}

// Where the lever must sit for a vertical speed (inverse of targetClimb).
export function leverFor(vy, config) {
  const h = config.chopperHover;
  if (vy >= 0) return Math.min(1, h + (vy / config.chopperMaxClimb) * (1 - h));
  return Math.max(0, h + (vy / config.chopperMaxSink) * h);
}

// The vertical speed the lever asks for.
export function targetClimb(lever, config) {
  const h = config.chopperHover;
  const d = lever - h;
  if (d >= 0) return (d / (1 - h)) * config.chopperMaxClimb;
  return (d / h) * config.chopperMaxSink;
}

export function createChopper(config, levels, seed = 1) {
  const course = chopperConfig(config);
  const c = {
    config,
    course,
    levels,
    spawner: createFlightSpawner(course, levels, seed, { drones: false, recordPath: true }),
    info: {},
    hitbox: {},      // body: fuselage and tail boom
    rotorBox: {},    // main rotor disc
    events: [],
    seed,
    invincible: false,
  };
  resetChopper(c, seed);
  return c;
}

// The height of the body's centre when sitting on the ground (skids down).
export function groundY(config) {
  return config.flightMinAltitude;
}

// Start a fresh run on the helipad. startLevel is 0-based.
export function resetChopper(c, seed = c.seed + 1, startLevel = 0) {
  const cfg = c.config;
  const start = levelStartDistance(Math.max(0, startLevel), c.course);
  c.seed = seed;
  c.startLevel = Math.max(0, startLevel);
  c.startDistance = start;
  c.padZ = start;          // the helipad
  c.distance = start;
  c.x = 0;
  c.y = groundY(cfg);
  c.vx = 0;
  c.vy = 0;
  c.speed = 0;
  c.accel = 0;             // forward acceleration (for the nose tilt)
  c.lever = 0;
  c.stickX = 0;
  c.stickY = 0;
  c.onGround = true;
  c.points = 0;            // distance points (with the multiplier), before rounding
  c.score = 0;
  c.rings = 0;
  c.multiplier = 1;
  c.topMultiplier = 1;
  c.time = 0;
  c.levelTime = 0;
  c.crashed = false;
  c.crashReason = '';
  c.events.length = 0;
  levelForDistance(start, c.course, c.levels, c.info);
  c.levelIndex = c.info.absIndex;
  c.topSpeed = chopperTopSpeed(c.info, c.course);
  resetFlightSpawner(c.spawner, seed, start, 0, c.y);
  chopperHitboxes(c);
  return c;
}

// Fill in the body and rotor hitboxes for the current position.
export function chopperHitboxes(c) {
  const cfg = c.config;
  const k = cfg.chopperHitboxScale;
  const b = c.hitbox;
  b.x = c.x;
  b.y = c.y;
  b.z = c.distance;
  b.halfW = (cfg.chopperBodyWidth * k) / 2;
  b.halfH = (cfg.chopperBodyHeight * k) / 2;
  b.halfD = (cfg.chopperLength * k) / 2;
  const r = c.rotorBox;
  r.x = c.x;
  r.y = c.y + b.halfH + ROTOR_THICKNESS / 2;
  r.z = c.distance;
  r.halfW = (cfg.chopperRotorDiameter * k) / 2;
  r.halfH = ROTOR_THICKNESS / 2;
  r.halfD = (cfg.chopperRotorDiameter * k) / 2;
}

// One box around both hitboxes (used by the fairness tests and debug view).
export function chopperOuterBox(config, out = {}) {
  const k = config.chopperHitboxScale;
  const bodyHalfH = (config.chopperBodyHeight * k) / 2;
  out.halfW = Math.max(config.chopperBodyWidth, config.chopperRotorDiameter) * k / 2;
  out.halfD = Math.max(config.chopperLength, config.chopperRotorDiameter) * k / 2;
  out.bottom = -bodyHalfH;                          // relative to the body's centre
  out.top = bodyHalfH + ROTOR_THICKNESS;
  out.halfH = (out.top - out.bottom) / 2;
  out.centreY = (out.top + out.bottom) / 2;
  return out;
}

// Move a velocity toward input × max at `accel`, or let it drift to a stop.
function approach(v, input, max, accel, friction, dt) {
  if (input !== 0) {
    const diff = input * max - v;
    const step = accel * dt;
    return v + (Math.abs(diff) <= step ? diff : Math.sign(diff) * step);
  }
  v *= Math.exp(-friction * dt);
  return Math.abs(v) < 0.01 ? 0 : v;
}

// Advance by dt seconds with the two controls (see the top of this file).
// Returns this frame's events: { type: 'liftoff' | 'land' | 'level' | 'ring' |
// 'crash' }. A crash also sets c.crashReason ('hard landing', 'hit' or
// 'rotor strike').
export function stepChopper(c, dt, lever, stickX, stickY) {
  const cfg = c.config;
  const events = c.events;
  events.length = 0;
  if (c.crashed) return events;
  dt = capFrameTime(dt, cfg);
  if (dt === 0) return events;

  c.lever = clamp(Number.isFinite(lever) ? lever : 0, 0, 1);
  c.stickX = clamp(stickX || 0, -1, 1);
  c.stickY = clamp(stickY || 0, -1, 1);
  c.time += dt;
  c.levelTime += dt;

  // ---- Up and down: the collective ----
  const target = targetClimb(c.lever, cfg);
  c.vy += (target - c.vy) * (1 - Math.exp(-cfg.chopperClimbEase * dt));
  c.y += c.vy * dt;
  if (c.y > cfg.flightMaxAltitude) { c.y = cfg.flightMaxAltitude; c.vy = Math.min(0, c.vy); }
  const gy = groundY(cfg);
  if (c.y <= gy) {
    if (!c.onGround) {
      const sink = -c.vy;
      c.onGround = true;
      if (sink > cfg.chopperCrashSink && !c.invincible) {
        c.y = gy;
        c.vy = 0;
        return crash(c, 'hard landing');
      }
      events.push(LAND_EVENT);
    }
    c.y = gy;
    c.vy = Math.max(0, c.vy);
  } else if (c.onGround) {
    c.onGround = false;
    events.push(LIFTOFF_EVENT);
  }

  // ---- Forward: the cyclic, forward/back ----
  const before = c.speed;
  if (c.onGround) {
    // Skids on the ground: you slow to a stop and can't fly forward yet.
    c.speed *= Math.exp(-6 * dt);
    if (c.speed < 0.05) c.speed = 0;
  } else if (c.stickY > 0) {
    c.speed += c.stickY * cfg.chopperForwardAccel * dt;
  } else if (c.stickY < 0) {
    c.speed += c.stickY * cfg.chopperBrake * dt;
  } else {
    c.speed *= Math.exp(-cfg.chopperForwardDrag * dt);
  }
  c.speed = clamp(c.speed, 0, c.topSpeed);
  c.accel = (c.speed - before) / dt;

  // ---- Sideways: the cyclic, left/right (it slides a little) ----
  if (c.onGround) {
    c.vx *= Math.exp(-10 * dt);
    if (Math.abs(c.vx) < 0.01) c.vx = 0;
  } else {
    c.vx = approach(c.vx, c.stickX, cfg.chopperMaxSideSpeed, cfg.chopperSideAccel, cfg.chopperSideFriction, dt);
  }
  c.x += c.vx * dt;

  const zBefore = c.distance;
  c.distance += c.speed * dt;

  // ---- Score: distance × multiplier, plus rings ----
  c.multiplier = chopperMultiplier(c.speed, c.topSpeed, cfg);
  if (c.multiplier > c.topMultiplier) c.topMultiplier = c.multiplier;
  c.points += (c.distance - zBefore) * cfg.chopperScorePerUnit * c.multiplier;

  // ---- Level change (by distance only) ----
  const absIndex = Math.floor(c.distance / cfg.chopperLevelDistance + 1e-9);
  if (absIndex !== c.levelIndex) {
    levelForDistance(c.distance, c.course, c.levels, c.info);
    c.levelIndex = c.info.absIndex;
    c.levelTime = 0;
    c.topSpeed = chopperTopSpeed(c.info, c.course);
    events.push(LEVEL_EVENT);
  }

  // The course ahead is laid out for the top speed you could have by the
  // time you get there (the next level's, if it starts within view).
  updateFlightSpawner(c.spawner, c.distance, c.x, c.y, layoutSpeed(c));

  // Bonus rings: count one when the helicopter's centre passes through.
  const rings = c.spawner.rings;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (ring.passed || ring.z > c.distance) continue;
    ring.passed = true;
    if (ring.z > zBefore && Math.abs(c.x - ring.x) < ring.size / 2 && Math.abs(c.y - ring.y) < ring.size / 2) {
      ring.taken = true;
      c.rings++;
      events.push(RING_EVENT);
    }
  }

  const newScore = Math.floor(c.points) + c.rings * cfg.ringBonus;
  if (newScore > c.score) c.score = newScore;

  chopperHitboxes(c);
  if (!c.invincible) {
    if (findBoxCollision(c.hitbox, c.spawner.boxes)) return crash(c, 'hit');
    if (findBoxCollision(c.rotorBox, c.spawner.boxes)) return crash(c, 'rotor strike');
  }
  return events;
}

// True if the body or the rotor touches any of the boxes.
export function chopperHits(c, boxes) {
  return !!(findBoxCollision(c.hitbox, boxes) || findBoxCollision(c.rotorBox, boxes));
}

function layoutSpeed(c) {
  levelForDistance(c.distance + c.config.fogDistance + c.config.spawnStep, c.course, c.levels, AHEAD);
  return Math.max(c.topSpeed, chopperTopSpeed(AHEAD, c.course));
}

function crash(c, reason) {
  c.crashed = true;
  c.crashReason = reason;
  c.events.push(CRASH_EVENT);
  return c.events;
}

// ---- The open path ahead ---------------------------------------------------

// The centre of the always-open path at distance z (null if not laid out yet).
export function pathAt(sp, z, out = {}) {
  const path = sp.path;
  if (path.length === 0) return null;
  if (z <= path[0].z) { out.x = path[0].x; out.y = path[0].y; out.slopeX = 0; out.slopeY = 0; return out; }
  // Points are spawnStep apart, so jump straight to the right one.
  const step = sp.config.spawnStep;
  let i = Math.min(path.length - 2, Math.max(0, Math.floor((z - path[0].z) / step)));
  while (i > 0 && path[i].z > z) i--;
  while (i < path.length - 2 && path[i + 1].z < z) i++;
  if (i < 0 || path.length < 2) { const p = path[path.length - 1]; out.x = p.x; out.y = p.y; out.slopeX = 0; out.slopeY = 0; return out; }
  const a = path[i], b = path[i + 1];
  const dz = b.z - a.z || 1;
  const t = clamp((z - a.z) / dz, 0, 1);
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.slopeX = (b.x - a.x) / dz;
  out.slopeY = (b.y - a.y) / dz;
  return out;
}

// ---- Autopilot ---------------------------------------------------------------
// Flies using only the lever and the stick, like a player: lift off, push
// forward to full speed, and follow the centre of the open path ahead.
// Used by the menu preview and the fairness tests.

export const AUTOPILOT = {
  lookahead: 0.12,   // seconds: aim at where the path will be this soon
  sideGain: 7,       // how hard it steers back to the path's centre
  climbGain: 5,      // …and back to the path's height
  leverDrive: 3,     // how far it "overdrives" the lever to beat the lag in climbing
};

const AP = { x: 0, y: 0, slopeX: 0, slopeY: 0 };

export function chopperAutopilot(c, out = {}) {
  const cfg = c.config;
  const A = AUTOPILOT;
  const outer = chopperOuterBox(cfg, OUTER);
  out.stickY = 1;
  const v = Math.max(c.speed, 1);
  const p = pathAt(c.spawner, c.distance + v * A.lookahead, AP);
  if (!p) { out.lever = 1; out.stickX = 0; return out; }
  // Sideways: match the path's sideways speed, plus a pull toward its centre.
  // (Compare with where we'll be by then, so we don't cut ahead of the path.)
  const T = A.lookahead;
  const wantVx = p.slopeX * c.speed + (p.x - (c.x + c.vx * T)) * A.sideGain;
  out.stickX = clamp(wantVx / cfg.chopperMaxSideSpeed, -1, 1);
  if (out.stickX === 0 && wantVx !== 0) out.stickX = Math.sign(wantVx) * 1e-6;
  // Up/down: keep the hitbox (rotor included) centred in the opening.
  const wantY = p.y - outer.centreY;
  const wantVy = p.slopeY * c.speed + (wantY - (c.y + c.vy * T)) * A.climbGain;
  const cmd = c.vy + (wantVy - c.vy) * A.leverDrive;
  out.lever = leverFor(cmd, cfg);
  return out;
}

// Debug helper: jump to the start of a level (0-based absolute index). You
// keep flying at the same height and speed.
export function jumpChopperToLevel(c, absIndex) {
  const start = levelStartDistance(absIndex, c.course);
  c.distance = start;
  c.startDistance = start;
  c.startLevel = absIndex;
  c.padZ = -1e9;
  c.points = 0;
  c.score = 0;
  c.rings = 0;
  c.topMultiplier = 1;
  c.levelTime = 0;
  c.vx = 0;
  levelForDistance(start, c.course, c.levels, c.info);
  c.levelIndex = c.info.absIndex;
  c.topSpeed = chopperTopSpeed(c.info, c.course);
  c.speed = Math.min(c.speed, c.topSpeed);
  resetFlightSpawner(c.spawner, c.seed + absIndex * 7919, start, c.x, c.y);
  chopperHitboxes(c);
  c.events.length = 0;
  c.events.push(LEVEL_EVENT);
  return c.events;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

const AHEAD = {};
const OUTER = {};
const LEVEL_EVENT = Object.freeze({ type: 'level' });
const CRASH_EVENT = Object.freeze({ type: 'crash' });
const RING_EVENT = Object.freeze({ type: 'ring' });
const LAND_EVENT = Object.freeze({ type: 'land' });
const LIFTOFF_EVENT = Object.freeze({ type: 'liftoff' });
