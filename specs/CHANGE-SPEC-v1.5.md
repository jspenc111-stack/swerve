# Swerve v1.5.0 — Change spec: 3D Heli (two-thumb helicopter)

> **For Claude Code.** This spec needs **v1.4.0 already merged into `main`** (Helicopter cave mode, the landscape helper and the three-mode menu). Read `CLAUDE.md`, `SPEC.md` and `specs/CHANGE-SPEC-v1.4.md` first.
>
> - Work on one branch, **`claude/3d-heli`**, from the latest `main`, and open one pull request into `main`.
> - Make one commit per step (build order at the end), and run `node --test` after each step.
> - Set `APP_VERSION` to **`1.5.0`** in the first commit.
> - Replace `CLAUDE.md` with the updated `CLAUDE.md` that comes with this spec, and copy this file into the repo as `specs/CHANGE-SPEC-v1.5.md`.
> - Don't stop to ask questions. Make sensible choices and list them in the PR description.
> - The owner is not a developer. Write the PR description in plain language. The owner approves the PR in the GitHub app; don't merge it yourself.

---

## 1. What it is

A fourth mode, **3D Heli**: fly a helicopter through the 3D Flight courses using **two thumbs, like a real helicopter**.

- **Left thumb: the collective.** A lever that sets how much lift the rotor makes, so you climb, hover or descend. It **stays where you leave it**, like the real lever.
- **Right thumb: the cyclic.** A stick that tilts the rotor. Push forward to fly faster, pull back to slow down and hover, and push sideways to slide. It springs back to the middle when you let go.
- **You choose your own speed.** Faster flying earns a **score multiplier** of up to ×2, but gives you less time to react.
- **No shooting.** This mode is about precise flying, with bonus rings to collect.
- **Same levels:** the same 8 levels, colors, effects, level picker and laps, using each level's existing `flight` obstacles.

The mode's id in code is **`chopper`**, so it isn't confused with the cave mode `heli`. On screen it's called **"3D Heli"**.

The helicopter design and the name must be original; don't copy any real helicopter model or existing game.

---

## 2. Controls (`js/input.js`)

**Screen layout** (sideways, using the v1.4 landscape helper; also playable upright):
- The **left 40%** of the screen is the **collective zone**, and the **right 60%** is the **cyclic zone**.
- Each touch keeps the role of the zone it **started** in until it lifts, so thumbs can wander without swapping jobs.
- A Settings option, **"3D Heli collective: Left / Right"** (default Left), swaps the zones for left-handed play.

**Collective (left thumb):**
- A tall slider is drawn near the left edge, covering about 60% of the screen height. It has a handle and a **HOVER** mark.
- Dragging is **relative**: put your thumb anywhere in the zone, and moving it up by `collectiveTravelPx` moves the lever its full range. You don't have to hit the handle exactly.
- The lever value runs from 0 (bottom) to 1 (top), and **stays put when you let go**.
- When the lever crosses the hover mark there's a tiny 8 ms buzz (only if vibration is on), so you can feel it.

**Cyclic (right thumb):**
- A floating joystick appears where your thumb lands. Reuse 3D Flight's joystick ring and `joystickRadiusPx`.
- It gives `stickX` (−1 left … 1 right) and `stickY` (−1 pull back … 1 push forward).
- It eases back to 0 quickly when released.

**Keyboard** (for testing on a computer):
- W/S move the collective up and down while held (the lever stays when released).
- The arrow keys work the cyclic.
- P or Esc pauses.

The 3D Flight settings for tilt, drag and inverted up/down don't apply to this mode. Settings shows one line: "3D Heli: left thumb = lift (stays put), right thumb = fly."

---

## 3. Flight physics (`js/chopper.js`, pure logic)

All values come from `config.js` (§9).

**Lift (collective):**
- The hover point is `chopperHover` (0.45). Above it, the target vertical speed rises toward +`chopperMaxClimb`; below it, it falls toward −`chopperMaxSink`, in proportion to how far the lever is from hover.
- The actual vertical speed **eases toward the target** (`chopperClimbEase`), which makes it feel floaty and heavy.
- The ceiling (`flightMaxAltitude`) just stops the climb.

