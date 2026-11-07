// flight.js — rules for 3D Flight mode (pure logic, no drawing, no DOM).
//
// Like Classic, the jet always flies forward and the level depends on how far
// along the course you are. The difference: you also move up and down,
// between flightMinAltitude and flightMaxAltitude. Flying through a bonus
// ring adds ringBonus points.
//
// Shooting: the jet auto-fires from guns on both wings. Shots fly straight
// ahead (with a little aim assist toward a drone near the line of fire),
// stop at obstacles, and destroy drones for points. Drones are solid.
//
// Units: x = sideways, y = height above the ground, z = distance forward.

import { createFlightSpawner, resetFlightSpawner, updateFlightSpawner } from './flightSpawner.js';
import { levelForDistance, levelBaseSpeed, levelStartDistance } from './levels.js';
import { flightHitbox, findBoxCollision, hitsBox } from './collision.js';
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
    bullets: [],     // { x, y, z, vx, vy, vz, travelled, alive }
    fx: [],          // sparks, debris and floating "+50" text (visual only)
    pool: [],
    scratchBox: { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 },
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
  f.kills = 0;
  f.fireTimer = 0;
  f.gun = 1;
  if (f.bullets) { for (const b of f.bullets) f.pool.push(b); f.bullets.length = 0; f.fx.length = 0; }
  f.x = 0;
  f.vx = 0;
  f.y = cfg.flightStartAltitude;
  f.vy = 0;
  f.bankLook = 0;    // eased bank angle for drawing, degrees (look only)
  f.pitchLook = 0;   // eased nose angle for drawing, degrees (look only)
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

// A softer middle for the stick: x in -1 … 1, e in 0 … 1 (0 = straight line).
// Full deflection still gives full output (stickCurve(±1) = ±1), but small and
// medium moves are gentler, for finer control.
export function stickCurve(x, e = 0) {
  const a = Math.abs(x);
  return Math.sign(x) * ((1 - e) * a + e * a * a * a);
}

// Used if a config has no presets (keeps the plain v1.5.3-style behaviour).
const PLAIN_FEEL = Object.freeze({ ringPx: 55, curve: 0, accelScale: 1, boost: 1 });

// The 3D Flight "Steering feel" preset called `name` ('fine', 'medium' or
// 'quick'); unknown names give the default preset.
export function flightFeelPreset(cfg, name) {
  const presets = cfg.flightFeelPresets;
  if (!presets) return PLAIN_FEEL;
  return (Object.hasOwn(presets, name) && presets[name]) || presets[cfg.flightFeelDefault] || PLAIN_FEEL;
}

// Move a velocity toward target at `accel`, or let it drift to a stop.
// reverseBoost (optional): when you steer against your current movement
// (reversing), or ease off while still moving the same way (braking), the
// pull is this many times stronger, so slowing down and turning around are
// quick. Speeding up uses the normal pull.
export function approach(v, input, max, accel, friction, dt, reverseBoost = 1) {
  if (input !== 0) {
    const target = input * max;
    const diff = target - v;
    const reversing = v !== 0 && Math.sign(input) !== Math.sign(v);
    const braking = v !== 0 && !reversing && Math.abs(target) < Math.abs(v);
    const step = accel * (reversing || braking ? reverseBoost : 1) * dt;
    return v + (Math.abs(diff) <= step ? diff : Math.sign(diff) * step);
  }
  v *= Math.exp(-friction * dt);
  return Math.abs(v) < 0.01 ? 0 : v;
}

