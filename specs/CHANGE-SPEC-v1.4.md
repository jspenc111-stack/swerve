# Swerve v1.4.0 — Change spec: Harder levels + Helicopter mode

> **For Claude Code.** Read `CLAUDE.md` and `SPEC.md` first. This spec builds on **v1.3.0** (Classic + 3D Flight with shooting).
>
> - Build everything here in **one branch, `claude/helicopter-mode`, and one pull request into `main`**. Make one commit per step (see the build order at the end) and run `node --test` after each step.
> - Set `APP_VERSION` to **`1.4.0`** in the first commit.
> - Replace `CLAUDE.md` with the updated `CLAUDE.md` that comes with this spec. Copy this file into the repo as `specs/CHANGE-SPEC-v1.4.md`.
> - Don't stop to ask questions. Make sensible choices and list them in the PR description.
> - The owner is not a developer. Write the PR description in plain language. The owner approves the PR in the GitHub app; don't merge it yourself.

There are two parts:

1. **Harder levels**: every level in Classic and 3D Flight becomes about 10% harder. This only touches `config.js`.
2. **Helicopter mode**: a third game mode, a side-view cave flyer where you hold to rise and let go to drop.

---

## Part 1 — Make every level about 10% harder (Classic and 3D Flight)

Change **only** the values below in `js/config.js`. These exact values were checked against the v1.3.0 test suite, and all 95 tests (including both fairness tests) pass.

### Speed (shared by Classic and 3D Flight)

| Setting | Now | New |
|---|---|---|
| `baseSpeed` | 22 | **24** |
| `speedPerLevel` | 2.5 | **2.75** |
| `speedRampPerSecond` | 0.08 | **0.09** |

3D Flight gets faster automatically, because its speed is `flightSpeedFactor` (unchanged, 0.9) × Classic's speed.

### Classic obstacles (`pattern`)

| Level | Change |
|---|---|
| 1 Morning | scatter `density` 1.6 → **1.8** |
| 2 Sunset | scatter `density` 2.6 → **2.9** |
| 3 Lagoon | clusters `chance` 0.6 → **0.66** |
| 4 Gates | gates `rowSpacing` 18 → **16**, `gapWidth` 3.2 → **2.9** |
| 5 Night | scatter `density` 3.6 → **4.0** |
| 6 Canyon | canyon `width` 5.5 → **5.0**, `extra` 0.6 → **0.7** |
| 7 Tilt | scatter 2.8 → **3.1**; gates `rowSpacing` 16 → **14.5**, `gapWidth` 3.2 → **2.9**; clusters `chance` 0.6 → **0.66** |
| 8 Storm | scatter 3.4 → **3.8**; canyon `width` 5.5 → **5.0**, `extra` 0.8 → **0.9**; gates `rowSpacing` 15 → **13.5**, `gapWidth` 3.0 → **2.7**; clusters `chance` 0.7 → **0.77** |

### 3D Flight obstacles (`flight`)

| Level | Change |
|---|---|
| 1 Morning | floaters `density` 1.6 → **1.8** |
| 2 Sunset | floaters `density` 2.4 → **2.7**; pillars `chance` 0.8 → **0.9** |
| 3 Lagoon | pillars `chance` 0.9 → **1** |
| 4 Gates | frames `spacing` 22 → **20**, `holeWidth` 3.6 → **3.3**, `holeHeight` 3.0 → **2.75** |
| 5 Night | floaters `density` 3.2 → **3.6** |
| 6 Canyon | tunnel frames `holeWidth` 5.5 → **5.0**, `holeHeight` 4.4 → **4.0** |
| 7 Tilt | floaters 2.6 → **2.9**; frames `spacing` 22 → **20**, hole 3.6 × 3.0 → **3.3 × 2.75**; pillars `chance` 0.9 → **1** |
| 8 Storm | floaters 3.2 → **3.6**; tunnel hole 5.5 × 4.4 → **5.0 × 4.0**; frames `spacing` 20 → **18**, hole 3.4 × 2.9 → **3.1 × 2.65** |

