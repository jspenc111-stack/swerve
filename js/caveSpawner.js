// caveSpawner.js — builds the cave for Helicopter mode (pure logic, seeded
// random so tests repeat).
//
// Units: x = distance forward (to the right), y = height (0 = bottom of the
// world, heliWorldHeight = top). The helicopter is at x = distance.
//
// How fairness is guaranteed: the cave is built in thin columns, caveStep
// wide. For every column we FIRST lay down an invisible "open path": a
// centerline that wanders up and down, with a clear corridor heliMinGap tall
// around it. The path never gets steeper, and never bends more sharply, than
// the helicopter can follow at the fastest speed you can be going there.
// Only then are the walls and obstacles added, and none of them is ever
// allowed into the corridor. An obstacle that doesn't fit is cut shorter; if
// that makes it too small it is left out.

import { makeRandom } from './spawner.js';
import { levelForScore } from './levels.js';

// ---- Levels, speed and limits (Helicopter mode uses its own distances) ------

// Distance (world units) covered by one level.
export function heliLevelLength(cfg) {
  return cfg.levelLength / cfg.heliScorePerUnit;
}

export function heliLevelStart(absIndex, cfg) {
  return absIndex * heliLevelLength(cfg);
}

// Level info (absIndex, listIndex, lap, level) at distance x.
export function heliLevelAt(x, cfg, levels, out = {}) {
  return levelForScore(Math.max(0, x) * cfg.heliScorePerUnit, cfg, levels, out);
}

// Forward speed at the start of a level.
export function heliBaseSpeed(info, cfg) {
  return cfg.heliSpeed +
    cfg.heliSpeedPerLevel * info.absIndex +
    cfg.heliLapSpeedBonus * (info.lap - 1) +
    ((info.level.heli && info.level.heli.speedBonus) || 0);
}

// The fastest you can ever be going in that level: its start speed plus the
// in-level ramp for the whole level (the level can't take longer than its
// length divided by its start speed).
export function heliTopSpeed(info, cfg) {
  const base = heliBaseSpeed(info, cfg);
  return base + cfg.heliSpeedRampPerSecond * (heliLevelLength(cfg) / base) + 0.01;
}

// Steepest slope and sharpest bend the open path may have at this top speed.
export function pathLimits(topSpeed, cfg, out = {}) {
  out.slope = (cfg.caveSlopeFactor * cfg.heliMaxVSpeed) / topSpeed;
  out.curve = (cfg.caveCurveFactor * (cfg.heliLift - cfg.heliGravity)) / (topSpeed * topSpeed);
  return out;
}

// True inside the obstacle-free stretch around a level change.
export function heliInBreather(x, cfg) {
  const len = heliLevelLength(cfg);
  const k = Math.round(x / len);
  if (k < 1) return false;
  const b = k * len;
  return x >= b - cfg.heliBreatherBefore && x < b + cfg.heliBreatherAfter;
}

// The cave pattern used at distance x (for "mixed" levels, the current part).
export function heliPieceAt(x, cfg, levels, info = {}) {
  heliLevelAt(x, cfg, levels, info);
  const h = info.level.heli;
  if (h.type !== 'mixed') return h;
  const into = x - heliLevelStart(info.absIndex, cfg);
  const k = Math.max(0, Math.floor(into / h.segmentLength)) % h.sequence.length;
  return h.sequence[k];
}

// ---- The spawner -------------------------------------------------------------

const LEAD_IN = 24;      // obstacle-free, straight stretch at the start of a run
const WALL_MARGIN = 0.3; // corridor edges stay at least this far inside the walls
const EDGE = 0.5;        // walls stay this far inside the top/bottom of the world
const LOOKAHEAD = 40;    // path limits look this far ahead (speed rises at level changes)

export function createCaveSpawner(config, levels, seed = 1) {
  const sp = {
    config,
    levels,
    columns: [],   // { x0, x1, top, bottom, p0, p1, lo, hi }
    obstacles: [], // { kind: 'block'|'spike'|'gate', x, w, y0, y1, ... }
    gems: [],      // { x, y, r, taken }
    random: makeRandom(seed),
    record: null,  // tests: set to { columns: [], obstacles: [], gems: [] } to keep everything
    ahead: config.heliViewAhead * 1.5, // build the cave this far ahead of the helicopter
    behind: 16,                        // keep this much behind it
    info: {},
    info2: {},
    lim: {},
    lim2: {},
  };
  resetCaveSpawner(sp, seed, 0, config.heliWorldHeight / 2);
  return sp;
}

