# Swerve v1.5.4 — Change spec: 3D Flight, finer control and a "Steering feel" setting

> **For Claude Code.** This spec builds on **v1.5.3** (on `main`). Read `CLAUDE.md` and `SPEC.md` first.
>
> - Work on one branch, **`claude/v1.5.4-flight-feel`**, from the latest `main`, and open one pull request into `main`.
> - Set `APP_VERSION` to **`1.5.4`**.
> - Replace `CLAUDE.md` with the updated `CLAUDE.md` that comes with this spec, and copy this file into the repo as `specs/CHANGE-SPEC-v1.5.4.md`.
> - **3D Flight only.** Classic, Helicopter and 3D Heli must not change.
> - Don't stop to ask questions. List your choices in plain language in the PR description. The owner approves the PR in the GitHub app; don't merge it yourself.

---

## The problem

After v1.5.3 the owner says 3D Flight is "too bouncy" and wants "finer control". There are two causes.

**1. The jet's lean isn't smoothed.**
- In `render3d.js`, the jet's bank and nose angle are set straight from its speed (`vx / flightMaxSteerSpeed × flightRollDeg`), with no easing.
- Since v1.5.3, speed can swing very fast (acceleration 90, × a 2.2 boost when braking or reversing). Every small thumb correction makes the jet visibly rock, and a turn-around flips its full 80° bank in about a tenth of a second.

**2. Small thumb moves are too strong.**
- The ring is 55 px, the stick response is linear (straight in proportion to thumb movement), and the top speed is 13.
- A 5 px nudge gives about 1.2 units/s of sideways speed, so precise adjustments are hard.

---

## Fix 1 — Smooth the jet's lean (look only)

- Add `flightAttitudeEase: 10` to `config.js`.
- Keep two eased "look" angles in the flight state, `f.bankLook` and `f.pitchLook`. Each step, ease them toward their targets (`vx / flightMaxSteerSpeed × flightRollDeg`, and the same for pitch) using `1 − exp(−flightAttitudeEase × dt)`.
- `render3d.js` draws the jet with these look angles.
- **This changes only the look.** Physics, the hitbox and the camera are unchanged.
- In the prototype, rocking from a slightly shaky thumb dropped by about 70%.

---

## Fix 2 — A softer middle on the stick (a response curve)

- Add `stickCurve(x, e) = sign(x) × ((1 − e)·|x| + e·|x|³)`.
- **Full deflection still gives full speed** (`stickCurve(±1) = ±1`), but small and medium moves become gentler and more precise.
- Apply it in `getFlightSteer` to the joystick's x and y, **and to tilt control** (its sideways and up/down axes), after clamping to −1…1.
- **Keyboard steering isn't curved:** it stays ±1.
- Put `stickCurve` in a pure-logic module (for example `flight.js`) so it can be tested.

---

## Fix 3 — A "Steering feel" setting: Fine, Medium or Quick

Add a choice so the owner can switch feel on the phone without waiting for a new version.

**Presets** (`config.js`):

```js
flightFeelPresets: {
  fine:   { ringPx: 65, curve: 0.6, accelScale: 0.83, boost: 1.6 },
  medium: { ringPx: 60, curve: 0.4, accelScale: 0.9,  boost: 1.8 },
  quick:  { ringPx: 55, curve: 0,   accelScale: 1.0,  boost: 2.2 }, // = v1.5.3
},
flightFeelDefault: 'fine',
```

**What each preset value does:**
- `ringPx` replaces `flightJoystickRadiusPx`. The centre still follows the thumb at this distance (v1.5.3 Fix 1).
- `curve` is the `e` in Fix 2.
- `accelScale` multiplies both `flightSteerAccel` (90) and `climbAccel` (80).
- `boost` replaces `flightReverseBoost`. It still applies to reversing **and** braking.

**Unchanged:** top speeds (`flightMaxSteerSpeed` 13, `flightMaxClimbSpeed` 10), friction, the ceiling and the course layout. **Fairness is unaffected:** full stick still reaches full speed in every preset.

**Wiring:**
- `main.js` looks up the chosen preset and passes it to `getFlightSteer` (for the ring and curve) and to `stepFlight` (for acceleration and boost). Don't change `CONFIG` itself.
- Changing the setting takes effect right away, even from the pause menu.