**Forward speed (cyclic forward/back):**
- Pushing forward accelerates by `stickY × chopperForwardAccel`, and pulling back brakes by `chopperBrake`.
- With the stick centered, speed fades slowly (`chopperForwardDrag`), so you top it up now and then, like a real helicopter.
- Speed stays between 0 and the level's **top speed**: `chopperTopSpeedFactor` × Classic's speed for that level and lap (including the level's `speedBonus`).
- There's no flying backwards.

**Sideways (cyclic left/right):**
- Uses `chopperSideAccel`, up to `chopperMaxSideSpeed`, with low friction (`chopperSideFriction`), so it **slides** a little after you let go.

**The ground:**
- Touching down slower than `chopperCrashSink` is a **landing** (no crash). On the ground, forward speed quickly drops to 0.
- Hitting the ground faster than that is a crash ("hard landing").

**Start of a run:**
- The helicopter sits on a **helipad** with the lever at 0 and the rotor idling.
- Nothing is in the way for the first stretch (the usual breather). Raise the collective past hover to lift off, then push forward to go.

**Look (visual only, doesn't change the hitbox):**
- The nose tips down when accelerating and up when braking, up to `chopperPitchDeg`.
- It rolls into sideways movement, up to `chopperRollDeg`.
- The rotor disc tilts with the stick.

**Autopilot:** `chopper.js` exports a small autopilot that sets the collective lever and the cyclic stick from the state and the open path ahead. It's used in two places:
- the **menu preview** (the helicopter flies itself behind the start screen);
- the **fairness tests** (§6).

---

## 4. Course, score and levels

**Course:**
- Reuse `flightSpawner.js` with each level's existing `flight` block, rings and breathers.
- Give it a **chopper version of the settings**, with the helicopter's own `maxSteerSpeed` and `maxClimbSpeed` (the smaller of max climb and max sink) and its top speed. The open path is then laid out for what the helicopter can actually do at full speed.
- Add a spawner option that turns **drones off**, and use it for this mode. 3D Flight must stay exactly as it is.

**Score:**
- Score = distance × `chopperScorePerUnit` × **multiplier**, plus `ringBonus` per ring.
- The multiplier is ×1 at or below half of top speed, rising in a straight line to ×`chopperMaxMultiplier` (2) at top speed.

**Levels:**
- A new level starts every `chopperLevelDistance` units of **distance**, so the multiplier adds points but never skips levels.
- Level banners, color cross-fades and lap rules are the same as the other modes.

**Collision:**
- A crash happens if the helicopter's body box (fuselage and tail boom, scaled by `chopperHitboxScale`) **or** its rotor disc (a thin flat box `chopperRotorDiameter` × `chopperHitboxScale` wide, at the top) touches any block, pillar, wall or tunnel.
- A **rotor strike counts**, as in real life.
- Rings aren't solid.

---

## 5. Look and feel

**The helicopter** (in the low-poly, flat-shaded style of the 3D Flight jet; a new `js/chopperModel.js` that `render3d.js` calls):
- **Body:** a rounded pod-shaped fuselage, metallic and tinted by the level's `ship` color. A big wraparound glass canopy at the front.
- **Tail:** a tapering tail boom, a vertical fin with a small horizontal stabilizer, and a spinning tail rotor.
- **Underneath:** two landing skids on struts.
- **Main rotor:** a mast, a hub and **4 visible blades** that spin. They spin faster with more collective and keep idling on the ground. A faint see-through disc shows when they spin fast.
- **Lights:** red on the left, green on the right, and a white strobe on the tail, as on the jet.

**Effects:**
- **Downwash:** when lower than about 3 units, a ring of dust and ripple particles spreads on the ground below. It's stronger with more collective.
- **Shadow:** the helicopter's shadow on the ground, reusing the existing one.
- **Helipad:** a flat round pad at the start with a simple "H".

**Camera:**
- A chase view behind and above (`chopperCameraBack`, `chopperCameraAbove`), following the existing 3D Flight camera.
- It follows sideways moves exactly, and up/down moves with a slight lag.

**On-screen display** (it must not sit under either thumb):
- the score and multiplier at the top center (e.g. "1,240 ×1.6", with the multiplier glowing at ×2), and the level name underneath;
- a small **speed bar** under the score;
- the **altimeter** at the top left;
- the pause button at the top right;
- the collective slider and joystick ring, as in §2.

**First-run tips:**
- Before the first-ever 3D Heli run, show 3 quick cards:
  1. "Left thumb: lift. Slide up to climb. It stays where you leave it."
  2. "Find the HOVER mark to hold your height."
  3. "Right thumb: push forward to fly, sideways to slide. Faster = up to ×2 points."
- Tapping **Got it** saves `seenChopperTips`.
- A small **?** on the start screen (in 3D Heli mode) shows the tips again.

**Sound** (synthesized, respecting the Sound setting):
- **Rotor:** a "thwop-thwop" pulse that gets faster as the collective rises, between about 7 and 14 beats a second. It stops when paused.
- A soft thump on landing, plus the ring chime and crash sound, reused.

**Level effects:** glow, roll and lightning work as in 3D Flight.

---

## 6. Fairness (hard rule, must be tested)

Add `tests/chopper-fairness.test.js` to check all of this:

1. **Reachable sweep:** the same 3D Flight fairness sweep, using the chopper version of the settings, for every level, laps 1–3, with 20 seeds. A `minGapWidth` × `minGapHeight` opening must always be reachable, and every ring must be flyable.
2. **Hitbox fits:** the hitbox, rotor included, is at most 80% of `minGapWidth` wide and 80% of `minGapHeight` tall.
3. **Autopilot survives:** using only the collective lever and the cyclic stick, the autopilot flies 2 minutes at **top speed** on every level, for laps 1–3 and 20 seeds, without crashing. It is also run once with random frame times up to `maxFrameTime`.

**If the autopilot can't survive a level:**
- Make this mode's course gentler by lowering the speeds used for layout. Note it in the PR.
- **Never** shrink the gaps, loosen the hitbox, or change 3D Flight.

Also extend the config check so all chopper values are present and sensible, for example `0 < chopperHover < 1`.

---

## 7. Menus, history and saved data

**Mode switch:** now **four** buttons in a 2×2 grid:

| | |
|---|---|
| **Classic**: Steer left & right | **3D Flight**: Fly up, down & around |
| **Helicopter**: Hold to fly up | **3D Heli**: Two-thumb chopper |

**Start screen in 3D Heli mode:**
- How-to line: "Left thumb = lift, right thumb = fly. Turn your phone sideways."
- The menu background shows the autopilot flying the chosen level.

**Game over:** score, level, best and rank, as now, plus "· 5 rings" and "top ×2.0".

**History:** the filter gains **3D Heli**. Runs are tagged `mode: 'chopper'`.

**Saved data** (the owner approves these additions):
- `GAME_MODES` gains `'chopper'`.
- New fields `chopperBestScore` (0) and `chopperBestLevel` (1).
- New settings `collectiveSide` (`'left'` or `'right'`) and `seenChopperTips` (true/false).
- `settings.mode` accepts `'chopper'`.

Everything stays in the single `swerve:v1` key, and nothing leaves the phone. Older saves must load unchanged.

**Debug** (`?debug=1`) shows the open path, the hitbox and rotor box, and the lever, stick and multiplier values, plus the existing FPS display, invincible toggle and level skip.

---

## 8. Files

- **New:**
  - `js/chopper.js`: state, physics, scoring and autopilot (pure logic)
  - `js/chopperModel.js`: the 3D helicopter drawing, downwash and helipad
  - `tests/chopper.test.js`
  - `tests/chopper-fairness.test.js`
- **Changed:**
  - `flightSpawner.js`: drones-off option
  - `render3d.js`: draws the chopper and its on-screen display
  - `input.js`: two-thumb zones, the collective lever and the cyclic stick
  - `main.js`: runs the fourth mode, the tips and the orientation behavior
  - `storage.js`, `audio.js`, `config.js`
  - `index.html` and `styles.css`: the 2×2 mode grid, settings and tips cards
  - `sw.js`: precache list
  - `tests/config.test.js` and `tests/storage.test.js`
- **Docs:**
  - Add a **§4d 3D Heli** to `SPEC.md`, and update its file list, saved data, sounds, tests and screens sections.
  - Update `README.md`.
  - Replace `CLAUDE.md` with the new version.

---

## 9. New `config.js` values (starting points, tune freely)

Add a `// ---- 3D Heli mode ----` section with plain-language comments.

| Key | Value | Meaning |
|---|---|---|
| `chopperTopSpeedFactor` | 0.7 | top speed as a share of Classic's speed |
| `chopperForwardAccel` | 10 | how fast pushing forward speeds you up |
| `chopperBrake` | 14 | how fast pulling back slows you down |
| `chopperForwardDrag` | 0.06 | how quickly speed fades with the stick centered |
| `chopperSideAccel` / `chopperMaxSideSpeed` / `chopperSideFriction` | 30 / 8 / 4 | sideways slide |
| `chopperHover` | 0.45 | lever position that holds height |
| `chopperMaxClimb` / `chopperMaxSink` | 8 / 7 | top climb and descent speeds |
| `chopperClimbEase` | 3 | how quickly climb follows the lever (lower = floatier) |
| `chopperCrashSink` | 4.5 | touching down faster than this is a crash |
| `collectiveTravelPx` | 220 | thumb travel for the full lever range |
| `chopperPitchDeg` / `chopperRollDeg` | 14 / 22 | nose tilt and bank (look only) |
| `chopperLength` / `chopperBodyWidth` / `chopperBodyHeight` | 2.2 / 0.7 / 0.9 | body size |
| `chopperRotorDiameter` | 2.2 | main rotor size |
| `chopperHitboxScale` | 0.7 | hitbox smaller than the drawing |
| `chopperCameraBack` / `chopperCameraAbove` | 5 / 2 | chase camera |
| `chopperScorePerUnit` | 1 | points per unit of distance at ×1 |
| `chopperMaxMultiplier` | 2 | multiplier at top speed |
| `chopperLevelDistance` | 420 | distance per level (about 25 s at top speed, about 50 s at half) |

---

## 10. Tests (`tests/chopper.test.js`)

- **Collective:** the lever stays put when released; above hover you climb, at hover you hold, below hover you sink; climbing eases rather than jumping.
- **Cyclic:** forward speeds you up to top speed and no further; back brakes to 0 and never goes negative; the centered stick slowly fades speed; sideways slides then settles.
- **Ground:** a gentle touchdown is a landing and a hard one is a crash; you take off from the helipad when the lever is past hover.
- **Crashes:** body and rotor strikes crash, and rings don't.
- **Score:** the multiplier is ×1 at half speed and ×2 at top speed; levels advance by distance only.
- **Two-thumb input:** touches keep their zone role; the left-handed swap works; the joystick springs back.
- **Drones:** the course has no drones in this mode, and 3D Flight still does.
- **Storage:** new fields default, round-trip (save and load back the same), and old saves load.

---

## 11. Manual checklist (put this in the PR description)

1. The start screen shows the 2×2 mode grid. 3D Heli shows the tips on the first run, and **?** shows them again.
2. The phone turns sideways. The helicopter sits on the helipad; raise the left slider past HOVER to lift off.
3. Let go of the slider: it stays put. Find the hover mark (you'll feel the tick) and the helicopter holds its height.
4. Push the right stick forward: the nose dips and it speeds up, and the multiplier climbs to ×2 at top speed. Pull back: it slows and hovers.
5. Fly levels 1–3. Then use `?debug=1` to jump to levels 4–8 (tunnels, Night glow, Tilt roll, Storm flashes).
6. Rotor strike on a pillar = crash. Gentle landing = fine. Dropping hard = crash.
7. Settings → collective on the Right: the controls swap.
8. History has a 3D Heli filter. Airplane mode still works. The other three modes are unchanged.

---

## Build order (one commit each, run `node --test` after each)

1. **Logic:** `chopper.js`, the drones-off option, the config values, and the physics, score and fairness tests (including the autopilot). Set `APP_VERSION` to 1.5.0.
2. **Controls:** two-thumb input, the collective slider and joystick drawing, and the left-handed setting.
3. **The helicopter on screen:** `chopperModel.js`, camera, helipad, downwash, rotor animation and the on-screen display.
4. **Menus and polish:** 2×2 mode grid, tips cards, history, storage, game over, sounds and debug.
5. **Docs and PR:** `SPEC.md` §4d, `README.md`, the new `CLAUDE.md` and `specs/CHANGE-SPEC-v1.5.md`. Then a privacy check (no external requests, the CSP is intact, only `swerve:v1` is stored, no personal info), and open the PR with the checklist.

---

## Ideas for later (add to `SPEC.md`, don't build)

- **Wind gusts** in Storm that push the helicopter sideways (fairness-tested).
- **Landing challenges:** set down gently on a pad mid-level for a big bonus.
- **Tail rotor pedals** (turning the nose) as an optional third control for experts.
