# Swerve v1.5.3 — Change spec: 3D Flight, quicker direction changes

> **For Claude Code.** This spec builds on **v1.5.2** (on `main`). Read `CLAUDE.md` and `SPEC.md` first.
>
> - Work on one branch, **`claude/v1.5.3-flight-reverse`**, from the latest `main`, and open one pull request into `main`.
> - Set `APP_VERSION` to **`1.5.3`**.
> - Replace `CLAUDE.md` with the updated `CLAUDE.md` that comes with this spec, and copy this file into the repo as `specs/CHANGE-SPEC-v1.5.3.md`.
> - **3D Flight only.** Classic, Helicopter and 3D Heli must not change.
> - Don't stop to ask questions. List your choices in plain language in the PR description. The owner approves the PR in the GitHub app; don't merge it yourself.

This was prototyped against v1.5.2 with exactly these changes, and all 266 tests passed.

---

## The problem

After v1.5.2 the owner says 3D Flight is "slightly too unresponsive when changing direction".

**Main cause: the joystick's centre never moves.**
- It stays where the thumb first touched.
- Players usually push past the edge of the 55 px ring. The jet is already at full turn, but the thumb ends up 90–110 px out.
- To change direction, the thumb has to travel all the way back past the first-touch point. For the first part of that trip the stick still reads "full right", so nothing happens.

**Second cause: easing off doesn't slow the jet quickly.** Moving the thumb back toward the middle, but not past it, only slows the jet at normal acceleration. The quick "reverse boost" only starts once the stick crosses to the other side.

---

## Fix 1 — The stick's centre follows the thumb (`input.js`, 3D Flight only)

In `getFlightSteer`, after reading the pointer and before working out `x` and `y`, check **each axis separately**:
- if the thumb is more than `flightJoystickRadiusPx` from the centre on that axis, slide the centre (`p.startX` / `p.startY`) along so it's exactly that far away;
- the joystick ring is drawn at the centre, so it follows too.

Then:
- **Turning back responds at once.** Full deflection the other way is never more than two ring-widths of thumb travel.
- **Do it per axis, not as a circle.** Full sideways and full up/down must still work together on a diagonal (the course is laid out assuming both).
- **Scope:** only 3D Flight's joystick. Classic's drag control (`getSteer`) and the 3D Heli cyclic are unchanged.

---

## Fix 2 — Quick braking, and a slightly stronger turn-around (`flight.js`, `config.js`)

- **`approach()`:** also use the boosted pull when the jet is **slowing down in the same direction**. That is when there is input, the input points the same way as the current speed, and `|input × max| < |v|`. Steering against your movement (reversing) already gets it.
- **`flightReverseBoost`:** 1.8 → **2.2**. It now covers both reversing and braking; update its comment to say so.
- **Unchanged:** the ring size (55 px), top speeds and the course layout values.

---

## Measured in the prototype

A thumb holds full right, then sweeps to full left.

| Thumb movement | | v1.5.2 | v1.5.3 |
|---|---|---|---|
| Steady sweep (500 px/s, starting 90 px out) | stops drifting right | 200 ms | **112 ms** |
| | moving left at half speed | 271 ms | **183 ms** |
| Quick flick (900 px/s, starting 110 px out) | stops drifting right | 171 ms | **67 ms** |
| | moving left at half speed | 238 ms | **138 ms** |

---

## Tests

**Input:**
- In 3D Flight, a thumb dragged far past the ring (for example 120 px right) moves the centre so it's 55 px behind. Moving the thumb back 55 px gives an input of about 0, and back 110 px gives −1.
- The same works on the up/down axis.
- A diagonal drag still gives x = ±1 and y = ±1 together.
- Classic drag steering and the 3D Heli cyclic are unchanged: their centres don't move.

**Physics:**
- Easing the stick from 1 to 0.3 slows the jet at the boosted rate.
- Reversing still uses the boosted rate.
- Speeding up from rest uses the normal rate.
- Letting go still uses friction.

**Everything else:** all existing tests, including the fairness tests for all four modes and the free-ride test, still pass.

---

## Docs

- **`SPEC.md`** (3D Flight controls): the centre follows the thumb, and the boost applies to braking as well as reversing.
- **`README.md`:** one line.
- **`CLAUDE.md`:** replace it with the new version.

---

## Manual checklist (put this in the PR description)

1. The start screen shows **v1.5.3**.
2. 3D Flight: push the stick hard right, then flick left. The jet should swing left almost immediately, even if your thumb was well past the ring.
3. Ease the thumb partway back toward the middle: the jet slows its drift quickly.
4. The ring follows your thumb when you push past it.
5. Diagonal moves (up-right and so on) still turn and climb at full strength together.
6. Classic, Helicopter and 3D Heli feel unchanged.

---

## Build order

1. **Fixes:** Fix 1 and Fix 2, plus their tests. Set `APP_VERSION` to 1.5.3.
2. **Docs and PR:** `SPEC.md`, `README.md`, the new `CLAUDE.md` and `specs/CHANGE-SPEC-v1.5.3.md`. Then a privacy check (no new stored data, no network, the CSP is intact, no personal info), and open the PR with the checklist.

## Idea for later (add to `SPEC.md`, don't build)

- The same "centre follows the thumb" joystick for the 3D Heli cyclic, if it ever feels slow to change direction.