// Start a new cave at distance startX, with the path at height startY.
export function resetCaveSpawner(sp, seed, startX, startY) {
  const cfg = sp.config;
  sp.random = makeRandom(seed);
  sp.columns.length = 0;
  sp.obstacles.length = 0;
  sp.gems.length = 0;
  sp.startX = startX;
  sp.leadEnd = startX + LEAD_IN;
  const x0 = Math.floor((startX - sp.behind) / cfg.caveStep) * cfg.caveStep;
  sp.x = x0;              // left edge of the next column to build
  sp.p = startY;          // open path height at sp.x
  sp.s = 0;               // open path slope
  sp.m = startY;          // cave middle line
  sp.mv = 0;              // cave middle line slope
  sp.mTarget = startY;
  sp.off = 0;             // where the path aims, relative to the cave middle
  sp.offUntil = sp.leadEnd;
  const piece = heliPieceAt(Math.max(startX, x0), cfg, sp.levels, sp.info);
  sp.O = piece.opening;
  sp.nC = 0;
  sp.nF = 0;
  sp.nextBlock = sp.leadEnd + 6;
  sp.nextGate = sp.leadEnd + 6;
  sp.nextGem = sp.leadEnd + cfg.heliGemSpacing / 2;
  sp.planned = 0;         // x of the obstacle the path is already swinging for
  sp.gateSide = sp.random() < 0.5 ? 1 : -1;
  sp.spikeTop = -1e9;
  sp.spikeBottom = -1e9;
  sp.pending = [];
  sp.removed = 0;
  updateCaveSpawner(sp, startX);
  return sp;
}

// Build columns up to `ahead` beyond the helicopter and drop ones far behind.
export function updateCaveSpawner(sp, distance) {
  const target = distance + sp.ahead;
  while (sp.x < target) buildColumn(sp);
  const cut = distance - sp.behind;
  let n = 0;
  while (n < sp.columns.length && sp.columns[n].x1 < cut) n++;
  if (n) sp.columns.splice(0, n);
  filterInPlace(sp.obstacles, (o) => o.x + o.w >= cut);
  filterInPlace(sp.gems, (g) => g.x + g.r >= cut);
}

function filterInPlace(list, keep) {
  let w = 0;
  for (let i = 0; i < list.length; i++) if (keep(list[i])) list[w++] = list[i];
  list.length = w;
}

const between = (r, a, b) => a + r() * (b - a);

// Ease v toward `target` with a braking controller: speed (slope) at most
// `sMax`, change of slope at most `cMax` per unit. Returns the new slope.
// When slowing down, the slope may change by up to `cHard` per unit (the full
// fairness limit), so a path that was winding hard can always settle in time.
function steer(pos, slope, target, sMax, cMax, dx, cHard = cMax) {
  const d = target - pos;
  const want = Math.sign(d) * Math.min(sMax, Math.sqrt(2 * cMax * Math.abs(d)) * 0.9);
  const diff = want - slope;
  const slowing = Math.abs(want) < Math.abs(slope) || Math.sign(want) !== Math.sign(slope);
  const step = (slowing ? cHard : cMax) * dx;
  return slope + (Math.abs(diff) <= step ? diff : Math.sign(diff) * step);
}