### Do NOT change
These settings are what keep the game fair:
- `minGapWidth` and `minGapHeight`
- all hitbox scales
- `laneLeash`, `laneSlopeFactor` and `flightLaneLeashY`
- the breathers (`breatherBefore` and `breatherAfter`)
- boost
- drone and ring settings

If any test fails after a later change, move only the failing value halfway back toward its old number, and say so in the PR.

---

## Part 2 — Helicopter mode

### 2.1 What it is

A third mode on the start screen: **Helicopter**. It's a **side view** of a small helicopter flying right through an endless cave.

- **Hold anywhere** on the screen to rise, and **let go** to drop.
- The cave walls wind up and down. Blocks, rock spikes and gate walls stand in the way.
- It gets faster and tighter level by level.
- Collect **gems** for bonus points. Touching anything ends the run.

It uses the **same 8 levels** as the other modes (names, colors, effects, level picker, laps), with its own cave layout for each level.

**Original content only.** The general idea (hold to rise through a cave) is old and generic. Don't copy the name, art, sounds or text of any existing helicopter game. The mode's label is just "Helicopter".

### 2.2 Screen and orientation

The game normally runs in portrait. Helicopter mode is best played **sideways (landscape)**, because you need to see far ahead.

- **When a Helicopter run starts**:
  - Call `screen.orientation.lock('landscape')`. This works in the installed fullscreen app on Android.
  - If it fails, ignore the failure and play anyway.
- **Returning to the menu**: call `screen.orientation.lock('portrait')`. The menus stay portrait as now.
- **If the phone is still upright** when the run starts:
  - Show a hint for about 3 seconds: "Turn your phone sideways for a bigger view".
  - The game is fully playable upright too (see camera below).
- **If the orientation changes mid-run**: resize the canvas and **auto-pause**, so the player is never caught out.
- **Overlays must fit a landscape screen** (about 412 px tall), using a compact layout or scrolling:
  - Pause
  - Game over
  - "Hold to fly"

**Camera:**
- The helicopter sits at `heliScreenX` (22%) from the left edge.
- The view always shows at least `heliViewAhead` world units ahead of it, and the full cave height (`heliWorldHeight`).
- Scale: `scale = min(screenWidth / (heliViewAhead / (1 − heliScreenX)), screenHeight / heliWorldHeight)`.
- In portrait, this makes the cave a band across the middle of the screen. Fill the space above and below with more rock in the wall color, so it never looks letterboxed (empty bars).
- The camera doesn't move up or down; the whole cave height is always visible.

### 2.3 Controls and physics (`js/heli.js`, pure logic)

**Controls:**
- **Lift** = any touch held anywhere, except the pause button. Mouse hold and keyboard (Space, ↑ or W) also lift.
- **Pause** = the pause button, or P or Esc.
- Helicopter mode has **no boost** (hide the Boost button). The Settings options for Hold sides, Tilt and Drag don't apply to it. Add one line under Controls in Settings: "Helicopter: hold anywhere to fly up."

**Start of a run:**
- The helicopter hovers in place, with a pulsing "Hold to fly" prompt.
- Nothing moves until the first touch, then the run starts.

**Physics** (y points up, units per second; values in §2.10):
- `vy += (holding ? heliLift − heliGravity : −heliGravity) × dt`
- Clamp `vy` to ±`heliMaxVSpeed`.
- `y += vy × dt`
- Frame time is capped by the shared `maxFrameTime`.

**Forward speed:**
- Starts at `heliSpeed`.
- Rises by `heliSpeedPerLevel` per level, by `heliSpeedRampPerSecond` within a level, and by `heliLapSpeedBonus` per lap.
- Each level's `heli.speedBonus` (optional) is added on top.

**Pitch:** the nose tips up while climbing and down while falling, up to `heliPitchDeg`, following `vy` smoothly.

