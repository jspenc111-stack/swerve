// Swerve — ALL tunable values live in this file.
//
// Want the game faster, slower, easier or harder? Change a number here.
// Want a new level? Copy one entry in LEVELS and change it. Nothing else
// needs to change.
//
// Distances are in "world units". The ship is 0.8 units wide and a cube is
// 1.6 units on each side, so 1 unit is roughly "a bit wider than the ship".
// Speeds are in world units per second. Colors are #rrggbb hex codes.

// Bump this on every change. It names the offline cache and is shown on the
// start screen, so you can tell when an update has arrived on the phone.
export const APP_VERSION = '1.1.0';

export const CONFIG = {
  // ---- Speed -------------------------------------------------------------
  baseSpeed: 22,            // forward speed at the very start
  speedPerLevel: 2.5,       // added at each new level
  speedRampPerSecond: 0.08, // gentle extra speed while you stay in a level
  lapSpeedBonus: 5,         // extra speed for each lap after the first
  maxFrameTime: 0.05,       // seconds; a phone hiccup can't skip further than this
  boostMultiplier: 1.5,     // holding the boost button makes you this many times faster
  boostEase: 5,             // how quickly boost kicks in and fades (higher = snappier)

  // ---- Steering ----------------------------------------------------------
  steerAccel: 55,           // how quickly sideways speed builds up
  maxSteerSpeed: 11,        // top sideways speed
  steerFriction: 7,         // how quickly you stop drifting when you let go
  bankMaxDeg: 6,            // how far the view tilts while steering
  bankEase: 6,              // how quickly the tilt follows (higher = snappier)
  shipLeanDeg: 26,          // how far the ship rolls (dips a wing) into turns
  shipYawFactor: 0.25,      // how much the nose points the way you're sliding (0–1)

  // ---- Ship, cubes and camera --------------------------------------------
  shipWidth: 0.8,
  shipLength: 1.0,
  hitboxScale: 0.8,         // hitbox is a bit smaller than the drawing (fair near-misses)
  cubeSize: 1.6,
  cameraHeight: 2.4,        // how high the camera sits above the ground
  cameraBack: 3,            // how far behind the ship the camera sits
  focalScale: 0.95,         // zoom: bigger = more zoomed in (narrower view)
  horizonRatio: 0.36,       // horizon height, as a share of the screen from the top
  fogStart: 45,             // cubes start fading into the sky beyond this distance
  fogDistance: 110,         // cubes appear (fully faded) at this distance
  maxDevicePixelRatio: 2,   // sharpness cap (higher = crisper but slower)

  // ---- Score and levels --------------------------------------------------
  scorePerUnit: 0.5,        // points per unit of distance
  levelLength: 450,         // points per level (about 30–40 seconds)
  breatherBefore: 10,       // obstacle-free distance before a new level starts
  breatherAfter: 45,        // ...and after it starts
  paletteFadeSec: 1,        // color cross-fade time between levels
  bannerSec: 2.4,           // how long the "Level 4 · Gates" banner shows

  // ---- Fairness (keep these sensible!) -----------------------------------
  minGapWidth: 2.0,         // narrowest gap ever allowed (2.5 × ship width)
  spawnBandHalfWidth: 30,   // cubes appear this far to each side of the ship
  laneLeash: 10,            // the always-open path stays this close to the ship
  laneSlopeFactor: 0.65,    // how sharply the open path may bend (share of max steering at full boost)
  spawnStep: 4,             // distance between obstacle "rows" the spawner works in

  // ---- Score history ---------------------------------------------------
  historyMax: 100,          // how many past runs to keep on the phone

  // ---- Controls ----------------------------------------------------------
  tiltRangeDeg: 18,         // tilting this far = full steering
  tiltDeadZoneDeg: 2.5,     // small tilts are ignored so the ship doesn't drift
  dragRangePx: 80,          // dragging this far from where you touched = full steering

  // ---- Crash and effects -------------------------------------------------
  crashFlashMs: 160,
  crashShakeMs: 250,
  crashShakePx: 12,
  gameOverDelayMs: 600,
  vibrateMs: 60,
};