// Advance by dt seconds. steerX: -1 left … 1 right. steerY: -1 down … 1 up.
// firing: auto-fire on (true) or off. feel: a Steering feel preset (see
// flightFeelPreset; default: the default preset) for acceleration and boost.
// Returns this frame's events: { type: 'level' | 'crash' | 'ring' | 'shot' |
// 'hit' | 'destroy' } ('destroy' also has `points` and `big`).
export function stepFlight(f, dt, steerX, steerY, boosting = false, firing = false, feel = null) {
  const cfg = f.config;
  const events = f.events;
  events.length = 0;
  if (f.crashed) return events;
  dt = capFrameTime(dt, cfg);
  if (dt === 0) return events;

  steerX = Math.max(-1, Math.min(1, steerX || 0));
  steerY = Math.max(-1, Math.min(1, steerY || 0));
  // 3D Flight's own control values (see config.js), scaled by the Steering feel.
  const feelP = feel || flightFeelPreset(cfg, cfg.flightFeelDefault);
  const rb = feelP.boost ?? 1;
  const as = feelP.accelScale ?? 1;
  f.vx = approach(f.vx, steerX, cfg.flightMaxSteerSpeed, cfg.flightSteerAccel * as, cfg.flightSteerFriction, dt, rb);
  f.vy = approach(f.vy, steerY, cfg.flightMaxClimbSpeed, cfg.climbAccel * as, cfg.climbFriction, dt, rb);
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  // The ground and the ceiling are soft limits: you stop, you don't crash.
  if (f.y < cfg.flightMinAltitude) { f.y = cfg.flightMinAltitude; f.vy = Math.max(0, f.vy); }
  if (f.y > cfg.flightMaxAltitude) { f.y = cfg.flightMaxAltitude; f.vy = Math.min(0, f.vy); }

  // The jet's bank and nose angles (degrees) ease toward their targets, so
  // quick speed changes don't make it rock. Look only: physics, the hitbox
  // and the camera don't use these.
  const look = 1 - Math.exp(-(cfg.flightAttitudeEase ?? 1e9) * dt);
  f.bankLook += ((f.vx / cfg.flightMaxSteerSpeed) * cfg.flightRollDeg - f.bankLook) * look;
  f.pitchLook += ((f.vy / cfg.flightMaxClimbSpeed) * cfg.flightPitchDeg - f.pitchLook) * look;

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

  // Drones sway side to side.
  const targets = f.spawner.targets;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    t.x = t.x0 + t.amp * Math.sin(f.time * 1.4 + t.phase);
    if (t.flash > 0) t.flash = Math.max(0, t.flash - dt);
  }

  if (firing) fire(f, dt);
  moveBullets(f, dt);
  updateFx(f, dt);

  const newScore = Math.floor((f.distance - f.startDistance) * cfg.scorePerUnit) + f.bonus;
  if (newScore > f.score) f.score = newScore;

  flightHitbox(f.x, f.y, f.distance, cfg, f.hitbox);
  if (!f.invincible && (findBoxCollision(f.hitbox, f.spawner.boxes) || hitsTarget(f))) {
    f.crashed = true;
    events.push(CRASH_EVENT);
  }
  return events;
}

// ---- Shooting --------------------------------------------------------------

function targetBox(f, t) {
  const b = f.scratchBox;
  b.x = t.x; b.y = t.y - t.size / 2; b.z = t.z; b.w = t.size; b.h = t.size; b.d = t.size;
  return b;
}

function hitsTarget(f) {
  const ts = f.spawner.targets;
  for (let i = 0; i < ts.length; i++) if (ts[i].alive && hitsBox(f.hitbox, targetBox(f, ts[i]))) return true;
  return false;
}

// Auto-fire: alternate left and right wing guns at `fireRate` shots a second.
function fire(f, dt) {
  const cfg = f.config;
  f.fireTimer -= dt;
  let fired = false;
  while (f.fireTimer <= 0) {
    f.fireTimer += 1 / cfg.fireRate;
    f.gun = -f.gun;
    const b = f.pool.pop() || {};
    b.x = f.x + f.gun * cfg.flightShipSpan * 0.22;
    b.y = f.y - 0.03;
    b.z = f.distance + cfg.flightShipLength * 0.3;
    b.vz = f.speed + cfg.bulletSpeed;
    b.vx = 0;
    b.vy = 0;
    b.travelled = 0;
    b.alive = true;
    // Aim assist: lock on to the nearest drone close to the line of fire.
    const t = aimTarget(f, b);
    if (t) {
      const time = (t.z - b.z) / b.vz;
      b.vx = (t.x - b.x) / time;
      b.vy = (t.y - b.y) / time;
    }
    f.bullets.push(b);
    fired = true;
  }
  if (fired) f.events.push(SHOT_EVENT);
}

function aimTarget(f, b) {
  const cfg = f.config;
  let best = null;
  let bestDz = Infinity;
  const ts = f.spawner.targets;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const dz = t.z - b.z;
    if (!t.alive || dz <= 1 || dz > cfg.bulletRange) continue;
    const cone = t.size / 2 + 0.6 + cfg.aimAssistCone * dz;
    if (Math.abs(t.x - b.x) < cone && Math.abs(t.y - b.y) < cone && dz < bestDz) {
      best = t;
      bestDz = dz;
    }
  }
  return best;
}