**Autopilot:** `heli.js` exports a small **autopilot**. It's a pure function that decides "hold or not" from the helicopter's height and vertical speed and the open path ahead, aiming a short distance ahead (about 0.35 seconds' travel). It's used in two places:
- the **menu preview** (the helicopter flies itself behind the start screen);
- the **fairness tests** (§2.6).

### 2.4 The cave and obstacles (`js/caveSpawner.js`, pure logic, seeded random)

The cave is built in thin columns every `caveStep` units. Each column has a **ceiling** height and a **floor** height.

**Build order:**
1. **Build the open path first.**
   - The path is a centerline that wanders up and down, with a clear **corridor** `heliMinGap` tall around it.
   - The path's slope and bendiness are limited so the helicopter can always follow it (§2.6).
   - `wander` (0–1) sets how much of that limit the path uses.
2. **Add the walls.**
   - The cave has its own smooth middle line, `opening` units tall, which follows the open path loosely.
   - The corridor can sit anywhere inside the opening, but its edges always stay at least 0.3 units inside the walls. This lets the path **swing toward one wall to leave room for an obstacle on the other side**.
   - The ceiling and floor get a little rough noise (`roughness`), but never cut into the corridor.
   - The cave stays far enough from the world's top and bottom that both walls are always visible.
3. **Add the obstacles for the level's pattern.**
   - Obstacles fill the free space between the corridor and a wall, and never enter the corridor.
   - An obstacle that doesn't fit is **clipped** (cut shorter) to fit.
   - If clipping makes it shorter than its minimum (`blockMin` or `spikeMin`), it's **skipped**.

| Pattern | What it looks like |
|---|---|
| `cave` | A winding cave with **floating rock blocks** (tall rectangles) every `blockSpacing` units, each `blockMin`–`blockMax` tall. The open path goes above or below each block. |
| `spikes` | **Stalactites and stalagmites**: tapered rock spikes hanging from the ceiling and rising from the floor. The chance of one per column is `spikeChance`, and each is `spikeMin`–`spikeMax` long. |
| `gates` | **Gate walls**: full-height walls every `spacing` units, each with one window `window` units tall. The window moves up and down from gate to gate, like a vertical slalom. |
| `snake` | A **narrow, tightly winding tunnel** with no obstacles. Low `opening`, high `wander`. |
| `mixed` | Cycles through a `sequence` of the above every `segmentLength` units, like Classic. |

**Also:**
- **Gems** appear every `heliGemSpacing` units, always on the open path.
  - Flying through one adds `heliGemBonus` points, with a chime, a sparkle and a "+25" pop-up.
  - Gems aren't solid.
- **Breathers at a level change:**
  - The cave opens up to at least the next level's `opening` + 2, with no obstacles, for `heliBreatherBefore` units before the change and `heliBreatherAfter` units after it.
  - Then the level banner shows and the colors cross-fade, as in the other modes.
- **Spawning and clean-up:**
  - New columns and obstacles are created beyond the right edge of the visible screen, never in view.
  - Anything that has passed off the left edge is removed.

### 2.5 Collision, crash and score

**Hitbox:**
- The helicopter's hitbox is its **body and skids**, scaled by `heliHitboxScale`.
- The rotor blades don't count, so near-misses with the rotor tips feel fair.
- Spikes collide as a rectangle 70% of their drawn width.

**A crash happens** when the hitbox overlaps:
- the ceiling or floor of any column it spans;
- a block, spike or gate wall.

**On a crash**, the same feel as the other modes:
- a burst of particles in the ship color and orange, plus a puff of smoke;
- a flash, a screen shake, the crash sound and a vibration (if enabled);
- game over after `gameOverDelayMs`.

**Score and levels:**
- Score = distance × `heliScorePerUnit` + gems × `heliGemBonus`.
- The level is decided by distance along the course, using the shared `levelLength`, so a level lasts about 30–40 seconds.
- Starting at a later level starts the score at 0, as in the other modes.

### 2.6 Fairness (hard rule, must be tested)

There must **always** be a way through, at the fastest speed the player can be going at that point in the course (level + lap).

**Path limits:**
- **Slope:** the path's slope must never exceed `caveSlopeFactor × heliMaxVSpeed ÷ topSpeed`.
- **Bendiness:** how fast the slope changes per unit must never exceed `caveCurveFactor × (heliLift − heliGravity) ÷ topSpeed²`. This makes sure the helicopter can change direction in time.

**Opening sizes:**
- The corridor is always at least `heliMinGap` tall.
- Every `opening` and gate `window` in config must be at least `heliMinGap`.

**Tests** (`tests/heli-fairness.test.js`). For every level, for laps 1–3 and with 20 seeds, generate 2 minutes of cave, then check:
1. **Geometry:** nothing (walls, blocks, spikes, gates) enters the corridor; the corridor is always at least `heliMinGap` tall; the slope and bend limits are never broken; and every gem is inside the corridor.
2. **Autopilot survives:** the autopilot from §2.3, flying with the real physics at the real speed, survives the whole 2 minutes. It uses only hold and release, at 60 frames a second, and is also run once with random frame times up to `maxFrameTime`.

Also extend the config check: every level has a valid `heli` block, and every opening and window is at least `heliMinGap`.

### 2.7 Look and feel (`js/renderHeli.js`)

**Background (the cave air):**
- A vertical gradient from the level's `skyHorizon` to `sky`.
- Two layers of distant rock silhouettes in the `grid` color (or `ground` mixed toward `sky` if there's no `grid`), drifting at 0.2× and 0.45× speed for depth. This effect is called **parallax**: far things move slower, so the scene looks deep.

**Walls:**
- Filled with the level's `ground` color.
- The cave edge has a darker rim line (`ground` darkened about 25%) and a soft lighter highlight just inside it.
- The edge is slightly jagged, from the column noise.

**Obstacles:**
- Blocks, spikes and gates use the `cube` color.
- Lit from the upper left: a lighter top and left edge, a darker bottom and right edge.

**The helicopter** (original design, facing right, about `heliWidth` × `heliHeight`):
- **Shape:**
  - a rounded body in the `ship` color, with a big glass bubble cockpit at the nose;
  - a tapering tail boom with a small fin;
  - a spinning tail rotor (a disc with moving blade lines);
  - two landing skids.
- **Main rotor:** a mast with a blade that stretches and shrinks to fake spinning, plus a faint motion-blur ellipse. It spins faster while you're holding.
- **Movement:** tilts with pitch (§2.3).
- **Exhaust:** small grey smoke puffs drift back from the exhaust, grow and fade (`heliSmokePerSec`). They are more frequent while holding.

**Effects from the level:**
- **Night** (`glow`): the cave rim and obstacles glow faintly.
- **Storm** (`lightning`): brief flashes, as in the other modes.
- **Tilt** (`roll`): the whole view tilts gently, by half the level's `roll.degrees`, so it's playable sideways.

**Gems:** small gold diamonds that slowly spin, with a white glint.

**On-screen display:**
- the score at the top center, with the level name underneath;
- the pause button in the top corner, inside the safe area (clear of the notch and gesture bar).

### 2.8 Sound and vibration

Sounds are synthesized with Web Audio, as now, and respect the Sound setting:
- **Rotor hum:** a soft, low, pulsing hum while flying. Its pitch rises a little while holding. It stops when paused or after a crash.
- **Gem chime:** reuse the ring "ding" with a slightly higher pitch.
- **Crash:** the existing crash thud.
- **Vibration:** on a crash only.

### 2.9 Menus, history, settings and saved data

- **Mode switch:** now three buttons, each with a short subtitle:
  - **Classic**: "Steer left & right"
  - **3D Flight**: "Fly up, down & around"
  - **Helicopter**: "Hold to fly up"

  They must fit side by side at phone width; make the subtitles wrap or shrink if needed.
- **Start screen in Helicopter mode:**
  - how-to line: "Hold anywhere to fly up. Let go to drop. Turn your phone sideways for the best view.";
  - the menu background shows the chosen level's cave with the autopilot flying;
  - the level picker works as now.
- **Game over:** score, level reached (and start level), best score, rank line as now, plus "· 3 gems" when gems were collected.
- **History:** the mode filter gains a **Helicopter** option. Runs are tagged `mode: 'heli'`.
- **Saved data** (the owner approves these additions, as required by `CLAUDE.md`):
  - `GAME_MODES` becomes `['classic', 'flight', 'heli']`;
  - new fields `heliBestScore` (0) and `heliBestLevel` (1);
  - `settings.mode` accepts `'heli'`.

  Everything stays in the single `swerve:v1` key, and nothing leaves the phone. Old saves must load unchanged, with the new fields defaulting.

### 2.10 New `config.js` values (starting points, tune freely)

Add a `// ---- Helicopter mode ----` section with these values and plain-language comments, like the existing sections.

| Key | Value | Meaning |
|---|---|---|
| `heliSpeed` | 9 | forward speed at the start |
| `heliSpeedPerLevel` | 0.8 | added per level |
| `heliSpeedRampPerSecond` | 0.03 | gentle extra speed within a level |
| `heliLapSpeedBonus` | 2 | extra speed per lap after the first |
| `heliGravity` | 22 | how fast you drop when you let go |
| `heliLift` | 44 | upward push while holding (net climb = lift − gravity) |
| `heliMaxVSpeed` | 8 | top up/down speed |
| `heliPitchDeg` | 10 | nose tilt when climbing/falling |
| `heliWidth` / `heliHeight` | 2.0 / 0.9 | helicopter size (body + skids) |
| `heliHitboxScale` | 0.75 | hitbox smaller than the drawing |
| `heliMinGap` | 3.0 | narrowest opening ever allowed (fairness) |
| `heliWorldHeight` | 16 | full cave height shown on screen |
| `heliViewAhead` | 26 | minimum distance visible ahead |
| `heliScreenX` | 0.22 | helicopter position from the left edge |
| `caveStep` | 1 | width of one cave column |
| `caveSlopeFactor` | 0.5 | how steep the open path may get (share of the max climb) |
| `caveCurveFactor` | 0.5 | how sharply the path may bend (share of the max climb force) |
| `heliScorePerUnit` | 1.3 | points per unit of distance |
| `heliBreatherBefore` / `heliBreatherAfter` | 6 / 20 | obstacle-free stretch around level changes |
| `heliGemSpacing` | 40 | distance between gems |
| `heliGemBonus` | 25 | points per gem |
| `heliSmokePerSec` | 14 | exhaust puffs per second |

**Per-level `heli` blocks** (add one to every level in `LEVELS`, and document the options in the comment above `LEVELS`):

| Level | `heli` |
|---|---|
| 1 Morning | `{ type: 'cave', opening: 9.5, wander: 0.5, roughness: 0.3, blockSpacing: 24, blockMin: 2.5, blockMax: 3.5 }` |
| 2 Sunset | `{ type: 'cave', opening: 8.8, wander: 0.7, roughness: 0.4, blockSpacing: 18, blockMin: 3, blockMax: 4.2 }` |
| 3 Lagoon | `{ type: 'spikes', opening: 8.6, wander: 0.6, roughness: 0.3, spikeChance: 0.35, spikeMin: 2, spikeMax: 4 }` |
| 4 Gates | `{ type: 'gates', opening: 9, wander: 0.4, roughness: 0.3, spacing: 14, window: 3.6 }` |
| 5 Night | `{ type: 'cave', opening: 7.6, wander: 0.8, roughness: 0.4, blockSpacing: 13, blockMin: 3, blockMax: 4.5 }` |
| 6 Canyon | `{ type: 'snake', opening: 5.4, wander: 1, roughness: 0.5 }` |
| 7 Tilt | `{ type: 'mixed', segmentLength: 120, sequence: [ cave (opening 8, wander 0.7, blockSpacing 15, blocks 3–4.2), gates (spacing 14, window 3.6), spikes (chance 0.4, 2–4) ] }` |
| 8 Storm | `{ type: 'mixed', segmentLength: 130, sequence: [ cave (opening 7.2, wander 0.9, blockSpacing 12, blocks 3–4.5), snake (opening 5.2), gates (spacing 12, window 3.4), spikes (chance 0.45, 2–4.2) ] }` |

### 2.11 Debug mode (`?debug=1`)

In Helicopter mode, debug mode also shows:
- the open path's centerline and corridor (thin outlines);
- the hitbox.

The existing FPS display, invincible toggle and level skip work here too.

### 2.12 Files

- **New:**
  - `js/heli.js`: state, physics, scoring and autopilot (pure logic)
  - `js/caveSpawner.js`: cave, obstacles and gems (pure logic)
  - `js/renderHeli.js`: drawing
  - `tests/heli.test.js`
  - `tests/heli-fairness.test.js`
- **Changed:**
  - `main.js`: runs the third mode; orientation lock and auto-pause
  - `input.js`: a "holding" check for any touch, mouse or key
  - `storage.js`, `audio.js`, `config.js`
  - `index.html`: mode button and history filter
  - `styles.css`: three-button mode switch and landscape-friendly overlays
  - `sw.js`: precache list (the app-files test checks this)
  - `tests/config.test.js` and `tests/storage.test.js`
- **Docs:**
  - Add a **§4c Helicopter mode** to `SPEC.md` that summarizes this part, and update the file list, saved data, tests, sounds and screens sections to match.
  - Update `README.md`.
  - Replace `CLAUDE.md` with the new version.

### 2.13 Tests to add

- **`heli.test.js`:**
  - holding makes you climb and letting go makes you drop;
  - vertical speed is clamped;
  - forward speed rises by level, by lap and within a level;
  - crashes happen on the ceiling, floor, a block, a spike and a gate;
  - near-misses with the rotor tips don't crash;
  - gems add points once each;
  - nothing moves before the first hold;
  - the frame-time cap is applied.
- **`heli-fairness.test.js`:** see §2.6.
- **Config:** every level has a valid `heli` block, and openings and windows are at least `heliMinGap`.
- **Storage:** old v1.3 saves load and gain `heliBestScore`/`heliBestLevel`; Helicopter runs save, filter and rank separately; `settings.mode = 'heli'` round-trips (saves and loads back the same).

### 2.14 Manual checklist (put this in the PR description)

1. Start screen: three mode buttons fit side by side, and Helicopter shows the self-flying cave preview.
2. Play Helicopter from the installed app: the screen turns sideways, "Hold to fly" waits for your first touch, and holding climbs while letting go drops.
3. Levels 1–3: the cave, blocks, spikes and gems all work, and the level banners and colors change.
4. Use `?debug=1` to jump to levels 4–8: gates, Night glow, the Canyon snake, the Tilt view and Storm flashes all work.
5. Crash: burst, shake, sound, buzz, then game over. Play again is instant, and Menu goes back to portrait.
6. Rotate the phone mid-run: the game pauses. Hold it upright: it still plays, with the "turn sideways" hint.
7. Classic and 3D Flight feel a little harder (faster, busier, slightly tighter gaps), and you can still get through.
8. History shows a Helicopter filter. Airplane mode: the game still works offline.

### Build order (one commit each, run `node --test` after each)

1. **Harder levels:** Part 1 config changes, and `APP_VERSION` set to 1.4.0.
2. **Helicopter logic:** `heli.js` and `caveSpawner.js`, the config values and `heli` blocks, plus all heli, fairness and config tests.
3. **Helicopter on screen:** `renderHeli.js`, `main.js` integration, input, orientation lock, the "Hold to fly" start and the camera.
4. **Menus and polish:** mode switch, history filter, storage, game over, sounds, smoke, gems, level effects and debug overlay.
5. **Docs and PR:** `SPEC.md` §4c, `README.md`, the new `CLAUDE.md` and `specs/CHANGE-SPEC-v1.4.md`. Then a privacy check (no external requests, the CSP is intact, only `swerve:v1` is stored, no personal info), and open the PR with the checklist.

---

## Part 3 — Later (don't build now): 3D helicopter

A follow-up, to be specced after the owner has tried the cave mode. The rough idea:
- A helicopter version of 3D Flight: slower and floatier, able to hover and slip sideways.
- Spinning rotors, and the same levels.
- Possibly drones to shoot.

Add it to the "Ideas for later" list in `SPEC.md`.