function buildColumn(sp) {
  const cfg = sp.config;
  const r = sp.random;
  const dx = cfg.caveStep;
  const H = cfg.heliWorldHeight;
  const g = cfg.heliMinGap;
  const x0 = sp.x;
  const x1 = x0 + dx;
  const piece = heliPieceAt(Math.max(x0, 0), cfg, sp.levels, sp.info);
  const levelIndex = sp.info.absIndex;

  // Path limits for the fastest speed you can have here (and just ahead).
  const topSpeed = Math.max(heliTopSpeed(sp.info, cfg),
    heliTopSpeed(heliLevelAt(x0 + LOOKAHEAD, cfg, sp.levels, sp.info2), cfg));
  pathLimits(topSpeed, cfg, sp.lim);
  const wander = Math.max(0.2, Math.min(1, piece.wander));
  const sLim = sp.lim.slope * wander;
  const cLim = sp.lim.curve * wander;

  // Cave opening: eases toward the pattern's, and opens up around level changes.
  const len = heliLevelLength(cfg);
  const kNear = Math.round(x0 / len);
  let openTarget = piece.opening;
  const nearBoundary = kNear >= 1 && x0 >= kNear * len - cfg.heliBreatherBefore - 14 &&
    x0 < kNear * len + cfg.heliBreatherAfter;
  if (nearBoundary) {
    const nextPiece = heliPieceAt(kNear * len + 0.01, cfg, sp.levels, sp.info2);
    openTarget = Math.max(openTarget, nextPiece.opening + 2);
  }
  sp.O += Math.max(-0.35 * dx, Math.min(0.35 * dx, openTarget - sp.O));
  const O = sp.O;

  // How far the path may sit from the cave middle and stay inside the walls.
  const ext = sLim * dx;
  const maxOff = Math.max(0, O / 2 - g / 2 - WALL_MARGIN - ext - 0.1);
  const pMin = EDGE + WALL_MARGIN + g / 2 + ext + 0.3;
  const pMax = H - pMin;
  const mMin = EDGE + 0.1 + O / 2;
  const mMax = H - mMin;

  const quiet = x0 < sp.leadEnd || heliInBreather(x0, cfg) || heliInBreather(x1, cfg);
  const type = x0 < sp.leadEnd ? 'lead' : piece.type;

  // ---- 1. The open path ----
  // Plan ahead for gates and blocks: swing the path toward one wall so the
  // obstacle fits on the other side.
  const spacing = type === 'cave' ? piece.blockSpacing : type === 'gates' ? piece.spacing : 20;
  const planDist = Math.min(spacing * 0.8, Math.max(6, Math.min(20, 2.5 / sLim)));
  if (type === 'cave' && sp.nextBlock - x0 <= planDist && sp.planned !== sp.nextBlock) {
    sp.planned = sp.nextBlock;
    const side = r() < 0.5 ? 1 : -1;
    sp.off = side * maxOff * between(r, 0.75, 1);
    sp.offUntil = sp.nextBlock + 3;
  } else if (type === 'gates' && sp.nextGate - x0 <= planDist && sp.planned !== sp.nextGate) {
    sp.planned = sp.nextGate;
    sp.gateSide = -sp.gateSide;
    sp.off = sp.gateSide * maxOff * between(r, 0.4, 0.95);
    sp.offUntil = sp.nextGate + 2;
  } else if (x0 >= sp.offUntil) {
    if (type === 'lead') sp.off = 0;
    else if (type === 'snake') sp.off = between(r, -1, 1) * maxOff;
    else sp.off = between(r, -1, 1) * maxOff * wander;
    sp.offUntil = x0 + between(r, 6, 18);
  }
  if (Math.abs(sp.off) > maxOff) sp.off = Math.sign(sp.off) * maxOff;

  // The cave middle line wanders on its own, more slowly than the path can.
  const mFactor = type === 'snake' ? 0.85 : 0.5;
  if (type === 'lead') sp.mTarget = sp.p;
  else if (Math.abs(sp.mTarget - sp.m) < 0.3) {
    const reach = type === 'snake' ? (mMax - mMin) : (mMax - mMin) * wander;
    sp.mTarget = Math.max(mMin, Math.min(mMax, sp.m + between(r, -1, 1) * Math.max(1.5, reach)));
  }
  sp.mTarget = Math.max(mMin, Math.min(mMax, sp.mTarget));
  sp.mv = steer(sp.m, sp.mv, sp.mTarget, sLim * mFactor, cLim * mFactor, dx);
  let m = sp.m + sp.mv * dx;

  const pTarget = Math.max(pMin, Math.min(pMax, m + sp.off));
  const s = steer(sp.p, sp.s, type === 'lead' ? sp.p : pTarget, sLim, cLim, dx, sp.lim.curve);
  const p0 = sp.p;
  const p1 = p0 + s * dx;
  sp.s = s;
  sp.p = p1;

  // The cave follows the path loosely: keep the path inside the cave.
  const mid = (p0 + p1) / 2;
  const mClamped = Math.max(mMin, Math.min(mMax, Math.max(mid - maxOff, Math.min(mid + maxOff, m))));
  if (mClamped !== m) sp.mv = Math.max(-sLim, Math.min(sLim, (mClamped - sp.m) / dx));
  m = mClamped;
  sp.m = m;

  // ---- 2. Walls ----
  const lo = Math.min(p0, p1) - g / 2;
  const hi = Math.max(p0, p1) + g / 2;
  const rough = piece.roughness || 0;
  sp.nC = 0.5 * sp.nC + 0.5 * (r() * 2 - 1);
  sp.nF = 0.5 * sp.nF + 0.5 * (r() * 2 - 1);
  let top = m + O / 2 + rough * sp.nC;
  let bottom = m - O / 2 - rough * sp.nF;
  // Walls stay on screen, but never cut into the corridor.
  top = Math.max(Math.min(top, H - EDGE), hi + WALL_MARGIN);
  bottom = Math.min(Math.max(bottom, EDGE), lo - WALL_MARGIN);
  const col = { x0, x1, top, bottom, p0, p1, lo, hi, level: levelIndex };
  sp.columns.push(col);
  if (sp.record) sp.record.columns.push(col);
  sp.x = x1;

  // ---- 3. Obstacles and gems ----
  if (!quiet) {
    if (type === 'cave' && x0 >= sp.nextBlock - dx) {
      sp.pending.push({ kind: 'block', x: sp.nextBlock, w: between(r, 1.3, 1.9),
        h: between(r, piece.blockMin, piece.blockMax), min: piece.blockMin, side: sp.off >= 0 ? 1 : -1 });
      sp.nextBlock += piece.blockSpacing * between(r, 0.85, 1.15);
    } else if (type === 'gates' && x0 >= sp.nextGate - dx) {
      const gx = Math.max(x0, Math.floor(sp.nextGate / dx) * dx) + dx * 0.05;
      sp.pending.push({ kind: 'gate', x: gx, w: Math.min(0.9, dx * 0.9), window: piece.window });
      sp.nextGate += piece.spacing;
    } else if (type === 'spikes' && r() < piece.spikeChance) {
      const roomTop = top - hi;
      const roomBottom = lo - bottom;
      let dir = roomTop > roomBottom ? -1 : 1; // -1 hangs from the ceiling, 1 rises from the floor
      if (r() < 0.3) dir = -dir;
      const last = dir < 0 ? sp.spikeTop : sp.spikeBottom;
      if (x0 - last >= 2 * dx) {
        const w = dx * 1.3;
        sp.pending.push({ kind: 'spike', x: x0 + dx / 2 - w / 2, w, dir, anchor: col,
          len: between(r, piece.spikeMin, piece.spikeMax), min: piece.spikeMin });
        if (dir < 0) sp.spikeTop = x0; else sp.spikeBottom = x0;
      }
    }
  }
  // Keep blocks and gates from piling up across a breather or pattern change.
  if (type !== 'cave' && sp.nextBlock < x1) sp.nextBlock = x1 + 4;
  if (type !== 'gates' && sp.nextGate < x1) sp.nextGate = x1 + 4;

  if (x0 >= sp.leadEnd && sp.nextGem >= x0 && sp.nextGem < x1) {
    const t = (sp.nextGem - x0) / dx;
    sp.pending.push({ kind: 'gem', x: sp.nextGem, w: 0, y: p0 + (p1 - p0) * t });
    sp.nextGem += cfg.heliGemSpacing;
  } else if (sp.nextGem < x0) {
    sp.nextGem = x0 + cfg.heliGemSpacing;
  }

  placePending(sp);
}

