// collision.js — hit detection (pure logic, no drawing).
//
// Boxes are flat rectangles on the ground: centre (x, z), half width halfW
// (sideways) and half depth halfD (forwards). Touching edges is NOT a hit;
// the boxes must actually overlap.

export function boxesOverlap(a, b) {
  return Math.abs(a.x - b.x) < a.halfW + b.halfW &&
         Math.abs(a.z - b.z) < a.halfD + b.halfD;
}

// The ship's hitbox, a bit smaller than the drawn ship (config.hitboxScale).
export function shipHitbox(x, z, config, out = {}) {
  out.x = x;
  out.z = z;
  out.halfW = (config.shipWidth * config.hitboxScale) / 2;
  out.halfD = (config.shipLength * config.hitboxScale) / 2;
  return out;
}

export function cubeBox(cube, out = {}) {
  out.x = cube.x;
  out.z = cube.z;
  out.halfW = cube.size / 2;
  out.halfD = cube.size / 2;
  return out;
}

const scratch = { x: 0, z: 0, halfW: 0, halfD: 0 };

// Returns the first cube the ship box overlaps, or null.
export function findCollision(ship, cubes) {
  for (let i = 0; i < cubes.length; i++) {
    const c = cubes[i];
    // Quick reject on depth before building the box.
    if (Math.abs(c.z - ship.z) >= ship.halfD + c.size / 2) continue;
    if (boxesOverlap(ship, cubeBox(c, scratch))) return c;
  }
  return null;
}
