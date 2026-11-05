# Swerve v1.5.1 — Change spec: Classic, no more free rides

> **For Claude Code.** This spec needs **v1.5.0 (3D Heli) already merged into `main`**. Read `CLAUDE.md` and `SPEC.md` first.
>
> - Work on one branch, **`claude/classic-no-free-ride`**, from the latest `main`, and open one pull request into `main`.
> - Make one commit per step, and run `node --test` after each step.
> - Set `APP_VERSION` to **`1.5.1`**.
> - Replace `CLAUDE.md` with the updated `CLAUDE.md` that comes with this spec, and copy this file into the repo as `specs/CHANGE-SPEC-v1.5.1.md`.
> - **This change is for Classic only.** 3D Flight, Helicopter and 3D Heli must behave exactly as before; their tests must pass unchanged. Don't change any shared setting they use, such as `breatherBefore`, `breatherAfter` or `fogDistance`.
> - Don't stop to ask questions. List your choices in the PR description, in plain language. The owner approves the PR in the GitHub app; don't merge it yourself.

---

## The problem (measured on v1.4.0)

The owner says levels 1–5 are too easy: "you can just fly straight for large portions", and the sides of the course look empty.

**Coasting test:** a pilot that **never steers**, timed from when the first cube reaches the ship, with the median over 60 seeds:

| Level | Survives (median) |
|---|---|
| 1 Morning | 4.5 s |
| 2 Sunset | 3.6 s |
| 3 Lagoon | 3.1 s |
| 4 Gates | 0.6 s |
| 5 Night | 2.7 s |

**Three causes:**

1. **The open path drifts too gently.** The path is the guaranteed clear strip that the fairness rule keeps open. It wanders slowly, so it often runs along the player's straight line, and doubling the cubes barely helps (Morning only drops to 3.3 s).
2. **The sides are empty.** Cubes only appear within `spawnBandHalfWidth` (30) of the ship, but in portrait the camera sees about **60 units** to each side at the fog distance. The far left and right of the view are always bare.
3. **Every run starts with about 6 seconds of empty ground.** The field only fills from the fog distance (110) onward, and the level-start breather comes on top of that.

---

## Fix 1 — A swinging open path (`swing`, in `spawner.js`)

This adds an optional `swing` setting to the `scatter` and `clusters` patterns, including inside `mixed`. When it's set, the open path **keeps moving away from the player's current line**, so flying straight soon runs into the field.

This exact algorithm was prototyped against v1.4.0. All fairness tests passed, including new extra-hard swing cases.

- The spawner keeps a goal position for the path, `goalX`. Reset it to "none" in `resetSpawner`.
- **Picking a goal:** when there's no goal yet, or the path is within 0.75 units of it, pick a new goal **on the other side of the player's line**:
  - `side` = −1 if the path is right of the player, +1 if it's left of the player, and random if exactly level;
  - `goalX = playerX + side × swing × (0.7 + 0.3 × random)`.
- **Every row**, before `advanceLane`, set the path's target slope to `clamp((goalX − laneX) × 0.25, −maxSlope, +maxSlope)`. This replaces `wander(sp, 0.2)` for that row.
- Everything that keeps the game fair stays exactly as it is: `maxSlope`, the slope-change limit, the leash and the keep-out area. **Fairness is unchanged.**
- Patterns without `swing` keep the old gentle wander. Gates and canyon are unchanged (gates already alternate sides).
- **Rule:** `0 < swing ≤ laneLeash − 1`, so the goal is always inside the leash.

---

## Fix 2 — Fill the whole view (no empty sides)

**Size the area where cubes appear (the band) from the real view:**
- `main.js` works out how far the camera can see to each side at the fog distance, from the canvas width, the focal length and `fogDistance + cameraBack`.
- It multiplies that by 1.15 (to cover the bank and Tilt-level roll) and adds `maxSteerSpeed × 1` second (to cover steering).
- It passes the result to the spawner as the band half-width. `spawnBandHalfWidth` (30) becomes the **minimum**.
- The spawner stays pure logic: it receives the number and never touches the screen. Tests use the default.

**Keep cubes just as close together near you** (the same density per area). The settings keep their current meaning, "per 60 units of width", and the counts scale with the band:
- **scatter:** cubes per row = `density × band ÷ 30`.
- **gates `between`, canyon `extra` and clusters `chance`:** islands per row = `chance × band ÷ 30`. Use the whole number, plus one more with probability equal to the remainder.

**Cleanup:** remove cubes more than `band + 20` to the side.

**Performance:** keep a steady 60 fps on the Pixel 10. Cubes smaller than about 4 px on screen can be drawn as a single flat rectangle, and cubes fully hidden in the fog can be skipped. Check the FPS with `?debug=1`.

---

## Fix 3 — Start with a full field

- When a Classic run starts (and for the menu preview), **pre-fill** the field right away, from the end of the level-start breather out to the fog distance.
- Only the normal level-start breather (`breatherAfter`, about 2 s) stays empty. This replaces about 6 s of empty ground, and the field looks full from the first frame.
- The "nothing pops up in front of you" rule still holds, because these cubes exist before play begins.
- Mid-run level changes keep their breathers as they are now.