**Settings screen:**
- Add a row in the 3D Flight part: **"Steering feel: Fine · Medium · Quick"**, as a three-way switch.
- Help text: "Fine = precise small moves. Quick = fastest turns."

**Saved data** (the owner approves this one new setting):
- Store `settings.flightFeel` (`'fine'` / `'medium'` / `'quick'`) in `swerve:v1`, following the same pattern as `collectiveSide`: stored only when set, read with a `flightFeelOf(save)` helper that returns `'fine'` by default.
- Old saves load unchanged and play as Fine.
- Nothing leaves the phone.

---

## Measured in the prototype (sideways axis, top speed 13)

| | Quick (= v1.5.3) | Medium | **Fine (default)** |
|---|---|---|---|
| Speed from a 5 px nudge | 1.18 u/s | 0.65 u/s | **0.40 u/s** |
| Speed from a 15 px nudge | 3.55 u/s | 2.03 u/s | **1.30 u/s** |
| Thumb travel for half speed | 28 px | 40 px | **47 px** |
| Flick turn-around (full right → half speed left) | 138 ms | 175 ms | **196 ms** |
| Rocking from a slightly shaky thumb | 1.12° | 0.47° | **0.33°** |

For comparison, v1.5.2 took 238 ms to turn around. **Fine still turns around faster than v1.5.2** while being about three times more precise on small moves.

---

## Tests

- **`stickCurve`:** 0 → 0, ±1 → ±1, odd (symmetric), never decreasing; with `e = 0.6`, an input of 0.1 gives about 0.04.
- **Presets:**
  - All three exist with valid values (`ringPx > 0`, `0 ≤ curve < 1`, `0 < accelScale ≤ 1`, `boost ≥ 1`).
  - Quick equals the v1.5.3 values.
  - Full stick reaches full speed in every preset.
- **Joystick:**
  - With Fine, a 5 px drag gives a smaller input than with Quick.
  - The centre follows the thumb at the preset's `ringPx`.
  - Diagonals still give full x and y together.
- **Physics:** Fine speeds up more slowly than Quick (`accelScale`), and the braking and reversing boost uses the preset's `boost`.
- **Look smoothing:** after a sudden full reversal of speed, `bankLook` moves toward the new angle gradually rather than in one step. Physics speed is unaffected by the smoothing.
- **Storage:**
  - The default is `'fine'`, and `'medium'` / `'quick'` round-trip (save and load back the same).
  - Invalid values fall back to `'fine'`.
  - Old saves load.
- **Unchanged:**
  - Classic drag, 3D Heli's cyclic and the keyboard are unaffected.
  - All fairness tests (all four modes) and the free-ride test pass.

---

## Docs

- **`SPEC.md`** (3D Flight controls): the response curve, the look smoothing, the Steering feel setting and its presets, and the new saved setting.
- **`README.md`:** one line.
- **`CLAUDE.md`:** replace it with the new version.

---

## Manual checklist (put this in the PR description)

1. The start screen shows **v1.5.4**.
2. 3D Flight on **Fine** (the default): tiny thumb moves make tiny, smooth adjustments, and the jet no longer rocks on small corrections.
3. Full stick is still full speed. A hard flick still turns the jet around promptly.
4. Settings → Steering feel → **Quick**: it feels like v1.5.3. **Medium** sits in between. The choice is remembered after closing the app.
5. Tilt control (if used) also feels finer around the middle.
6. Classic, Helicopter and 3D Heli feel unchanged.

---

## Build order

1. **Logic:** `stickCurve`, the presets, the physics using the preset, look smoothing, and their tests. Set `APP_VERSION` to 1.5.4.
2. **Input and screen:** `getFlightSteer` uses the preset's ring and curve; the render draws the look angles; the Settings row; storage and its tests.
3. **Docs and PR:** `SPEC.md`, `README.md`, the new `CLAUDE.md` and `specs/CHANGE-SPEC-v1.5.4.md`. Then a privacy check (only the one new local setting, no network, the CSP is intact, no personal info), and open the PR with the checklist.