// Columns overlapping [a, b): the lowest ceiling, highest floor, and the
// corridor's highest top and lowest bottom among them. Null if not built yet.
function span(sp, a, b, out) {
  const cols = sp.columns;
  if (!cols.length) return null;
  const dx = sp.config.caveStep;
  const first = cols[0].x0;
  const i0 = Math.floor((a - first) / dx);
  const i1 = Math.ceil((b - first) / dx) - 1;
  if (i0 < 0 || i1 >= cols.length) return null;
  out.minTop = Infinity; out.maxBottom = -Infinity; out.maxHi = -Infinity; out.minLo = Infinity;
  for (let i = i0; i <= Math.max(i0, i1); i++) {
    const c = cols[i];
    if (c.top < out.minTop) out.minTop = c.top;
    if (c.bottom > out.maxBottom) out.maxBottom = c.bottom;
    if (c.hi > out.maxHi) out.maxHi = c.hi;
    if (c.lo < out.minLo) out.minLo = c.lo;
  }
  return out;
}

const SPAN = {};

function placePending(sp) {
  const r = sp.random;
  const H = sp.config.heliWorldHeight;
  let w = 0;
  for (let i = 0; i < sp.pending.length; i++) {
    const q = sp.pending[i];
    const reach = q.kind === 'spike' ? q.x + q.w * 0.85 : q.x + Math.max(q.w, 0.001);
    if (reach > sp.x) { sp.pending[w++] = q; continue; } // wait for the columns
    let o = null;
    if (q.kind === 'gem') {
      o = { x: q.x, y: q.y, r: 0.42, taken: false };
      sp.gems.push(o);
      if (sp.record) sp.record.gems.push(o);
      continue;
    }
    if (q.kind === 'block') {
      const s = span(sp, q.x, q.x + q.w, SPAN);
      if (!s) continue;
      // Free space below and above the corridor.
      const below = s.minLo - s.maxBottom;
      const above = s.minTop - s.maxHi;
      const tryOrder = q.side > 0 ? [-1, 1] : [1, -1]; // path high → block below first
      for (const where of tryOrder) {
        const room = where < 0 ? below : above;
        const h = Math.min(q.h, room);
        if (h < q.min) continue;
        const gap = (room - h) * r() * 0.6; // distance from the corridor edge
        const y1 = where < 0 ? s.minLo - gap : s.maxHi + gap + h;
        o = { kind: 'block', x: q.x, w: q.w, y0: y1 - h, y1 };
        break;
      }
    } else if (q.kind === 'spike') {
      const cw = q.w * 0.7;
      const cx = q.x + (q.w - cw) / 2;
      const s = span(sp, cx, cx + cw, SPAN);
      if (!s) continue;
      const c = q.anchor;
      if (q.dir < 0) {
        const len = Math.min(q.len, c.top - s.maxHi);
        if (len >= q.min) o = { kind: 'spike', dir: -1, x: q.x, w: q.w, cx, cw, y0: c.top - len, y1: H, base: c.top };
      } else {
        const len = Math.min(q.len, s.minLo - c.bottom);
        if (len >= q.min) o = { kind: 'spike', dir: 1, x: q.x, w: q.w, cx, cw, y0: 0, y1: c.bottom + len, base: c.bottom };
      }
    } else if (q.kind === 'gate') {
      const s = span(sp, q.x, q.x + q.w, SPAN);
      if (!s) continue;
      const need = s.maxHi - s.minLo;
      const win = Math.max(q.window, need);
      const lo = s.minLo - (win - need) * r();
      o = { kind: 'gate', x: q.x, w: q.w, y0: 0, y1: H, winLo: lo, winHi: lo + win };
    }
    if (o) {
      sp.obstacles.push(o);
      if (sp.record) sp.record.obstacles.push(o);
    }
  }
  sp.pending.length = w;
}

