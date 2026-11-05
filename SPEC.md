# Swerve — Build Spec

> **For Claude Code.** Build everything in this spec in one branch and one pull request, with one commit per build step (see §12). Run the tests after each step. Don't stop to ask questions: make a sensible choice, note it in the PR description, and keep going.
>
> The owner is not a developer. Write the PR description in plain language: what was built, how to try it, and anything they need to do by hand.

---

## 1. What we're building

**Swerve** (working name) is a personal arcade game for one player on an Android phone (Pixel 10). It's in the spirit of the classic browser game where you steer a little arrow across an endless field and swerve around cubes.

- The player steers a small arrow-shaped ship that always moves forward across a flat field toward the horizon.
- Cubes come toward the player. Touching one ends the run.
- The game keeps speeding up. Every level changes the colors and scenery and introduces new obstacle patterns, such as slalom gates and winding canyons.
- The score goes up with distance. The best score is saved on the phone.

There are four modes, chosen on the start screen: **Classic** (described above), **3D Flight** (§4b), where you fly a jet up, down and around 3D obstacles and shoot drones for bonus points, **Helicopter** (§4c), a side-view cave flyer where you hold to rise and let go to drop, and **3D Heli** (§4d), a two-thumb helicopter on the 3D Flight courses.

**It must be an original game.** Don't use the name, logo, art, sounds or text of Cubefield, Cube Runner or any other existing game. Only the general idea (an arrow dodging cubes) is borrowed.

**It will be customized over time.** Every tunable number, color and level definition lives in **one file, `js/config.js`**, so future changes ("make it faster", "add a purple level") are small and safe.

---

## 2. Tech rules (hard requirements)

| Rule | Why |
|---|---|
| Plain HTML, CSS and JavaScript (ES modules). No frameworks, no build step, no npm runtime dependencies. | Simple, fast, nothing to break or update. |
| Draw with **HTML Canvas 2D** and a simple homemade 3D projection (§5). No WebGL or 3D libraries. | Small and easy to tweak. |
| Must work as an installable **PWA** (§9) and play **fully offline** after the first visit. | Feels like a real app on the home screen. |
| Hosted on **GitHub Pages** from the `main` branch root. Use **relative paths everywhere** (`./js/main.js`, never `/js/main.js`), because the site lives at `https://<user>.github.io/swerve/`. | Absolute paths break on GitHub Pages subfolders. |
| No network calls at runtime other than loading the app's own files. No external fonts, CDNs, analytics or trackers. | Privacy (§10) and offline play. |
| Game logic modules (`game.js`, `flight.js`, `heli.js`, `chopper.js`, `levels.js`, `collision.js`, `spawner.js`, `flightSpawner.js`, `caveSpawner.js`) must not touch the DOM or canvas, so they can be unit tested in Node. | Testability. |
| Tests use Node's built-in test runner: `node --test`. No test libraries. | No dependencies. |

---

## 3. File structure

```
/
├── index.html              # single page, canvas + overlay screens
├── styles.css
├── manifest.webmanifest
├── sw.js                   # service worker (offline + updates)
├── icons/                  # icon-192.png, icon-512.png, icon-maskable-512.png, icon.svg
├── js/
│   ├── config.js           # ALL tunable values + level definitions + APP_VERSION
│   ├── main.js             # boot, game loop, screen switching (runs all four modes)
│   ├── game.js             # Classic game state: player, speed, score, level progression (pure logic)
│   ├── flight.js           # 3D Flight game state: jet, climbing, shooting, drones, rings (pure logic)
│   ├── heli.js             # Helicopter game state: lift/gravity, speed, score, gems, autopilot (pure logic)
│   ├── chopper.js          # 3D Heli game state: collective/cyclic physics, landing, score multiplier, autopilot (pure logic)
│   ├── levels.js           # level lookup, looping, palette blending (pure logic)
│   ├── spawner.js          # Classic obstacle patterns (pure logic, seeded random)
│   ├── flightSpawner.js    # 3D Flight (and 3D Heli) obstacles, bonus rings and drones (pure logic, seeded random)
│   ├── caveSpawner.js      # Helicopter cave: open path, walls, blocks/spikes/gates, gems (pure logic, seeded random)
│   ├── collision.js        # hit detection for both modes (pure logic)
│   ├── render.js           # Classic drawing to canvas
│   ├── render3d.js         # 3D Flight and 3D Heli drawing to canvas (jet, blocks, drones, shots, two-thumb controls)
│   ├── chopperModel.js     # 3D Heli helicopter model, downwash and helipad
│   ├── renderHeli.js       # Helicopter drawing to canvas (side-view cave, helicopter, smoke, gems)
│   ├── input.js            # touch, joystick, tilt, keyboard, Boost button, Helicopter "hold anywhere", 3D Heli two thumbs
│   ├── audio.js            # tiny synthesized sounds (Web Audio, no files)
│   └── storage.js          # localStorage wrapper (best scores, settings, history)
├── tests/                  # node --test files for the pure-logic modules
├── CLAUDE.md
├── SPEC.md
└── README.md               # plain-language: what it is, how to install, how to ask for changes
```

---

## 4. Screens

All screens are HTML overlays on top of the canvas. Use large tap targets (at least 48×48 px) and system fonts.