---

## Fix 4 — Classic level values (`config.js`, `pattern` only)

These values were tested in the prototype. Don't change any `flight` or `heli` blocks.

| Level | Now (v1.4/1.5) | New |
|---|---|---|
| 1 Morning | scatter `density` 1.8 | `{ type: 'scatter', density: 2.4, swing: 4 }` |
| 2 Sunset | scatter 2.9 | `{ type: 'scatter', density: 3.4, swing: 4 }` |
| 3 Lagoon | clusters `chance` 0.66, 3–5 | `{ type: 'clusters', chance: 0.8, min: 3, max: 6, swing: 5 }` |
| 4 Gates | gates 16 / 2.9 / 4 posts / between 1 | `{ type: 'gates', rowSpacing: 15, gapWidth: 2.9, wingCubes: 5, between: 1.5 }` |
| 5 Night | scatter 4.0 | `{ type: 'scatter', density: 4.8, swing: 5 }` |
| 6 Canyon | extra 0.7 | `extra: 1.5` (fills outside the walls; looks only) |
| 7 Tilt | scatter 3.1; clusters 0.66 | scatter `{ density: 3.4, swing: 5 }`; clusters `{ chance: 0.8, min: 3, max: 6, swing: 5 }` |
| 8 Storm | scatter 3.8; canyon extra 0.9; clusters 0.77 | scatter `{ density: 4.4, swing: 6 }`; canyon `extra: 1.5`; clusters `{ chance: 0.9, min: 3, max: 6, swing: 6 }` |

**Expected coasting times after the change** (prototype, default band):

| Level | Median |
|---|---|
| 1 Morning | 2.5 s |
| 2 Sunset | 1.9 s |
| 3 Lagoon | 1.3 s |
| 4 Gates | 0.7 s |
| 5 Night | 0.9 s |
| 6 Canyon | 2.0 s |
| 7 Tilt | 0.6 s |
| 8 Storm | 0.9 s |

Document `swing` in the comment above `LEVELS`: "how far the open path swings away from your line (units, at most laneLeash − 1); bigger = you must steer more".

---

## Tests

1. **New `tests/free-ride.test.js` ("no free rides"):**
   - For every Classic level: 60 seeds, no steering, no boost, timed from when the first cube reaches the ship.
   - The **median must be between 0.4 s and 3.0 s**, and **Morning between 1.5 s and 3.5 s**, so level 1 stays a gentle start.
   - Run it at the default band and at a wide band (62). The wide band's medians must be within 25% of the default's, which proves Fix 2 keeps the difficulty the same.
2. **Fairness (`tests/fairness.test.js`):**
   - Add the patterns `scatter (dense, big swing)` (`density: 8, swing: 9`) and `clusters (swing)` (`chance: 1, min: 3, max: 6, swing: 9`).
   - Run every pattern at the default band **and** at band 62.
3. **Config:** `swing` is optional, and when present `0 < swing ≤ laneLeash − 1`.
4. **Pre-fill:**
   - After a Classic reset, cubes already exist out to the fog distance, and none are inside the start breather.
   - Nothing new ever spawns closer than the fog distance during play.
5. **No side effects:** all existing 3D Flight, Helicopter and 3D Heli tests pass unchanged.

---

## Docs

- **`SPEC.md`:** describe `swing`, the view-sized band and the pre-filled start in the Classic sections (§6 and §7), and add the no-free-ride test to §11.
- **`README.md`:** one line about the harder Classic start.
- **`CLAUDE.md`:** replace it with the new version.

---

## Manual checklist (put this in the PR description)

1. Classic, level 1: the field is full from the first second (no long empty run-in), and you have to steer within a few seconds. It still feels like a warm-up.
2. Levels 2–5: you can't hold a straight line for long; the clear path keeps moving away from you.
3. Look at the far left and right of the screen: cubes fill all the way to the edges and the horizon.
4. Gates and Canyon: the area outside the fences and walls has cubes too.
5. `?debug=1`: FPS stays around 60 on every level.
6. 3D Flight, Helicopter and 3D Heli feel exactly the same as before.

---

## Build order (one commit each, run `node --test` after each)

1. **Swing:** `swing` in `spawner.js`, the config values (Fix 4), the swing fairness cases, the config check and the free-ride test. Set `APP_VERSION` to 1.5.1.
2. **Full view:** the view-sized band, count scaling, cleanup and the wide-band test runs.
3. **Full start:** the pre-filled start and its tests, then a performance pass.
4. **Docs and PR:** `SPEC.md`, `README.md`, the new `CLAUDE.md` and `specs/CHANGE-SPEC-v1.5.1.md`. Then a privacy check (no new stored data, no network, the CSP is intact), and open the PR with the checklist.

## Ideas for later (add to `SPEC.md`, don't build)

- The same "swinging path" for 3D Flight and 3D Heli, if they feel too easy to fly straight.