// ---- Looking things up ----------------------------------------------------------

// Height of the open path's centerline at x (or null if outside the built cave).
export function pathYAt(sp, x) {
  const cols = sp.columns;
  if (!cols.length) return null;
  const dx = sp.config.caveStep;
  let i = Math.floor((x - cols[0].x0) / dx);
  if (i < 0) i = 0;
  if (i >= cols.length) i = cols.length - 1;
  const c = cols[i];
  const t = Math.max(0, Math.min(1, (x - c.x0) / dx));
  return c.p0 + (c.p1 - c.p0) * t;
}

// Collision rectangles of an obstacle, as [x0, x1, y0, y1] lists.
// A gate is two rectangles (above and below its window).
export function obstacleRects(o, out = []) {
  out.length = 0;
  if (o.kind === 'gate') {
    out.push([o.x, o.x + o.w, o.y0, o.winLo], [o.x, o.x + o.w, o.winHi, o.y1]);
  } else if (o.kind === 'spike') {
    out.push([o.cx, o.cx + o.cw, o.y0, o.y1]);
  } else {
    out.push([o.x, o.x + o.w, o.y0, o.y1]);
  }
  return out;
}

const RECTS = [];

// True if the box (centre x, y; half sizes halfW, halfH) touches the cave
// walls or any obstacle. Touching edges exactly is not a hit.
export function caveHit(sp, hb) {
  const cols = sp.columns;
  const a = hb.x - hb.halfW;
  const b = hb.x + hb.halfW;
  const yb = hb.y - hb.halfH;
  const yt = hb.y + hb.halfH;
  if (cols.length) {
    const dx = sp.config.caveStep;
    const i0 = Math.max(0, Math.floor((a - cols[0].x0) / dx));
    for (let i = i0; i < cols.length; i++) {
      const c = cols[i];
      if (c.x0 >= b) break;
      if (c.x1 <= a) continue;
      if (yt > c.top || yb < c.bottom) return true;
    }
  }
  const obs = sp.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (o.x >= b || o.x + o.w <= a) continue;
    obstacleRects(o, RECTS);
    for (const [rx0, rx1, ry0, ry1] of RECTS) {
      if (rx0 < b && rx1 > a && ry0 < yt && ry1 > yb) return true;
    }
  }
  return false;
}
