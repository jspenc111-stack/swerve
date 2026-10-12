// levels.js — which level you're on, lap looping, level speed and color
// blending (pure logic, no drawing).

// ---- Level lookup --------------------------------------------------------

// Distance (world units) at which level number `absIndex` (0-based, counting
// across laps) begins.
export function levelStartDistance(absIndex, config) {
  return (absIndex * config.levelLength) / config.scorePerUnit;
}

// Info about the level for a given score.
//   absIndex  — 0-based count of levels reached, across laps
//   listIndex — which entry in LEVELS
//   lap       — 1 for the first time through, 2 after looping, …
export function levelForScore(score, config, levels, out = {}) {
  const absIndex = Math.max(0, Math.floor(score / config.levelLength));
  out.absIndex = absIndex;
  out.listIndex = absIndex % levels.length;
  out.lap = Math.floor(absIndex / levels.length) + 1;
  out.level = levels[out.listIndex];
  return out;
}

export function levelForDistance(distance, config, levels, out = {}) {
  return levelForScore(distance * config.scorePerUnit, config, levels, out);
}

// Forward speed at the start of a level (before the gentle in-level ramp).
export function levelBaseSpeed(info, config) {
  return config.baseSpeed +
    config.speedPerLevel * info.absIndex +
    config.lapSpeedBonus * (info.lap - 1) +
    (info.level.speedBonus || 0);
}

// True if `distance` is inside the obstacle-free stretch around a level change.
export function inBreather(distance, config) {
  const len = config.levelLength / config.scorePerUnit;
  const k = Math.round(distance / len);
  if (k < 1) return false;
  const boundary = k * len;
  return distance >= boundary - config.breatherBefore && distance < boundary + config.breatherAfter;
}

// ---- Colors ----------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isValidColor = (c) => typeof c === 'string' && HEX.test(c);

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Mix two #rrggbb colors; t = 0 → a, t = 1 → b.
export function mixColor(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}