1. **Start screen**
   - Title "Swerve", a **mode switch** (four buttons in a 2×2 grid, each with a short subtitle: *Classic* "Steer left & right" / *3D Flight* "Fly up, down & around" / *Helicopter* "Hold to fly up" / *3D Heli* "Two-thumb chopper"; remembered), the best score for the selected mode, a big **Play** button and a ⚙︎ settings button.
   - **Level picker**: a grid of all levels (number, name and a small color swatch). Play starts the run at the chosen level, which is remembered. All levels are always available. The menu background shows the chosen level's colors.
   - A short how-to line that matches the mode and controls, e.g. "Hold left or right side to steer. Hold Boost to go faster." (Classic) or "Drag anywhere to fly. Your guns fire by themselves: line up the reticle with drones to blast them." (3D Flight) or "Hold anywhere to fly up. Let go to drop. Turn your phone sideways for the best view." (Helicopter) or "Left thumb = lift, right thumb = fly. Turn your phone sideways." (3D Heli). In Helicopter and 3D Heli modes the menu background shows the chosen level with the helicopter flying itself. In 3D Heli mode a small **? How to fly** link shows the tips cards again.
   - **History** button (see 6).
   - **Install app** button, shown only when Chrome offers to install. If Chrome never offers within a few seconds and the game isn't running as the installed app, a "Can't install the app?" link opens step-by-step help (see 7).
   - The app version is shown small at the bottom (e.g. `v1.0.3`), so the owner can confirm an update arrived.
2. **Playing**
   - Score at the top center, level name small underneath, a pause ⏸ button in the top corner.
   - A round **Boost** button at the bottom center: hold it to go faster (see §6). It keeps its own touch, so you can steer with one thumb and boost with the other.
   - When a level starts, a banner fades in and out (e.g. "Level 4 · Gates").
3. **Paused**: Resume, Restart and Quit to menu.
4. **Game over**
   - Final score, level reached (and the start level, if not 1) and best score. Show "New best!" with a small celebration when it applies. Otherwise, for a top-10 run, show "Your #3 score out of 27 runs". In 3D Flight it also shows how many drones were destroyed (e.g. "· 4 drones"); in Helicopter mode, how many gems were collected (e.g. "· 3 gems"); in 3D Heli, rings collected and the top multiplier (e.g. "· 5 rings · top ×2.0").
   - **Play again** (big) and **Menu**.
   - Restarting must be instant: one tap, no loading.
