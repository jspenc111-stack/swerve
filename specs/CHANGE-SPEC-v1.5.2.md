# Swerve v1.5.2 — Change spec: Classic +2%, snappier 3D Flight, taller 3D sky

> **For Claude Code.** This spec builds on **v1.5.1** (on `main`). Read `CLAUDE.md` and `SPEC.md` first.
>
> - Work on one branch, **`claude/v1.5.2-tuning`**, from the latest `main`, and open one pull request into `main`.
> - Make one commit per part, and run `node --test` after each part.
> - Set `APP_VERSION` to **`1.5.2`**.
> - Replace `CLAUDE.md` with the updated `CLAUDE.md` that comes with this spec, and copy this file into the repo as `specs/CHANGE-SPEC-v1.5.2.md`.
> - Don't stop to ask questions. List your choices in plain language in the PR description. The owner approves the PR in the GitHub app; don't merge it yourself.

All three parts were prototyped against v1.5.1 with exactly these values:
- every fairness test passed for all four modes;
- the no-free-ride test passed;
- the only failing tests were ones that check the old values on purpose (listed under "Tests to update").

---

## Part 1 — Classic: about 2% harder on every level

The owner likes v1.5.1 and wants "like 2% more" on all levels. This is a light touch made of two parts.

**1. Classic-only speed.**
- Add `classicSpeedFactor: 1.02` to the Classic section of `config.js`, with the comment "Classic runs at this multiple of the shared speed; 3D Flight and 3D Heli are not affected".
- In `game.js`, multiply **every** use of `levelBaseSpeed(game.info, cfg)` by `cfg.classicSpeedFactor`: run start, the per-frame speed, the level change, and the pre-fill.
- Don't change `baseSpeed` or `speedPerLevel`. 3D Flight and 3D Heli take their speed from those, and they must not change.

**2. 2% more cubes.** Classic `pattern` values only:

| Level | Change |
|---|---|
| 1 Morning | scatter `density` 2.4 → **2.45** |
| 2 Sunset | scatter `density` 3.4 → **3.47** |
| 3 Lagoon | clusters `chance` 0.8 → **0.82** |
| 4 Gates | gates `between` 1.5 → **1.53** |
| 5 Night | scatter `density` 4.8 → **4.9** |
| 6 Canyon | canyon `extra` 1.5 → **1.53** |
| 7 Tilt | scatter 3.4 → **3.47**; gates `between` 0.8 → **0.82**; clusters `chance` 0.8 → **0.82** |
| 8 Storm | scatter 4.4 → **4.49**; canyon `extra` 1.5 → **1.53**; gates `between` 1.2 → **1.22**; clusters `chance` 0.9 → **0.92** |

**Don't change** gate `rowSpacing` or any `swing`. In the prototype, nudging gate spacing reshuffled the mixed levels' layouts in unpredictable ways.

**No-free-ride test:** the owner has asked for harder, so if any level's median dips just under the 0.4 s floor, lower that floor to 0.3 s and say so in the PR, as `CLAUDE.md` allows.

---

## Part 2 — 3D Flight: more responsive controls

**The problem:** 3D Flight shares Classic's steering values. The jet takes about 0.18 s to reach full sideways speed and about 0.38 s to turn around from full left to full right. The joystick needs a 70 px thumb drag for full steering. The owner says it needs "a bit more responsiveness".

**Fix:** give 3D Flight its **own** control values. Classic and 3D Heli must not change.

| New / changed key | Value | Was (shared) | Meaning |
|---|---|---|---|
| `flightSteerAccel` | **90** | 55 (`steerAccel`) | how fast sideways speed builds |
| `flightMaxSteerSpeed` | **13** | 11 (`maxSteerSpeed`) | top sideways speed |
| `flightSteerFriction` | **10** | 7 (`steerFriction`) | how fast sideways drift stops when you let go |
| `climbAccel` | **80** | 45 | how fast up/down speed builds (already flight-only) |
| `flightMaxClimbSpeed` | **10** | 8 (`maxClimbSpeed`) | top up/down speed |
| `climbFriction` | **10** | 7 | how fast up/down drift stops (already flight-only) |
| `flightReverseBoost` | **1.8** | (new) | extra pull when you steer **against** your current movement, so the jet turns around quickly |
| `flightJoystickRadiusPx` | **55** | 70 (`joystickRadiusPx`) | thumb drag for full steering in 3D Flight |

**How to wire it:**
- **`flight.js`:** `approach()` gets an optional `reverseBoost` argument. When there's input and the current speed points the other way (`v ≠ 0` and `sign(input) ≠ sign(v)`), the step uses `accel × reverseBoost`. `stepFlight` uses the `flight…` values above, for both sideways and up/down.
- **Course layout doesn't change.** `flightSpawner.js` keeps laying out the open path with `maxSteerSpeed` (11) and `maxClimbSpeed` (8). The jet now has spare agility on the same courses, and fairness only gets easier.
- **`render3d.js`:** the bank and pitch look should divide by `flightMaxSteerSpeed` / `flightMaxClimbSpeed`, so the angles still top out at `flightRollDeg` / `flightPitchDeg`. Check anything else that reads the jet's speeds against the old maximums.
- **`input.js` and `render3d.js`:**
  - 3D Flight's joystick (`getFlightSteer`) and the ring drawn for it use `flightJoystickRadiusPx`.
  - **3D Heli's cyclic keeps `joystickRadiusPx` (70)**, unchanged.
