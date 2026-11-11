// sprites.js — small soft-glow pictures, drawn once in code and reused.
//
// A glow used to be a new "radial gradient" object every frame. Now each kind
// of glow is painted once into a tiny off-screen canvas and stamped wherever
// it's needed, at any size. Nothing is created in the draw loops.
// (All art is made here in code: there are no image files.)

const SIZE = 64;
const cache = new Map();

// A round glow: `inner` colour in the middle, `mid` at `midStop` (0–1), fading
// to transparent at the edge. Colours are any CSS colour. Cached by its settings.
export function glowSprite(inner, mid = inner, midStop = 0.35) {
  const key = inner + '|' + mid + '|' + midStop;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext('2d');
  const half = SIZE / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, inner);
  grad.addColorStop(midStop, mid);
  grad.addColorStop(1, transparent(mid));
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  // Keep the cache small (palettes change only at level changes).
  if (cache.size > 80) cache.clear();
  cache.set(key, c);
  return c;
}

// Stamp a glow centred on (x, y) with the given radius.
export function drawGlow(ctx, sprite, x, y, radius) {
  if (!(radius > 0.25)) return;
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
}

// Stamp a stretched glow (an ellipse): rx sideways, ry up/down.
export function drawGlowOval(ctx, sprite, x, y, rx, ry) {
  if (!(rx > 0.25) || !(ry > 0.25)) return;
  ctx.drawImage(sprite, x - rx, y - ry, rx * 2, ry * 2);
}

// The same colour, fully see-through (so the fade doesn't go grey).
function transparent(color) {
  if (color[0] === '#' && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(color);
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},0)`;
  }
  return 'rgba(255,255,255,0)';
}