5. **Settings**
   - Controls: *Hold sides* (default) / *Tilt phone* / *Drag*, with a note underneath: "Helicopter: hold anywhere to fly up." (these choices don't apply to Helicopter mode).
   - Sound on/off (default on).
   - Vibration on/off (default on).
   - 3D up/down: *Normal* (drag/tilt up = climb) or *Inverted* (like a plane's control stick).
   - 3D auto-fire: On (default) / Off.
   - A note "3D Heli: left thumb = lift (stays put), right thumb = fly." and *3D Heli collective: Left* (default) / *Right* (for left-handed play).
   - "Reset best scores" (all modes), with a confirm step.
6. **History**
   - Every finished run with points: score, level reached (and start level), and date/time ("Today 3:41 PM", "Yesterday …", "Oct 18, …").
   - A *Classic* / *3D Flight* / *Helicopter* / *3D Heli* filter (opens on the selected mode).
   - Two tabs: *Recent* (newest first) and *Top scores* (highest first, numbered). The best score has a ★.
   - Keeps the newest `historyMax` runs (100). "Clear history" with a confirm step (the best score stays).
7. **3D Heli tips**: before the first-ever 3D Heli run, three quick cards ("Left thumb: lift. Slide up to climb. It stays where you leave it." / "Find the HOVER mark to hold your height." / "Right thumb: push forward to fly, sideways to slide. Faster = up to ×2 points."). **Got it** saves `seenChopperTips`.
8. **Install help**: how to install from Chrome, and how to remove a broken leftover copy when Chrome says "already installed" but the app won't open (Play Store → Manage apps → uninstall; or Settings → Apps → Archived/Disabled). Warns not to use Chrome's "Clear site data", which would also wipe other apps on the same web address.

---

## 4b. 3D Flight mode

A second way to play, picked on the start screen. Same levels, names, colors, effects, boost and level picker as Classic, but you fly in three dimensions.

- **Movement**: forward speed is `flightSpeedFactor` × Classic's speed (boost works the same). Sideways steering is as in Classic; up/down uses `climbAccel`, `maxClimbSpeed`, `climbFriction`. Height is limited to `flightMinAltitude`…`flightMaxAltitude`; touching the ground or ceiling just stops you (no crash).
- **Controls**: touch works as a **joystick**: put a thumb anywhere and drag in any direction (a ring shows where). With *Tilt phone* chosen in Settings: tilt sideways to turn, tilt the top toward/away from you to climb/dive. Keyboard: arrows/WASD, Shift boosts. Optional *Inverted* up/down.
- **Camera**: behind and above the jet (`flightCameraBack`, `flightCameraAbove`); follows sideways exactly and up/down with a slight lag. The jet's shadow on the ground shows how high you are; a height meter sits on the right of the screen.
- **The jet**: a low-poly fighter (rounded fuselage, swept wings with colored tips, canards, twin angled tail fins, tail planes, glass canopy), metallic silver tinted by the level's ship color with accent parts in that color. Flat-shaded faces lit from above. It rolls into turns (`flightRollDeg`), pitches when climbing/diving (`flightPitchDeg`), has an afterburner (orange, blue-white when boosting) and navigation lights (red left, green right, white strobe).
- **Obstacles** (`flightSpawner.js`), set per level in `config.js` under `flight`:

  | Type | What it looks like |
  |---|---|
  | `floaters` | Floating blocks of different sizes at every height. |
  | `pillars` | Towers rising from the ground; fly between them or over the short ones. |
  | `frames` | Walls with a window to fly through. The window moves left/right and up/down from wall to wall. A small `spacing` joins the walls into a **tunnel**. |
  | `mixed` | Cycles through a sequence, like Classic. |

- **Shooting**: the jet **auto-fires** (`fireRate` shots a second), alternating guns on each wing, so on a phone you only steer and boost. Shots fly straight ahead (`bulletSpeed`, `bulletRange`) with gentle **aim assist** (`aimAssistCone`): a shot locks on to the nearest drone close to the line of fire. Shots stop at obstacles. An aiming **reticle** sits straight ahead and turns gold when a drone is locked on. *3D auto-fire* can be switched off in Settings.
- **Drones (targets)**: every `targetSpacing` (a level can override it), a drone appears near the open path but never in it. Small pink-red drones take one hit (`targetPoints`, 50); big orange armored ones (`bigTargetChance`) take `bigTargetHits` (3) hits (`bigTargetPoints`, 150) and show health pips. Some drones sway side to side (`targetDrift`). Drones are **solid**: flying into one is a crash. Destroying one gives sparks, a floating "+50", an explosion sound and a tiny buzz.
- **Fairness with drones**: a drone is only placed if its whole sway stays out of the open lane and away from blocks; a block placed later removes an overlapping drone (walls stay whole). The 3D fairness tests count drones as solid boxes covering their sway.
- **Bonus rings**: glowing gold frames every `ringSpacing`, always placed in the open path. Flying through one adds `ringBonus` points with a chime and a "+25" pop-up. Rings aren't solid.
- **Fairness** (tested): an open lane at least `minGapWidth` wide and `minGapHeight` tall always exists, bending no more sharply (sideways or up/down) than the jet can follow at full boost. A test sweeps a grid of reachable (sideways, height) positions through generated obstacles for every layout, and checks every ring can be flown through.
- **Collision**: the jet's hitbox (`flightHitboxScale` of its size) against each block's box, overlapping in all three directions.
- **Scores**: separate best score/level for 3D Flight; runs are saved in the same history, tagged with their mode.

---

## 4c. Helicopter mode

A third way to play (added in v1.4.0; full details in `specs/CHANGE-SPEC-v1.4.md`). A **side view** of a small helicopter flying right through an endless cave. Same 8 levels (names, colors, effects, level picker, laps), each with its own cave layout under `heli` in `config.js`.

- **Controls**: **hold anywhere** to rise, **let go** to drop (mouse, Space, ↑ or W work too). The pause button, P or Esc pause. No boost (the Boost button is hidden); the Hold sides / Tilt / Drag settings don't apply.
- **Start**: the helicopter hovers with a pulsing "Hold to fly" prompt; nothing moves until the first touch.
- **Physics** (`heli.js`, y up): `vy += (holding ? heliLift − heliGravity : −heliGravity) × dt`, clamped to ±`heliMaxVSpeed`; frame time capped by `maxFrameTime`. The nose pitches with `vy`, up to `heliPitchDeg`.
- **Speed**: starts at `heliSpeed`, plus `heliSpeedPerLevel` per level, `heliSpeedRampPerSecond` within a level, `heliLapSpeedBonus` per lap, and an optional per-level `heli.speedBonus`.
- **Screen**: best played sideways. A run asks the phone to turn to landscape (`screen.orientation.lock('landscape')`, works in the installed app; failure is ignored); the menu goes back to portrait. If the phone is still upright, a hint shows for 3 seconds: "Turn your phone sideways for a bigger view". Turning the phone mid-run resizes and auto-pauses. Pause, Game over and other overlays use a compact layout on short (landscape) screens.
- **Camera**: the helicopter sits at `heliScreenX` (22%) from the left; scale = `min(width / (heliViewAhead / (1 − heliScreenX)), height / heliWorldHeight)`, so at least `heliViewAhead` units ahead and the whole cave height are always visible. In portrait the cave is a band across the middle and the space above/below is filled with rock. No up/down camera movement.
- **The cave** (`caveSpawner.js`), built in columns `caveStep` wide:
  1. The **open path** first: a wandering centerline with a clear corridor at least `heliMinGap` tall. `wander` (0–1) sets how much of the fairness limit it uses.
  2. The **walls**: a smooth cave middle line, `opening` tall, that loosely follows the path; the corridor stays at least 0.3 inside the walls, so the path can swing toward one wall to leave room for an obstacle on the other side. Wall roughness (`roughness`) never cuts into the corridor, and both walls stay on screen.
  3. **Obstacles**, which fill the space between corridor and wall and never enter the corridor (cut shorter to fit, skipped if that makes them shorter than their minimum):

  | Pattern | What it looks like |
  |---|---|
  | `cave` | Floating rock blocks every `blockSpacing`, `blockMin`–`blockMax` tall; the path goes above or below each. |
  | `spikes` | Rock spikes hanging from the ceiling and rising from the floor (`spikeChance` per column, `spikeMin`–`spikeMax` long). |
  | `gates` | Full-height walls every `spacing` with one window `window` tall that moves up and down from gate to gate (if the path is sloping, the window is widened just enough to fit it). |
  | `snake` | A narrow, tightly winding tunnel with no obstacles. |
  | `mixed` | Cycles through a `sequence` every `segmentLength`. |

  - **Gems** every `heliGemSpacing`, always on the open path: +`heliGemBonus` points, a chime, sparkle and floating "+25". Not solid.
  - **Breathers**: around a level change the cave opens to at least the next level's `opening` + 2 with no obstacles (`heliBreatherBefore` / `heliBreatherAfter`), then the banner shows and colors cross-fade.
  - New columns appear beyond the right edge of the screen; anything off the left edge is removed.
- **Collision**: the hitbox is the body and skids (`heliWidth` × `heliHeight` × `heliHitboxScale`); the rotor blades don't count. Spikes collide as a strip 70% of their drawn width. Touching a column's ceiling or floor, a block, spike or gate wall is a crash (burst of bits in the ship color and orange, smoke, flash, shake, crash sound and buzz, game over after `gameOverDelayMs`).
- **Score**: distance × `heliScorePerUnit` + gems × `heliGemBonus`. The level comes from distance (the shared `levelLength` in points), about 30–40 seconds per level. Separate best score/level; runs saved in the history as `mode: 'heli'`.
- **Fairness** (tested): the path's slope never exceeds `caveSlopeFactor × heliMaxVSpeed ÷ topSpeed`, and its bend never exceeds `caveCurveFactor × (heliLift − heliGravity) ÷ topSpeed²`, where `topSpeed` is the fastest you can be going there (level + lap + full in-level ramp). The path limits look 40 units ahead so they tighten before a faster level starts.
- **Autopilot** (`heli.js`): a pure function that decides "hold or not" from height, vertical speed and the path about 0.35 seconds ahead. It flies the menu preview and the fairness tests.
- **Look** (`renderHeli.js`): cave air as a vertical gradient (`sky` → `skyHorizon` → `sky`), two parallax layers of distant rock in the `grid` color drifting at 0.2× and 0.45×; walls in `ground` with a darker rim and a soft highlight; obstacles in `cube`, lit from the upper left; an original helicopter design (rounded body in the `ship` color, glass bubble cockpit, tapering tail boom with fin, spinning tail rotor, two skids, a main rotor that stretches and shrinks to fake spinning with a motion-blur ellipse) that tilts with pitch and puffs grey exhaust smoke (`heliSmokePerSec`, more while holding). Night glows faintly, Storm flashes, Tilt tilts the view by half the level's roll.

---

## 4d. 3D Heli mode

A fourth way to play (added in v1.5.0; full details in `specs/CHANGE-SPEC-v1.5.md`). A helicopter flies the **3D Flight courses** with **two thumbs**, like a real one. Its id in code is `chopper` (so it isn't confused with the cave mode `heli`). Same 8 levels, colors, effects, level picker and laps, using each level's `flight` obstacles, but **no drones and no shooting**.

- **Controls** (`input.js`, pure functions tested in Node): the left 40% of the screen is the **collective zone**, the right 60% the **cyclic zone** (swapped with *3D Heli collective: Right*). Each touch keeps the role of the zone it started in until it lifts.
  - **Collective (lift lever)**: a tall slider near the edge (about 60% of the screen height) with a handle and a **HOVER** mark. Dragging is relative: moving the thumb up by `collectiveTravelPx` moves the lever its full range (0 bottom … 1 top). It **stays where you leave it**. Crossing the hover mark gives an 8 ms buzz (if vibration is on).
  - **Cyclic (stick)**: a floating joystick where the thumb lands (3D Flight's ring and `joystickRadiusPx`): push forward to speed up, pull back to brake, sideways to slide. It eases back to the middle when released. A faint ring shows where it goes when no thumb is on it.
  - **Keyboard**: W/S move the lever (it stays put), arrows work the cyclic, P or Esc pause. The tilt, drag and inverted settings don't apply.
- **Physics** (`chopper.js`):
  - **Lift**: above `chopperHover` the target vertical speed rises toward +`chopperMaxClimb`; below it, toward −`chopperMaxSink`, in proportion to the lever's distance from hover. The real vertical speed eases toward the target (`chopperClimbEase`), so it feels floaty and heavy. The ceiling (`flightMaxAltitude`) just stops the climb.
  - **Forward**: pushing forward adds `stickY × chopperForwardAccel`, pulling back brakes at `chopperBrake`, a centered stick lets speed fade slowly (`chopperForwardDrag`). Speed stays between 0 and the level's **top speed** = `chopperTopSpeedFactor` × Classic's level speed (with laps and `speedBonus`; no in-level ramp). No flying backwards.
  - **Sideways**: `chopperSideAccel` up to `chopperMaxSideSpeed`, with low friction (`chopperSideFriction`), so it slides a little.
  - **Ground**: the body's centre sits at `flightMinAltitude` on the ground. Touching down slower than `chopperCrashSink` is a landing (soft thump); on the ground you slow to a stop and can't fly forward. Faster is a crash ("Hard landing!").
  - **Start**: on a **helipad** with the lever at 0 and the rotor idling; nothing is in the way for the first stretch. Raise the lever past hover to lift off, then push forward.
- **Course**: `flightSpawner.js` with a **chopper version of the settings** (`chopperConfig`): the helicopter's `chopperMaxSideSpeed` as the steering speed, the smaller of max climb and max sink as the climb speed, `chopperLevelDistance` as the level length, and the open path laid out for the top speed of the level you'll be in when you get there. The spawner's `drones: false` option turns drones off; `recordPath: true` keeps the open path's centre line for the autopilot. 3D Flight uses neither and is unchanged.
- **Score**: distance × `chopperScorePerUnit` × **multiplier**, plus `ringBonus` per ring. The multiplier is ×1 at or below half of top speed, rising in a straight line to ×`chopperMaxMultiplier` (2) at top speed. A new level starts every `chopperLevelDistance` units of distance, so the multiplier never skips levels.
- **Collision**: a crash if the **body box** (`chopperLength` × `chopperBodyWidth` × `chopperBodyHeight`, scaled by `chopperHitboxScale`) **or the rotor disc** (a thin flat box `chopperRotorDiameter` × `chopperHitboxScale` wide on top of the body) touches any block, pillar, wall or tunnel. A **rotor strike** counts ("Rotor strike!"). Rings aren't solid.
- **Look** (`chopperModel.js`, flat-shaded low-poly like the jet, original design): a rounded pod fuselage, metallic and tinted by the level's `ship` color, with a big wraparound glass canopy and a belly stripe; a tapering tail boom with a swept fin, a small stabilizer and a spinning tail rotor; two skids on struts; a short mast with a hub and 4 spinning blades (faster with more collective, idling on the ground; a faint see-through disc when fast; the disc tilts with the stick); red light on the left, green on the right, white strobe on the tail. The nose dips when accelerating and lifts when braking (up to `chopperPitchDeg`) and it banks into slides (up to `chopperRollDeg`); this is look only.
- **Effects**: **downwash** (dust and ripples spreading on the ground when lower than about 3 units, stronger with more collective), the shadow (shared with 3D Flight), and a round **helipad** with a yellow ring and an "H". Glow, roll and lightning work as in 3D Flight.
- **Camera**: a chase view behind and above (`chopperCameraBack`, `chopperCameraAbove`); follows sideways exactly, up/down with a slight lag.
- **On-screen display**: score and multiplier at the top center ("1,240 ×1.6", glowing gold at ×2) with the level name and a small speed bar underneath; the altimeter at the top left; pause at the top right; the collective slider and the joystick. None of it sits under the thumbs.
- **Screen**: like Helicopter, a run asks for landscape (still playable upright); turning the phone mid-flight pauses.
- **Autopilot** (`chopper.js`): sets the lever and stick from the state and the open path a moment ahead (it aims at where it will be, so it doesn't cut corners). It flies the menu preview and the fairness tests.
- **Fairness** (tested in `chopper-fairness.test.js`): for every level, laps 1–3 and 20 seeds, the 3D Flight reachable sweep with the chopper settings and its whole hitbox; every ring flyable; the hitbox **including the rotor** is at most 80% of `minGapWidth` wide and `minGapHeight` tall; the autopilot survives 2 minutes at top speed using only the lever and stick (and once with uneven frame times). If the autopilot can't survive, make this mode's course gentler (lower the side/climb speeds used for layout); never shrink gaps, loosen the hitbox or change 3D Flight.
- **Scores**: separate best score/level; runs saved in the history as `mode: 'chopper'`.

---

## 5. How the 3D look works (rendering)

The game fakes 3D on a flat canvas using **perspective projection**: things further away are drawn smaller and closer to the horizon.

- **World coordinates**:
  - `x` runs left/right.
  - `z` is distance ahead; bigger means further away.
  - The ground is the plane `y = 0`.
- **Camera**: sits a little above and behind the ship, and follows the ship's `x`. The ship is always drawn at the horizontal center of the screen. Steering moves the world sideways around it.
- **Projection** for a point (x, y, z), with focal length `f` and horizon at `horizonY` (about 38% down the screen):
  - `screenX = centerX + (x - cameraX) * f / z`
  - `screenY = horizonY + (cameraHeight - y) * f / z`
- **Cubes**:
  - Draw the front face, the top face, and the visible side face (left side if the cube is right of the camera, right side if left).
  - Shade each face from the level palette: the top is lightest, the side darkest.
  - Sort far to near before drawing (the "painter's algorithm", where distant things are painted first so near things cover them).
- **Fog**: cubes fade in from the sky color near the horizon, so they don't pop into existence.
- **Ground**: a solid color with a subtle gradient toward the horizon. Optionally add faint grid lines that scroll toward the player to sell the speed; this is controlled by the level palette.
- **Bank effect**: while steering, tilt the whole view (horizon and field) slightly, by up to about 6°, in the direction of the turn, easing back when released. This is key to the feel.
- **Ship**:
  - A clean arrow or chevron shape near the bottom center.
  - It leans slightly into turns and has a soft shadow on the ground.
  - Its color comes from the level palette and must contrast with the ground.
- **Crash**: a quick white flash, a short screen shake (~250 ms), a crash sound and a 60 ms vibration (if enabled). Show game over after about 600 ms.
- **Sharpness**: scale the canvas by `devicePixelRatio`, capped at 2 for performance, so it's crisp on the Pixel.

---

## 6. Gameplay

All numbers below are **starting values in `config.js`**, not fixed rules.

### Movement
- The ship always moves forward. Forward speed starts at `baseSpeed` and rises:
  - by `speedPerLevel` at each new level, and
  - gently within a level, by `speedRampPerSecond`.
- Steering uses sideways **velocity with acceleration**, not instant jumps, so it feels smooth: `steerAccel`, `maxSteerSpeed` and `steerFriction` (slowdown when you let go).
- **Boost**: while the Boost button (or ↑/W) is held, speed eases up to `boostMultiplier` × normal (1.5×), and eases back when released (`boostEase`). More speed means points come faster. Obstacles are always laid out for full-boost speed, so the open path stays reachable whether or not you boost.
- **Ship banking**: the ship is a small 3D model. Turning rolls it (one wing dips, up to `shipLeanDeg`) and turns the nose slightly toward the slide (`shipYawFactor`), so it still looks like it's flying forward.

### Controls (`input.js`)
- **Hold sides** (default): touching the left half steers left and the right half steers right. Multi-touch uses the most recent touch.
- **Tilt**:
  - Uses the phone's tilt sensor (`deviceorientation` gamma).
  - The neutral position is calibrated when a run starts, with a small dead zone so it doesn't drift.
  - Tilt data is used only in memory, never stored or sent.
- **Drag**: steer toward where your finger is, relative to where it first touched.
- **Keyboard** (for testing on a computer): ← → or A/D steer, ↑ or W boosts, space, P or Esc pause (in Helicopter mode Space lifts instead; in 3D Heli W/S move the lever and the arrows work the cyclic).
- **3D Heli** uses its own two-thumb controls (§4d).

### Score and levels
- The score increases with distance traveled in this run (starting at a later level starts the score at 0). The level depends on how far along the course you are.
- A new level starts every `levelLength` points (aim for about 30–40 seconds per level).
- **Level change**:
  1. Clear a short obstacle-free stretch so the player can breathe.
  2. Show the banner.
  3. Cross-fade the colors over about 1 second.
- After the last level, loop back to level 1 as **"Lap 2"**, faster, and so on.

### Collision (`collision.js`)
- The ship's hitbox is a box at the ship's fixed `z`. It's slightly **smaller than it looks** (`hitboxScale`, about 0.8) so near-misses feel fair.
- A crash happens when the ship's box overlaps any cube's box in both `x` and `z`.

### Fairness (must be guaranteed and tested)
- There must **always** be a path wide enough to get through. Gaps in gates and canyons must be at least `minGapWidth` (about 2.5× the ship width).
- A random scatter never places cubes so tightly that the player can't get through.
- New obstacles appear only beyond the fog distance, never right in front of the player. The one exception is the start of a Classic run: the field is pre-filled before play begins (§7), so those cubes already exist when you start.
- The frame time is capped at 50 ms, so a phone hiccup can't teleport the ship into a cube.
- **No free rides (Classic, since v1.5.1).** Fairness means there is always a way through, not that you can fly straight. With `swing` (§7) the open path keeps moving away from your line, so a pilot who never steers crashes within a few seconds. The `free-ride` test (§11) keeps it that way.

---

## 7. Levels and obstacle patterns

### Patterns (`spawner.js`)
Every pattern is defined in config and uses a seeded random generator, so tests are repeatable.

| Pattern | What it looks like |
|---|---|
| `scatter` | Randomly placed cubes; how many is set by `density` (cubes per row, per 60 units of width). Optional `swing`. |
| `clusters` | "Islands": small groups of 3–6 separate cubes (with a little room between them, never one solid clump) and open ground between groups. `chance` = islands per row, per 60 units of width. Optional `swing`. |
| `gates` | Slalom gates: an opening flanked by a short fence of spaced posts on each side (`wingCubes`, too close together to squeeze between). The opening swings left and right from gate to gate. Optional loose cubes between gates (`between`). |
| `canyon` | Two walls of cubes forming a winding corridor. The path curves using smooth random turns. |
| `mixed` | Alternates between the above every few seconds. |

Obstacles spawn in a band around the player's current `x` (the field is effectively endless sideways). Cubes are removed once they're behind the camera or more than band + 20 units off to the side.

**The open path and `swing` (v1.5.1).** The spawner steers an invisible open path (the guaranteed clear strip) ahead of the player. Without `swing` it wanders gently. With `swing` (scatter and clusters only, also inside `mixed`) it keeps moving away from the player's current line:
- The spawner keeps a goal position `goalX` (reset at the start of each run).
- When there's no goal, or the path is within 0.75 units of it, it picks a new goal on the other side of the player's line: `side` = −1 if the path is right of the player, +1 if left, random if level; `goalX = playerX + side × swing × (0.7 + 0.3 × random)`.
- Every row, the path's target slope is `clamp((goalX − pathX) × 0.25, −maxSlope, +maxSlope)`.
- All the fairness limits stay as they were: `maxSlope`, the slope-change limit, the leash and the keep-out area. `swing` must be above 0 and at most `laneLeash − 1`, so the goal is always inside the leash.
- Gates and canyon don't use it (gates already alternate sides).

**The view-sized band (v1.5.1).** Cubes appear across the whole visible field, so the far left and right of the screen are never bare. `main.js` works out how far the camera sees to each side at the fog distance (from the screen width, the focal length and `fogDistance + cameraBack`), multiplies it by 1.15 (for the bank and the Tilt roll), adds one second of full steering (`maxSteerSpeed`), and passes that to the spawner (`setSpawnBand`). `spawnBandHalfWidth` (30) is the minimum, and the band is capped at 160 so a very wide window can't flood the phone. On a portrait phone it comes to about 80. The counts in the level settings (`density`, `chance`, gates `between`, canyon `extra`) are per 60 units of width and scale with the band (the whole number, plus one more with probability equal to the remainder), so the field is just as dense near you whatever the band.

**The pre-filled start (v1.5.1).** When a Classic run starts (and for the menu preview and the debug level jump), the field is filled right away from the end of the level-start breather (`breatherAfter`) out to the fog distance. Only that ~2 s breather stays empty. Mid-run level changes keep their breathers as before.

**Drawing many cubes.** Cubes at or beyond the fog distance are fully faded and skipped; cubes narrower than about 4 px on screen are drawn as one flat rectangle; the Night glow is skipped where it would be too faint to see.

### Starting levels (in `config.js`)

| # | Name | Pattern | Look |
|---|---|---|---|
| 1 | Morning | scatter, light, swing 4 | pale sky, white ground, grey cubes |
| 2 | Sunset | scatter, denser, swing 4 | orange-pink sky, sand ground, coral cubes |
| 3 | Lagoon | clusters, swing 5 | light blue sky, teal ground, white cubes |
| 4 | Gates | gates | lavender sky, cream ground, purple cubes |
| 5 | Night | scatter, dense, swing 5 | near-black sky, dark ground, glowing neon cyan cubes (subtle glow) |
| 6 | Canyon | canyon | warm red-brown, desert palette |
| 7 | Tilt | mixed | the whole view slowly rolls ±10° back and forth (steering is not reversed) |
| 8 | Storm | mixed, fast | grey-green, with occasional brief "lightning" flashes |

Each level entry includes:
- `name`
- `pattern` and pattern settings
- `flight` (3D Flight obstacles, also flown by 3D Heli without drones, §4d) and `heli` (Helicopter cave, §4c)
- a `palette`: `sky`, `skyHorizon`, `ground`, `cube`, `ship`, `grid` (optional) and `text`
- optional `effects`: `roll`, `lightning`, `glow`

Adding a level means adding one entry to this list. No other code changes are needed.

---

## 8. Sound and vibration

- Generate sounds in code with the Web Audio API. Don't use sound files.
  - A soft "whoosh" tick on level up.
  - A crash thud.
  - A tiny chime for "New best!".
  - 3D Flight: a bright "ding" through a bonus ring, a quiet "pew" for each shot, a "tink" when a shot hits a big drone's armor, and an explosion when a drone is destroyed (bigger for big drones).
  - Helicopter: a soft, low, pulsing rotor hum while flying (a little higher while holding; stops when paused or after a crash) and a gem chime (the ring "ding", slightly higher).
  - 3D Heli: a "thwop-thwop" rotor pulse of filtered noise that beats faster as the collective rises (about 7 to 14 beats a second; stops when paused or after a crash), a soft thump on landing, and the ring chime and crash sound.
- Audio starts only after the first tap (browsers require this).
- Vibration uses `navigator.vibrate`, only when it's enabled in settings: on a crash, a tiny buzz for each drone destroyed, and an 8 ms tick when the 3D Heli lever crosses the HOVER mark.
- Sound and vibration are skipped silently if the phone doesn't support them.

---

## 9. PWA and phone behavior

### Manifest
- `name: "Swerve"`, `short_name: "Swerve"`
- `start_url: "./"`, `scope: "./"`
- `display: "fullscreen"`, `orientation: "portrait"` (Helicopter and 3D Heli runs ask for landscape while playing; the menus return to portrait)
- Theme and background colors match the start screen.
- Icons at 192 and 512, plus a 512 maskable icon. The icon is an original arrow-and-cubes design.
- Generate PNG icons from `icons/icon.svg` with a one-off local script if needed. Commit the PNGs, but don't add the script's tools as project dependencies.

### Service worker (`sw.js`)
- **Network-first for all of the app's own files, falling back to cache when offline.** The owner always gets the newest version when online, and the game still works offline.
  - If the site answers with an error (for example a 404 while GitHub Pages is down), the saved copy is used too, so the installed game keeps working.
  - This avoids the "stuck on an old version until I clear the cache" problem seen in the owner's other apps.
- The cache name includes `APP_VERSION`. On activate, delete old caches and call `clients.claim()`.
- When a new service worker takes over, reload the page once, but only if the player is **not** mid-run.
- Precache all app files on install so the first offline launch works.

### Phone polish
- Prevent pull-to-refresh, page bounce, text selection, the long-press menu and double-tap zoom on the game area (`overscroll-behavior: none`, `touch-action: none`, `user-select: none`).
- Respect the phone's notch and gesture bar using safe-area insets.
- **Keep the screen awake while playing** (Screen Wake Lock API). Release the lock when paused or on the menu.
- **Pause automatically** when the app goes to the background (`visibilitychange`).
- Target a steady 60 fps on the Pixel 10:
  - use `requestAnimationFrame`;
  - reuse objects instead of creating new ones every frame;
  - don't resize the canvas every frame.

---

## 10. Privacy (hard rules)

- **No accounts, no server and no database.** The game runs entirely on the phone.
- **The only stored data** is the best score and best level for each mode (Classic, 3D Flight, Helicopter, 3D Heli), settings (including the chosen start level, game mode, 3D up/down choice, 3D auto-fire on/off, which side the 3D Heli lift lever is on, and whether the 3D Heli tips have been seen) and the score history (score, level reached, start level, mode and date/time of each run), kept in the phone's `localStorage` under one key, `swerve:v1`. Nothing else is saved, and none of it ever leaves the phone.
- **Nothing is ever sent anywhere.**
  - No analytics, ads, trackers or crash reporting.
  - No third-party scripts, fonts or CDNs.
- Add a **Content Security Policy** meta tag in `index.html` limiting everything to the app's own files: `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'`.
- Tilt sensor readings are used live for steering only and are never stored.
- **The repo is public** (required for free GitHub Pages).
  - Never put personal info (names, emails, locations) in code, comments, commits or the README.
  - Commit messages should describe code changes only.
- `storage.js` must handle a missing or corrupted saved value by resetting to defaults, never by crashing.

---

## 11. Testing

### Automated (`node --test`)
These test the pure-logic modules.

- **Collision**:
  - overlap, no overlap and edge-touching cases;
  - the hitbox scale is applied.
- **Fairness**:
  - for each pattern (including `scatter (dense, big swing)` and `clusters (swing)`), with many seeds, generate 2 minutes of obstacles and confirm a passable gap of at least `minGapWidth` always exists, at the default band (30) and a wide band (62);
  - real play from every level, pre-filled start included, checked from the ship's real starting position;
  - no cube spawns closer than the fog distance during play.
- **No free rides** (`free-ride.test.js`, Classic): for every level, 60 seeds, a pilot who never steers or boosts, timed from when the first cube reaches the ship. The median must be 0.4–3.0 s (Morning 1.5–3.5 s, a gentle start). Also at a wide band (62): the median must be in the same range, and the average over 240 seeds within 25% of the default band's. (The average is used for that comparison because on some levels the times bunch into two groups, one per sweep of the open path, so a 60-seed median can flip between them by chance.) If the owner asks for easier or harder Classic levels, change the target range to match.
- **Pre-fill**: after a Classic reset, cubes already reach the fog distance and none are inside the start breather.
- **3D Flight fairness**: for every level's layout, with many seeds, sweep a grid of reachable (sideways, height) positions through the obstacles and confirm a `minGapWidth` × `minGapHeight` opening always exists. Drones count as solid boxes covering their full sway. Every bonus ring can be flown through.
- **Helicopter fairness** (`heli-fairness.test.js`): for every level, laps 1–3 and 20 seeds, 2 minutes of cave: nothing enters the open corridor, the corridor is always at least `heliMinGap` tall, the path's slope and bend limits hold, every gem is in the corridor, and the autopilot survives with the real physics at 60 fps (and once with uneven frame times up to `maxFrameTime`).
- **Helicopter** (`heli.test.js`): climb and drop, vertical speed clamp, speed by level/lap/within a level, crashes on the ceiling, floor, a block, spike and gate, rotor near-misses don't crash, gems count once, nothing moves before the first hold, frame-time cap.
- **3D Heli fairness** (`chopper-fairness.test.js`): for every level, laps 1–3 and 20 seeds: the 3D Flight reachable sweep with the chopper settings and its whole hitbox (rotor included), every ring flyable, no drones; the hitbox (rotor included) fits within 80% of the minimum gap; the autopilot survives 2 minutes at top speed with only the lever and stick (and once with uneven frame times).
- **3D Heli** (`chopper.test.js`): the lever stays put; above hover climbs, at hover holds, below sinks; climbing eases; forward speed up to top speed and no further, braking to 0, slow fade, sideways slide then settle; gentle landing vs hard landing, lift-off from the helipad; body and rotor strikes crash, rings don't; the multiplier (×1 at half speed, ×2 at top speed); levels by distance only; two-thumb zones keep their role, the left-handed swap, the joystick springs back, keyboard; no drones in 3D Heli while 3D Flight keeps them; storage defaults, round-trip and old saves.
- **3D Flight**: climbing and the height limits, boost, crashing into blocks, rings giving bonus points, and shooting (fire rate, one-hit and three-hit drones, aim assist, walls stopping shots, flying into a drone crashes, drone sway stays in range).
- **Levels**:
  - the correct level for a given score;
  - looping to Lap 2 increases speed;
  - palette blending returns valid colors.
- **Game state**:
  - speed ramps correctly;
  - the frame-time cap is applied;
  - the score only increases.
- **Storage**:
  - defaults load correctly;
  - corrupted data resets safely;
  - history, per-mode best scores and settings (including auto-fire) save and load;
  - old v1.3 saves load and gain the Helicopter fields; Helicopter runs save, filter and rank separately;
  - old v1.4 saves load unchanged and gain the 3D Heli fields (the new settings `collectiveSide` and `seenChopperTips` are only written once set; read them with `collectiveSideOf()` and `seenChopperTipsOf()`).
- **Config check**: every level has all required fields (Classic, with `swing` optional and, when present, above 0 and at most `laneLeash − 1`; 3D Flight and Helicopter, with every opening and window at least `heliMinGap`), all colors are valid, and every 3D Heli value is present and sensible (e.g. `0 < chopperHover < 1`).
- **App files**: every app file is in the service worker's precache list, and all paths are relative.

### Debug mode (hidden)
Opening the app with `?debug=1` at the end of the URL shows an overlay with:
- frames per second;
- hitboxes drawn as outlines;
- an "invincible" toggle;
- buttons to jump to any level.

In Helicopter mode the hitbox view also shows the open path's centerline and corridor. In 3D Heli it shows the open path ahead (as small minimum-size squares), the body and rotor hitboxes, and the lever, stick, multiplier, speed and height values; the panel moves to the top middle during a run so both thumb zones stay free.

It isn't linked from anywhere. It helps the owner preview new levels quickly.

### Manual checklist (in the PR description)
1. Install to the home screen and launch: it opens fullscreen, with no browser bar.
2. Play through levels 1–3: steering feels smooth and the level banners and color changes work.
3. Use `?debug=1` to jump to levels 4–8: each one looks and plays as described.
4. Crash: the flash, shake, sound and buzz all happen, and game over shows. Play again is instant.
5. Turn on airplane mode and relaunch from the home screen: the game still works.
6. Switch apps mid-run: the game pauses.
7. The screen doesn't dim during a long run.

---

## 12. Build order (one commit each, run tests after each)

1. **Skeleton**: files from §3, `config.js` with all values, a blank canvas that fills the screen, the start screen, and the PWA manifest and service worker. Deploy-ready.
2. **Core game**: perspective rendering, the ship, `scatter` obstacles, hold-sides controls, collision, score, game over, and best-score saving. Tests for collision, game and storage.
3. **Levels**: all 8 levels, palette cross-fade, banners, the bank effect, and looping laps. Tests for levels and config.
4. **Patterns**: `clusters`, `gates`, `canyon` and `mixed`, plus the fairness tests.
5. **Feel and polish**:
   - crash effects, sound and vibration, the Tilt level roll and Storm lightning;
   - pause, the settings screen, tilt and drag controls;
   - wake lock and auto-pause.
6. **Finish**: debug mode, icons, the README (plain language), a performance pass, and the full test run. Open the PR with the manual checklist.

---

## 13. Ideas for later (don't build now)

- Power-ups (slow-motion, shield).
- New ship designs unlocked by score.
- Daily challenge with a fixed seed.
- More levels and patterns, such as moving cubes and shrinking gaps.
- 3D Flight: drones that shoot back (with a shield or health bar), and an optional hold-to-fire button instead of auto-fire.
- ~~3D helicopter~~: built in v1.5.0 as **3D Heli** (§4d).
- 3D Heli: **wind gusts** in Storm that push the helicopter sideways (fairness-tested).
- 3D Heli: **landing challenges**: set down gently on a pad mid-level for a big bonus.
- 3D Heli: **tail rotor pedals** (turning the nose) as an optional third control for experts.
- The same **swinging open path** (`swing`, §7) for 3D Flight and 3D Heli, if they feel too easy to fly straight.