// ---- Levels ----------------------------------------------------------------
// Played in order, then loop back to the first as "Lap 2" (faster), and so on.
//
// pattern.type is one of: scatter, clusters, gates, canyon, mixed.
//   scatter  — density: cubes per spawn row (more = harder)
//   clusters — "islands" of separate cubes. chance: chance of an island per row;
//              min/max: cubes per island
//   gates    — slalom gates. rowSpacing: distance between gates; gapWidth: size of
//              the opening; wingCubes: fence posts on each side (optional, 5);
//              between: loose cubes per row between gates (optional, 0)
//   canyon   — width: corridor width; wallDepth: wall thickness; extra: stray cubes outside
//   mixed    — segmentLength: distance per pattern; sequence: list of patterns to cycle
// palette: sky, skyHorizon, ground, cube, ship, text, and optional grid.
// effects (optional): glow (true/false), roll { degrees, periodSec },
//   lightning { minGapSec, maxGapSec }.
// speedBonus (optional): extra speed for this level only.
export const LEVELS = [
  {
    name: 'Morning',
    pattern: { type: 'scatter', density: 1.6 },
    palette: {
      sky: '#bcd8ee', skyHorizon: '#f3f7fa', ground: '#f1f1ec', grid: '#e1e2dc',
      cube: '#8d939b', ship: '#d9483b', text: '#26303c',
    },
  },
  {
    name: 'Sunset',
    pattern: { type: 'scatter', density: 2.6 },
    palette: {
      sky: '#ee7b5a', skyHorizon: '#fbd2a2', ground: '#e8cd9c', grid: '#d9ba85',
      cube: '#ea6457', ship: '#283a78', text: '#3a1d17',
    },
  },
  {
    name: 'Lagoon',
    pattern: { type: 'clusters', chance: 0.6, min: 3, max: 5 },
    palette: {
      sky: '#86cff2', skyHorizon: '#e0f5fb', ground: '#15837a', grid: '#20958b',
      cube: '#f6fbfb', ship: '#ffd23f', text: '#06323a',
    },
  },
  {
    name: 'Gates',
    pattern: { type: 'gates', rowSpacing: 18, gapWidth: 3.2, wingCubes: 4, between: 1 },
    palette: {
      sky: '#c4b1e6', skyHorizon: '#efe7fa', ground: '#f6efdc', grid: '#e6d9bd',
      cube: '#7a49b4', ship: '#e46f35', text: '#2d1e46',
    },
  },
  {
    name: 'Night',
    pattern: { type: 'scatter', density: 3.6 },
    palette: {
      sky: '#04050a', skyHorizon: '#131a2a', ground: '#0b0e16', grid: '#173450',
      cube: '#19e2ef', ship: '#ff4fa3', text: '#d8f6ff',
    },
    effects: { glow: true },
  },
  {
    name: 'Canyon',
    pattern: { type: 'canyon', width: 5.5, wallDepth: 6, extra: 0.6 },
    palette: {
      sky: '#d5845a', skyHorizon: '#f2c08d', ground: '#a9562f', grid: '#934625',
      cube: '#6b2d1b', ship: '#f6e8c6', text: '#2a1209',
    },
  },
  {
    name: 'Tilt',
    pattern: {
      type: 'mixed', segmentLength: 160,
      sequence: [
        { type: 'scatter', density: 2.8 },
        { type: 'gates', rowSpacing: 16, gapWidth: 3.2, wingCubes: 5, between: 0.8 },
        { type: 'clusters', chance: 0.6, min: 3, max: 6 },
      ],
    },
    palette: {
      sky: '#a3e3c9', skyHorizon: '#e9faf2', ground: '#fbf4df', grid: '#ece1c3',
      cube: '#ff8a66', ship: '#2b678c', text: '#1b394c',
    },
    effects: { roll: { degrees: 10, periodSec: 7 } },
  },
  {
    name: 'Storm',
    speedBonus: 3,
    pattern: {
      type: 'mixed', segmentLength: 180,
      sequence: [
        { type: 'scatter', density: 3.4 },
        { type: 'canyon', width: 5.5, wallDepth: 6, extra: 0.8 },
        { type: 'gates', rowSpacing: 15, gapWidth: 3.0, wingCubes: 6, between: 1.2 },
        { type: 'clusters', chance: 0.7, min: 3, max: 6 },
      ],
    },
    palette: {
      sky: '#46564d', skyHorizon: '#7b8b7f', ground: '#36433c', grid: '#46544b',
      cube: '#a7b7ab', ship: '#ffd166', text: '#eef3ef',
    },
    effects: { lightning: { minGapSec: 2.5, maxGapSec: 7 } },
  },
];

// Colors for the menus (also used for the app icon background and manifest).
export const UI_COLORS = {
  background: '#141a2a',
  accent: '#ff5a4e',
};