function moveBullets(f, dt) {
  const cfg = f.config;
  const bullets = f.bullets;
  const boxes = f.spawner.boxes;
  const ts = f.spawner.targets;
  let w = 0;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    const px = b.x, py = b.y, pz = b.z;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.travelled += b.vz * dt;
    // Did this step pass through a drone? (closest point on the step's path)
    for (let k = 0; k < ts.length && b.alive; k++) {
      const t = ts[k];
      if (!t.alive || t.z + t.size < pz || t.z - t.size > b.z) continue;
      const sx = b.x - px, sy = b.y - py, sz = b.z - pz;
      const len2 = sx * sx + sy * sy + sz * sz || 1;
      let u = ((t.x - px) * sx + (t.y - py) * sy + (t.z - pz) * sz) / len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const cx = px + sx * u - t.x, cy = py + sy * u - t.y, cz = pz + sz * u - t.z;
      const r = t.size * 0.6;
      if (cx * cx + cy * cy + cz * cz < r * r) {
        b.alive = false;
        hitDrone(f, t);
      }
    }
    // Shots stop at obstacles (check the middle and end of the step).
    for (let k = 0; k < boxes.length && b.alive; k++) {
      const o = boxes[k];
      if (Math.abs(o.z - b.z) > o.d / 2 + 2) continue;
      for (const u of [0.5, 1]) {
        const x = px + (b.x - px) * u, y = py + (b.y - py) * u, z = pz + (b.z - pz) * u;
        if (Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2 && y > o.y && y < o.y + o.h) {
          b.alive = false;
          burst(f, x, y, o.z - o.d / 2, 5, 0.25, '#fff3c4');
          break;
        }
      }
    }
    if (b.alive && b.travelled < cfg.bulletRange) bullets[w++] = b;
    else f.pool.push(b);
  }
  bullets.length = w;
}

function hitDrone(f, t) {
  const cfg = f.config;
  t.hp--;
  t.flash = 0.12;
  if (t.hp > 0) {
    burst(f, t.x, t.y, t.z - t.size / 2, 6, 0.3, '#ffffff');
    f.events.push(HIT_EVENT);
    return;
  }
  t.alive = false;
  const points = t.big ? cfg.bigTargetPoints : cfg.targetPoints;
  f.bonus += points;
  f.kills++;
  burst(f, t.x, t.y, t.z, t.big ? 26 : 16, t.big ? 0.9 : 0.6, t.big ? '#ffb347' : '#ff6b8b');
  f.fx.push({ kind: 'text', text: `+${points}`, x: t.x, y: t.y + t.size, z: t.z, vx: 0, vy: 1.6, vz: f.speed * 0.6, life: 0.9, maxLife: 0.9 });
  f.events.push({ type: 'destroy', points, big: t.big });
}

// Sparks flying out from a point (visual only).
function burst(f, x, y, z, count, life, color) {
  for (let i = 0; i < count && f.fx.length < 160; i++) {
    const a = (i / count) * Math.PI * 2 + i * 0.7;
    const e = 2 + (i % 5);
    f.fx.push({
      kind: 'spark', color, x, y, z,
      vx: Math.cos(a) * e, vy: Math.sin(a) * e + 1, vz: f.speed * 0.8 + ((i % 3) - 1) * 2,
      life, maxLife: life,
    });
  }
}

function updateFx(f, dt) {
  const fx = f.fx;
  let w = 0;
  for (let i = 0; i < fx.length; i++) {
    const p = fx[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.kind === 'spark') p.vy -= 9 * dt;
    fx[w++] = p;
  }
  fx.length = w;
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
  for (const b of f.bullets) f.pool.push(b);
  f.bullets.length = 0;
  f.fx.length = 0;
  f.events.length = 0;
  f.events.push(LEVEL_EVENT);
  return f.events;
}

const LEVEL_EVENT = Object.freeze({ type: 'level' });
const CRASH_EVENT = Object.freeze({ type: 'crash' });
const RING_EVENT = Object.freeze({ type: 'ring' });
const SHOT_EVENT = Object.freeze({ type: 'shot' });
const HIT_EVENT = Object.freeze({ type: 'hit' });
