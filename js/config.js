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
export const APP_VERSION = '1.5.3';

export const CONFIG = {
  // ---- Speed -------------------------------------------------------------
  baseSpeed: 24,            // forward speed at the very start
  speedPerLevel: 2.75,      // added at each new level
  speedRampPerSecond: 0.09, // gentle extra speed while you stay in a level
  lapSpeedBonus: 5,         // extra speed for each lap after the first
  maxFrameTime: 0.05,       // seconds; a phone hiccup can't skip further than this
  boostMultiplier: 1.5,     // holding the boost button makes you this many times faster
  boostEase: 5,             // how quickly boost kicks in and fades (higher = snappier)
  classicSpeedFactor: 1.02, // Classic runs at this multiple of the shared speed; 3D Flight and 3D Heli are not affected

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
  spawnBandHalfWidth: 30,   // Classic cubes appear at least this far to each side (widened to fill the view)
  laneLeash: 10,            // the always-open path stays this close to the ship
  laneSlopeFactor: 0.65,    // how sharply the open path may bend (share of max steering at full boost)
  spawnStep: 4,             // distance between obstacle "rows" the spawner works in

  // ---- Score history ---------------------------------------------------
  historyMax: 100,          // how many past runs to keep on the phone

  // ---- 3D Flight mode -----------------------------------------------------
  // (Everything else, like boost and steering speed, is shared with Classic.)
  flightSpeedFactor: 0.9,     // 3D Flight runs at this share of Classic's speed
  flightShipSpan: 1.2,        // wingspan of the jet
  flightShipLength: 1.6,
  flightShipHeight: 0.36,
  flightHitboxScale: 0.7,     // jet hitbox is smaller than the drawing (fair near-misses)
  flightMinAltitude: 0.6,     // lowest you can fly
  flightMaxAltitude: 12,      // highest you can fly (the ceiling)
  flightStartAltitude: 4,
  climbAccel: 80,             // how quickly up/down speed builds
  maxClimbSpeed: 8,           // up/down speed the course is laid out for (the jet's own top speed is flightMaxClimbSpeed)
  climbFriction: 10,          // how quickly up/down drifting stops when you let go
  flightCameraBack: 3.8,      // camera distance behind the jet
  flightCameraAbove: 1.5,     // camera height above the jet
  flightCameraFollow: 6,      // how tightly the camera follows climbs and dives
  flightHorizonRatio: 0.42,
  flightRollDeg: 40,          // how far the jet banks when turning
  flightPitchDeg: 16,         // how far the nose tips up/down when climbing/diving
  flightBandHalfWidth: 22,    // obstacles appear this far to each side
  flightLaneLeashY: 3,        // the always-open path stays this close to your height
  minGapHeight: 2.0,          // smallest opening height ever allowed (like minGapWidth)
  ringBonus: 25,              // points for flying through a ring
  ringSize: 3.2,              // width/height of a ring's opening
  joystickRadiusPx: 70,       // drag this far from where you touched = full steering (3D Heli's cyclic)

  // ---- 3D Flight controls ---------------------------------------------------
  // 3D Flight has its own, snappier control values (Classic and 3D Heli keep
  // theirs). The course is still laid out with maxSteerSpeed and
  // maxClimbSpeed, so the jet has spare agility and fairness only gets easier.
  flightSteerAccel: 90,       // how quickly sideways speed builds up
  flightMaxSteerSpeed: 13,    // top sideways speed
  flightSteerFriction: 10,    // how quickly sideways drifting stops when you let go
  flightMaxClimbSpeed: 10,    // top up/down speed
  flightReverseBoost: 2.2,    // extra pull when steering against your movement (reversing) or easing off the same way (braking)
  flightJoystickRadiusPx: 55, // drag this far from where you touched = full steering in 3D Flight

  // ---- 3D Flight shooting ---------------------------------------------------
  fireRate: 6,                // shots per second (auto-fire)
  bulletSpeed: 75,            // how much faster than the jet a shot flies
  bulletRange: 70,            // how far a shot travels before fading out
  aimAssistCone: 0.07,        // how generously shots lock on to a target (0 = no help)
  targetSpacing: 32,          // distance between targets (a level can override this)
  targetSize: 1.4,
  bigTargetSize: 2.3,
  bigTargetChance: 0.25,      // share of targets that are big armored ones
  bigTargetHits: 3,           // shots needed to destroy a big target
  targetPoints: 50,
  bigTargetPoints: 150,
  targetDrift: 1.6,           // how far moving targets sway side to side

  // ---- Helicopter mode -----------------------------------------------------
  // A side view: the helicopter flies right through a cave. Hold anywhere to
  // rise, let go to drop. Heights and distances are in the same world units.
  heliSpeed: 9,               // forward speed at the start
  heliSpeedPerLevel: 0.8,     // added at each new level
  heliSpeedRampPerSecond: 0.03, // gentle extra speed while you stay in a level
  heliLapSpeedBonus: 2,       // extra speed for each lap after the first
  heliGravity: 22,            // how fast you drop when you let go
  heliLift: 44,               // upward push while holding (net climb = lift − gravity)
  heliMaxVSpeed: 8,           // top up/down speed
  heliPitchDeg: 10,           // how far the nose tips when climbing/falling
  heliWidth: 2.0,             // helicopter size (body + skids, not the rotor)
  heliHeight: 0.9,
  heliHitboxScale: 0.75,      // hitbox is smaller than the drawing (fair near-misses)
  heliMinGap: 3.0,            // narrowest opening ever allowed (fairness)
  heliWorldHeight: 16,        // full cave height shown on screen
  heliViewAhead: 26,          // you always see at least this far ahead
  heliScreenX: 0.22,          // where the helicopter sits, as a share of the screen from the left
  caveStep: 1,                // width of one cave column
  caveSlopeFactor: 0.5,       // how steep the open path may get (share of the top climb speed)
  caveCurveFactor: 0.5,       // how sharply the path may bend (share of the climb force)
  heliScorePerUnit: 1.3,      // points per unit of distance
  heliBreatherBefore: 6,      // obstacle-free distance before a new level starts
  heliBreatherAfter: 20,      // ...and after it starts
  heliGemSpacing: 40,         // distance between gems
  heliGemBonus: 25,           // points for each gem
  heliSmokePerSec: 14,        // exhaust puffs per second

  // ---- 3D Heli mode ----------------------------------------------------------
  // A helicopter on the 3D Flight courses, flown with two thumbs. The LEFT
  // thumb is the collective (a lift lever that stays where you leave it); the
  // RIGHT thumb is the cyclic (push forward to fly, sideways to slide). You
  // choose your own speed; flying faster earns up to ×2 points.
  chopperTopSpeedFactor: 0.7, // top speed as a share of Classic's speed for the level
  chopperForwardAccel: 10,    // how fast pushing forward speeds you up
  chopperBrake: 14,           // how fast pulling back slows you down
  chopperForwardDrag: 0.06,   // how quickly speed fades with the stick centered
  chopperSideAccel: 30,       // how quickly a sideways slide builds up
  chopperMaxSideSpeed: 8,     // top sideways speed
  chopperSideFriction: 4,     // how quickly a slide stops after you let go (low = slidier)
  chopperHover: 0.45,         // lever position that holds your height (0 = bottom, 1 = top)
  chopperMaxClimb: 8,         // top climb speed (lever all the way up)
  chopperMaxSink: 7,          // top descent speed (lever all the way down)
  chopperClimbEase: 3,        // how quickly climbing follows the lever (lower = floatier)
  chopperCrashSink: 4.5,      // touching the ground faster than this is a crash
  collectiveTravelPx: 220,    // thumb travel (pixels) for the full lever range
  chopperPitchDeg: 14,        // how far the nose dips/lifts when speeding up/slowing (look only)
  chopperRollDeg: 22,         // how far it banks when sliding sideways (look only)
  chopperLength: 2.2,         // helicopter size: nose to tail
  chopperBodyWidth: 0.7,
  chopperBodyHeight: 0.9,
  chopperRotorDiameter: 2.2,  // main rotor size (it counts for crashes!)
  chopperHitboxScale: 0.7,    // hitbox is smaller than the drawing (fair near-misses)
  chopperCameraBack: 5,       // chase camera distance behind the helicopter
  chopperCameraAbove: 2,      // chase camera height above the helicopter
  chopperScorePerUnit: 1,     // points per unit of distance at ×1
  chopperMaxMultiplier: 2,    // score multiplier at top speed (×1 at half speed or slower)
  chopperLevelDistance: 420,  // distance per level (about 25 s at top speed)
  chopperMaxAltitude: 9,      // 3D Heli's ceiling (its own, so 3D Flight's taller sky doesn't change it)

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
//   scatter  — density: cubes per spawn row, per 60 units of width (more = harder)
//   clusters — "islands" of separate cubes. chance: islands per row, per 60 units
//              of width; min/max: cubes per island
//   swing (scatter and clusters, optional) — how far the open path swings away
//              from your line (units, at most laneLeash − 1); bigger = you must
//              steer more. Without it the path just wanders gently.
//   gates    — slalom gates. rowSpacing: distance between gates; gapWidth: size of
//              the opening; wingCubes: fence posts on each side (optional, 5);
//              between: loose cubes per row between gates, per 60 units of width (optional, 0)
//   canyon   — width: corridor width; wallDepth: wall thickness; extra: stray cubes
//              outside, per row and per 60 units of width
//   mixed    — segmentLength: distance per pattern; sequence: list of patterns to cycle
// flight: the obstacles for 3D Flight mode (3D Heli flies the same courses,
//   without drones). type is one of:
//   floaters — floating blocks. density: blocks per row; minSize/maxSize: block size;
//              chopperDensity: blocks per row in 3D Heli (its sky is lower, so fewer)
//   pillars  — towers rising from the ground. chance: per row; minHeight: shortest tower
//   frames   — walls with a window to fly through. spacing: distance between walls
//              (a small spacing makes a tunnel); holeWidth/holeHeight: window size;
//              extent: how far the wall reaches around the window; depth: thickness
//   mixed    — segmentLength and sequence, like Classic
//   ringSpacing (optional): distance between bonus rings (0 = none)
// heli: the cave for Helicopter mode. Every pattern has:
//   opening   — cave height (at least heliMinGap; smaller = harder)
//   wander    — 0–1, how much the open path winds up and down (1 = as much as is fair)
//   roughness — how jagged the cave walls are
//   speedBonus (optional) — extra speed for this level only
// heli.type is one of:
//   cave   — floating rock blocks. blockSpacing: distance between blocks;
//            blockMin/blockMax: block height
//   spikes — rock spikes from the ceiling and floor. spikeChance: chance per
//            column; spikeMin/spikeMax: spike length
//   gates  — walls with a window to fly through. spacing: distance between
//            walls; window: window height (at least heliMinGap)
//   snake  — a narrow, winding tunnel with no obstacles
//   mixed  — segmentLength and sequence, like Classic
// palette: sky, skyHorizon, ground, cube, ship, text, and optional grid.
// effects (optional): glow (true/false), roll { degrees, periodSec },
//   lightning { minGapSec, maxGapSec }.
// speedBonus (optional): extra speed for this level only.
export const LEVELS = [
  {
    name: 'Morning',
    pattern: { type: 'scatter', density: 2.45, swing: 4 },
    flight: { type: 'floaters', density: 2.4, chopperDensity: 1.8, minSize: 1.4, maxSize: 2.6, ringSpacing: 60 },
    heli: { type: 'cave', opening: 9.5, wander: 0.5, roughness: 0.3, blockSpacing: 24, blockMin: 2.5, blockMax: 3.5 },
    palette: {
      sky: '#bcd8ee', skyHorizon: '#f3f7fa', ground: '#f1f1ec', grid: '#e1e2dc',
      cube: '#8d939b', ship: '#d9483b', text: '#26303c',
    },
  },
  {
    name: 'Sunset',
    pattern: { type: 'scatter', density: 3.47, swing: 4 },
    flight: {
      type: 'mixed', segmentLength: 150, ringSpacing: 70,
      sequence: [
        { type: 'floaters', density: 3.6, chopperDensity: 2.7, minSize: 1.4, maxSize: 2.8 },
        { type: 'pillars', chance: 0.9, minHeight: 2 },
      ],
    },
    heli: { type: 'cave', opening: 8.8, wander: 0.7, roughness: 0.4, blockSpacing: 18, blockMin: 3, blockMax: 4.2 },
    palette: {
      sky: '#ee7b5a', skyHorizon: '#fbd2a2', ground: '#e8cd9c', grid: '#d9ba85',
      cube: '#ea6457', ship: '#283a78', text: '#3a1d17',
    },
  },
  {
    name: 'Lagoon',
    pattern: { type: 'clusters', chance: 0.82, min: 3, max: 6, swing: 5 },
    flight: { type: 'pillars', chance: 1, minHeight: 2, ringSpacing: 60 },
    heli: { type: 'spikes', opening: 8.6, wander: 0.6, roughness: 0.3, spikeChance: 0.35, spikeMin: 2, spikeMax: 4 },
    palette: {
      sky: '#86cff2', skyHorizon: '#e0f5fb', ground: '#15837a', grid: '#20958b',
      cube: '#f6fbfb', ship: '#ffd23f', text: '#06323a',
    },
  },
  {
    name: 'Gates',
    pattern: { type: 'gates', rowSpacing: 15, gapWidth: 2.9, wingCubes: 5, between: 1.53 },
    flight: { type: 'frames', spacing: 20, holeWidth: 3.3, holeHeight: 2.75, extent: 7, depth: 1.2, ringSpacing: 66 },
    heli: { type: 'gates', opening: 9, wander: 0.4, roughness: 0.3, spacing: 14, window: 3.6 },
    palette: {
      sky: '#c4b1e6', skyHorizon: '#efe7fa', ground: '#f6efdc', grid: '#e6d9bd',
      cube: '#7a49b4', ship: '#e46f35', text: '#2d1e46',
    },
  },
  {
    name: 'Night',
    pattern: { type: 'scatter', density: 4.9, swing: 5 },
    flight: { type: 'floaters', density: 4.9, chopperDensity: 3.6, minSize: 1.2, maxSize: 2.4, ringSpacing: 60 },
    heli: { type: 'cave', opening: 7.6, wander: 0.8, roughness: 0.4, blockSpacing: 13, blockMin: 3, blockMax: 4.5 },
    palette: {
      sky: '#04050a', skyHorizon: '#131a2a', ground: '#0b0e16', grid: '#173450',
      cube: '#19e2ef', ship: '#ff4fa3', text: '#d8f6ff',
    },
    effects: { glow: true },
  },
  {
    name: 'Canyon',
    pattern: { type: 'canyon', width: 5.0, wallDepth: 6, extra: 1.53 },
    flight: { type: 'frames', spacing: 4, holeWidth: 5.0, holeHeight: 4.0, extent: 4, depth: 4, ringSpacing: 48 },
    heli: { type: 'snake', opening: 5.4, wander: 1, roughness: 0.5 },
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
        { type: 'scatter', density: 3.47, swing: 5 },
        { type: 'gates', rowSpacing: 14.5, gapWidth: 2.9, wingCubes: 5, between: 0.82 },
        { type: 'clusters', chance: 0.82, min: 3, max: 6, swing: 5 },
      ],
    },
    flight: {
      type: 'mixed', segmentLength: 160, ringSpacing: 60,
      sequence: [
        { type: 'floaters', density: 3.9, chopperDensity: 2.9, minSize: 1.4, maxSize: 2.6 },
        { type: 'frames', spacing: 20, holeWidth: 3.3, holeHeight: 2.75, extent: 7, depth: 1.2 },
        { type: 'pillars', chance: 1, minHeight: 2 },
      ],
    },
    heli: {
      type: 'mixed', segmentLength: 120,
      sequence: [
        { type: 'cave', opening: 8, wander: 0.7, roughness: 0.4, blockSpacing: 15, blockMin: 3, blockMax: 4.2 },
        { type: 'gates', opening: 9, wander: 0.4, roughness: 0.3, spacing: 14, window: 3.6 },
        { type: 'spikes', opening: 8.6, wander: 0.6, roughness: 0.3, spikeChance: 0.4, spikeMin: 2, spikeMax: 4 },
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
        { type: 'scatter', density: 4.49, swing: 6 },
        { type: 'canyon', width: 5.0, wallDepth: 6, extra: 1.53 },
        { type: 'gates', rowSpacing: 13.5, gapWidth: 2.7, wingCubes: 6, between: 1.22 },
        { type: 'clusters', chance: 0.92, min: 3, max: 6, swing: 6 },
      ],
    },
    flight: {
      type: 'mixed', segmentLength: 180, ringSpacing: 60,
      sequence: [
        { type: 'floaters', density: 4.9, chopperDensity: 3.6, minSize: 1.2, maxSize: 2.8 },
        { type: 'frames', spacing: 4, holeWidth: 5.0, holeHeight: 4.0, extent: 4, depth: 4 },
        { type: 'frames', spacing: 18, holeWidth: 3.1, holeHeight: 2.65, extent: 7, depth: 1.2 },
        { type: 'pillars', chance: 1, minHeight: 3 },
      ],
    },
    heli: {
      type: 'mixed', segmentLength: 130,
      sequence: [
        { type: 'cave', opening: 7.2, wander: 0.9, roughness: 0.4, blockSpacing: 12, blockMin: 3, blockMax: 4.5 },
        { type: 'snake', opening: 5.2, wander: 1, roughness: 0.5 },
        { type: 'gates', opening: 9, wander: 0.4, roughness: 0.3, spacing: 12, window: 3.4 },
        { type: 'spikes', opening: 8.6, wander: 0.6, roughness: 0.3, spikeChance: 0.45, spikeMin: 2, spikeMax: 4.2 },
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