- **Unchanged:** Classic's steering (`steerAccel`, `maxSteerSpeed`, `steerFriction`), Classic's tilt and drag settings, and 3D Heli.

**Measured in the prototype:**

| | Old | New |
|---|---|---|
| Sideways: time to full speed | 183 ms | **133 ms** |
| Sideways: turn-around | 383 ms | **208 ms** |
| Sideways: stop after letting go | 329 ms | **233 ms** |
| Sideways: distance moved in the first ¼ second | 1.67 | **2.34** units |
| Up/down: time to full speed | 163 ms | **117 ms** |
| Up/down: turn-around | 342 ms | **183 ms** |

---

## Part 3 — 3D Flight: more vertical space

The owner wants "a bit more space" up and down.

| Key | Was | New |
|---|---|---|
| `flightMaxAltitude` | 9 | **12** (ceiling) |
| `flightStartAltitude` | 3 | **4** |
| `chopperMaxAltitude` | (new) | **9**, so 3D Heli stays exactly as it is |

**Keep the sky just as busy.** Floating blocks are spread over the full height, so multiply each level's `floaters` density by about 1.35 (the extra height):

| Level | `floaters` density |
|---|---|
| 1 Morning | 1.8 → **2.4** |
| 2 Sunset | 2.7 → **3.6** |
| 5 Night | 3.6 → **4.9** |
| 7 Tilt | 2.9 → **3.9** |
| 8 Storm | 3.6 → **4.9** |

Pillars and frames reach the ceiling automatically, so leave them as they are. Rings already stay within the flying height.

**Keep 3D Heli unchanged** (it shares `flightMaxAltitude` today):
- `chopperConfig()` sets `flightMaxAltitude: config.chopperMaxAltitude`, so its course stays built for 9.
- `chopper.js` physics uses `cfg.chopperMaxAltitude` for its ceiling.
- The 3D Heli altimeter in `main.js` uses `chopperMaxAltitude`.
- The 3D Flight altimeter automatically uses the new ceiling.

**Check:**
- The ceiling-high obstacles are visible on screen.
- FPS stays around 60 with the extra floaters (`?debug=1`).

---

## Tests to update (they check old values on purpose)

- **`flight.test.js`:**
  - "sideways steering works like Classic": rewrite as "3D Flight steering uses its own quicker values", checking `flightMaxSteerSpeed` and that the reverse boost makes turning around faster than speeding up from rest.
  - "altitude stays between the ground and the ceiling": clear the course first (`clearAhead`), because the longer climb to 12 now reaches real obstacles.
- **`chopper.test.js`:** "climbing eases in…" and "the ceiling just stops the climb" use `chopperMaxAltitude` instead of `flightMaxAltitude`.
- **`game.test.js`:** the speed tests (start speed, level jump, frame-time cap, start at any level) expect `levelBaseSpeed × classicSpeedFactor`.

## New tests

- Classic speed is ×1.02, and 3D Flight's and 3D Heli's speeds are **unchanged** (compare them with `baseSpeed × flightSpeedFactor` and with `chopperTopSpeed`).
- The 3D Flight joystick reaches full deflection at 55 px; the 3D Heli cyclic still needs 70 px.
- The 3D Flight ceiling is 12. The 3D Heli ceiling and course are still 9.
- `flightSpawner` lays out 3D Flight's open path with the course values (11 / 8), not the jet's new maximums.
- **All existing fairness tests (all four modes) and the free-ride test pass.**

---

## Docs

- **`SPEC.md`:**
  - the Classic speed factor;
  - 3D Flight's own control values, reverse boost and joystick size;
  - the new ceiling;
  - 3D Heli's own ceiling.
- **`README.md`:** one line.
- **`CLAUDE.md`:** replace it with the new version.

---

## Manual checklist (put this in the PR description)

1. **Classic:** feels a touch faster and busier on every level, and is still fair. The start screen shows **v1.5.2**.
2. **3D Flight:** small thumb moves now steer clearly, and flicking the stick the other way turns the jet around quickly. Letting go stops the drift sooner.
3. **3D Flight:** you can climb noticeably higher (the altimeter goes to the new ceiling), and the higher sky still has obstacles in it.
4. **3D Heli:** feels exactly the same as before (same ceiling, same stick).
5. **Helicopter (cave):** unchanged.
6. `?debug=1`: about 60 fps in 3D Flight on Storm.

---

## Build order (one commit each, run `node --test` after each)

1. **Classic +2%:** Part 1, the game-test updates and the new speed tests. Set `APP_VERSION` to 1.5.2.
2. **Snappier 3D Flight:** Part 2, the flight-test update and the joystick and layout tests.
3. **Taller 3D sky:** Part 3, the chopper-test updates and the ceiling tests. Then an FPS check.
4. **Docs and PR:** `SPEC.md`, `README.md`, the new `CLAUDE.md` and `specs/CHANGE-SPEC-v1.5.2.md`. Then a privacy check (no new stored data, no network, the CSP is intact, no personal info), and open the PR with the checklist.
