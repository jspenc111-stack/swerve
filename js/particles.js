// particles.js — a fixed-size pool of particles, plus the ship's trail
// (pure logic: no drawing, no DOM, so it's tested in Node).
//
// A "pool" means every particle object is made once, up front, and reused.
// Nothing is created while the game runs, so there are no pauses from the
// phone tidying up memory.
//
// Particles are look only: trails, near-miss sparks, crash shards, cube
// bits, dust, embers, sparkles. They never affect scores, speeds or hitboxes.
//
// Positions are in world units: x sideways, y height, z distance (Classic,
// 3D Flight, 3D Heli). The Helicopter cave uses x = distance and y = height.

// What a particle is (the renderers draw each kind differently).
export const KIND = Object.freeze({
  spark: 0,   // a bright streak (near misses, sparkles)
  shard: 1,   // a spinning triangle (the ship breaking up)
  bit: 2,     // a small tumbling cube (the cube that was hit)
  dust: 3,    // a faint drifting mote (ambient)
  ember: 4,   // a glowing drifting speck (ambient)
});

export const PARTICLE_CAP_FULL = 300;
export const PARTICLE_CAP_LITE = 80;

function blank() {
  return {
    kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    life: 0, maxLife: 1, size: 0.1, color: '#ffffff',
    gravity: 0, drag: 0, rot: 0, spin: 0, alpha: 1, ground: false,
  };
}

// cap: the most particles there can ever be (the pool size).
export function createParticles(cap = PARTICLE_CAP_FULL) {
  const items = [];
  for (let i = 0; i < cap; i++) items.push(blank());
  return { items, count: 0, cap, limit: cap };
}

// Lower (or raise) how many may be alive at once: Full or Lite. Never above
// the pool size. Extra particles are dropped at once.
export function setParticleLimit(ps, limit) {
  ps.limit = Math.max(0, Math.min(ps.cap, Math.floor(limit)));
  if (ps.count > ps.limit) ps.count = ps.limit;
}

// Start a particle. Returns it (so the caller can set extras such as color,
// gravity, drag, spin, ground), or null if the pool is full.
export function spawn(ps, kind, x, y, z, vx, vy, vz, life, size = 0.1, color = '#ffffff') {
  if (ps.count >= ps.limit || !(life > 0)) return null;
  const p = ps.items[ps.count++];
  p.kind = kind;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.life = life; p.maxLife = life;
  p.size = size; p.color = color;
  p.gravity = 0; p.drag = 0; p.rot = 0; p.spin = 0; p.alpha = 1; p.ground = false;
  return p;
}

// Advance every particle by dt seconds: move, fall, slow down, fade, expire.
export function update(ps, dt) {
  if (!(dt > 0)) return;
  const items = ps.items;
  let i = 0;
  while (i < ps.count) {
    const p = items[i];
    p.life -= dt;
    if (p.life <= 0) {
      // Expired: swap it with the last live one (no gaps, nothing created).
      ps.count--;
      items[i] = items[ps.count];
      items[ps.count] = p;
      continue;
    }
    p.vy -= p.gravity * dt;
    if (p.drag > 0) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    // Things marked `ground` bounce softly instead of sinking through the floor.
    if (p.ground && p.y < 0) {
      p.y = 0;
      p.vy = -p.vy * 0.35;
      p.vx *= 0.7; p.vz *= 0.7;
      p.spin *= 0.6;
    }
    p.rot += p.spin * dt;
    p.alpha = p.life / p.maxLife;
    i++;
  }
}

export function clearParticles(ps) {
  ps.count = 0;
}

// ---- The trail --------------------------------------------------------------
// The last few places the ship has been, newest first, so the engine trail
// can be drawn as a ribbon that curves when you steer. A fixed ring of points.

export function createTrail(size = 32) {
  return {
    x: new Float64Array(size), y: new Float64Array(size), z: new Float64Array(size),
    size, head: 0, count: 0,
  };
}

// Remember where the ship is now. Points closer together than minStep (along
// z) replace the newest one instead of piling up.
export function pushTrail(t, x, y, z, minStep = 0.08) {
  if (t.count > 0 && Math.abs(z - t.z[t.head]) < minStep) {
    t.x[t.head] = x; t.y[t.head] = y; t.z[t.head] = z;
    return;
  }
  t.head = (t.head + 1) % t.size;
  t.x[t.head] = x; t.y[t.head] = y; t.z[t.head] = z;
  if (t.count < t.size) t.count++;
}

// The index of the i-th newest point (0 = newest), or -1 if there isn't one.
export function trailIndex(t, i) {
  if (i < 0 || i >= t.count) return -1;
  return (t.head - i + t.size * 2) % t.size;
}

export function clearTrail(t) {
  t.count = 0;
  t.head = 0;
}
