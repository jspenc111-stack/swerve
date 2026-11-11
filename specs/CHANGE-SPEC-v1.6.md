# Swerve v1.6.0 — Change spec: fuller Classic, sharper controls, new visuals

> **For Claude Code.** This spec builds on **v1.5.4** (on `main`). Read `CLAUDE.md` and `SPEC.md` first.
>
> - Work on one branch, **`claude/v1.6-polish`**, from the latest `main`, and open one pull request into `main`.
> - Make one commit per step (build order at the end), and run `node --test` after each step.
> - Set `APP_VERSION` to **`1.6.0`** in the first commit.
> - Replace `CLAUDE.md` with the updated `CLAUDE.md` that comes with this spec, and copy this file into the repo as `specs/CHANGE-SPEC-v1.6.md`.
> - Don't stop to ask questions. Make sensible choices and list them in plain language in the PR description. The owner approves the PR in the GitHub app; don't merge it yourself.

The owner asked for three things:

1. **Classic:** check that enough cubes appear to make it fun (Part 1).
2. **Controls:** optimize them as much as possible (Part 2).
3. **Visuals:** take a fresh look and make them cool (Part 3).

Part 1 and the Classic change in Part 2 were prototyped against v1.5.4 with exactly these values. All 302 tests passed, including every fairness test and the no-free-ride test.

---

## Part 1 — Classic: more cubes, and cubes that rush past close by

### What was measured (v1.5.4)

A careful test pilot that steers only when a cube is on a collision course, with the phone-sized view (band 62):

| Level | Dodges per 10 s | Cubes passing close per second | Longest quiet stretch |
|---|---|---|---|
| 1 Morning | 4.5 | 0.42 | 6.9 s |
| 2 Sunset | 6.9 | 0.76 | 5.1 s |
| 3 Lagoon | 5.0 | 0.41 | 8.4 s |
| 4 Gates | 9.0 | 1.03 | 4.9 s |
| 5 Night | 8.7 | 1.35 | 3.8 s |

**The problems:**
- Morning and Lagoon are thin: a cube passes close only about every 2.4 seconds.
- Lagoon is easier than Sunset, the level before it.
- Every level has quiet stretches of 4–8 seconds.

### Fix A — "Flank" cubes (`spawner.js`)

Add an optional `flank` setting to the `scatter` and `clusters` patterns, including inside `mixed`.

- `flank` is the average number of extra cubes per row placed **just beside the open lane**, on a random side. It is not scaled by the band.
- Count per row: the whole number, plus one more with probability equal to the remainder.
- Each flank cube sits at `laneAt(z) ± (laneClearance + 0.2 + random × 1.6)`, at a random `z` within the row.
- Flank cubes obey the same keep-out as every other cube, so **the open lane stays clear and fairness is unchanged**.
- They give the player something rushing past close by, and they outline the safe path.

In `scatterRow` and `clustersRow`, call it after the normal cubes are placed:

```js
if (pattern.flank > 0) flankCubes(sp, pattern.flank, z0);
```

### Fix B — Level values (`config.js`, Classic `pattern` only)

| Level | Now | New |
|---|---|---|
| 1 Morning | scatter 2.45 | `{ type: 'scatter', density: 2.9, swing: 4, flank: 0.15 }` |
| 2 Sunset | scatter 3.47 | `{ type: 'scatter', density: 3.7, swing: 4, flank: 0.18 }` |
| 3 Lagoon | clusters 0.82 | `{ type: 'clusters', chance: 0.95, min: 3, max: 6, swing: 5, flank: 0.2 }` |
| 4 Gates | between 1.53 | `between: 1.8` (everything else unchanged) |
| 5 Night | scatter 4.9 | `{ type: 'scatter', density: 4.9, swing: 5, flank: 0.12 }` |
| 6 Canyon | (unchanged) | (unchanged) |
| 7 Tilt | scatter 3.47; clusters 0.82 | scatter `{ density: 3.7, swing: 5, flank: 0.18 }`; clusters `{ chance: 0.95, min: 3, max: 6, swing: 5, flank: 0.2 }` |
| 8 Storm | scatter 4.49; clusters 0.92 | scatter `{ density: 4.6, swing: 6, flank: 0.2 }`; clusters `{ chance: 1.0, min: 3, max: 6, swing: 6, flank: 0.2 }` |

Don't change gate `rowSpacing`, `gapWidth`, any `swing`, or any `flight` or `heli` block. Document `flank` in the comment above `LEVELS`.

### Measured after the change (prototype)

| Level | Dodges per 10 s | Cubes passing close per second | Longest quiet stretch |
|---|---|---|---|
| 1 Morning | 6.6 | 0.58 | 5.7 s |
| 2 Sunset | 8.9 | 0.97 | 3.6 s |
| 3 Lagoon | 7.4 | 0.80 | 6.4 s |
| 4 Gates | 9.3 | 1.10 | 4.3 s |
| 5 Night | 9.4 | 1.74 | 2.5 s |
| 7 Tilt | 8.8 | 1.73 | 3.5 s |
| 8 Storm | 8.7 | 3.19 | 2.7 s |

The no-free-ride test passes with its current target ranges, so Morning is still a gentle start.

### New test — `tests/classic-action.test.js`

Add the reactive test pilot as a test, so Classic can't drift back to thin levels.

- **The pilot:**
  - It looks 0.9 seconds ahead.
  - When a cube is on a collision course, it picks the nearest clear line and steers to it.
  - Otherwise it doesn't steer.
- **The run:** each level from its start to its end, invincible, with band 62, averaged over 24 seeds.
- **Checks:**
  - every level has **at least 6 dodges per 10 seconds**;
  - every level has **at least 0.5 close passes per second** (a cube going by within 1.2 units of the ship's side);
  - Lagoon's close passes are at least 80% of Sunset's.

---

## Part 2 — Controls

The 3D Flight feel was tuned in v1.5.2–v1.5.4 and has its own Steering feel setting, so its handling values don't change here. This part removes the remaining rough edges in every mode.

### 2.1 Steady frame rate (all modes)

Uneven frame times make any control feel laggy, and Part 3 adds drawing work. So:

- **Auto quality.**
  - Track the average frame time over the last 60 frames while playing.
  - If it stays more than 25% above the screen's own frame time for 2 seconds, lower the drawing resolution one step: device pixel ratio 2 → 1.5 → 1.25.
  - If the frame time is still too slow at the lowest resolution, switch effects to Lite (see 3.7) for the rest of the run.
  - Step back up after 10 smooth seconds, at most once every 20 seconds, and never mid-crash.
  - Resize the canvas only when the step changes, never every frame.
- **No per-frame garbage.** The ship and jet currently create new gradient objects every frame.
  - Cache gradients and sprites.
  - Reuse arrays and objects in the draw loops.
  - Pool particles.
- **Debug view:** `?debug=1` shows the current resolution step and effects level next to the FPS.

Put the pure logic (the step-up and step-down decision) in a small module, `js/quality.js`, so it can be tested.

### 2.2 Classic: quicker turn-arounds (`game.js`, `config.js`)

- Add `classicReverseBoost: 1.8`.
- In `stepGame`, when the steer input points **against** the current sideways speed (`vx ≠ 0` and `sign(steer) ≠ sign(vx)`), acceleration is `steerAccel × classicReverseBoost`.
- Top speed, friction and normal acceleration are unchanged, so taps and holds feel the same. Only changing direction is faster.

| Full left → full right | Now | New |
|---|---|---|
| Stops sliding the old way | 204 ms | **112 ms** |
| Reaches 90% speed the new way | 383 ms | **292 ms** |

- **Ease the ship's lean.** The ship's roll and nose angle are currently set straight from its speed. Ease them the same way v1.5.4 eased the jet: add `shipLeanEase: 12`, look only. Otherwise the quicker turn-around makes the ship rock.

### 2.3 Classic drag control: the centre follows the thumb (`input.js`)

In `getSteer`'s drag mode, if the thumb is more than `dragRangePx` from where it started, slide the start point along so it's exactly that far behind. This is the same fix 3D Flight got in v1.5.3, and it means turning back responds at once. Hold-sides and tilt are unchanged.

### 2.4 3D Heli: the cyclic's centre follows the thumb (`input.js`)

Do the same for the 3D Heli joystick in `updateChopperControls`: on each axis separately, the stick's centre (`x0`, `y0`) is never more than `joystickRadiusPx` from the thumb. The ring is drawn at the centre, so it follows too. The collective lever is unchanged.

### 2.5 Depth cues that help steering (3D Flight and 3D Heli)

- Draw a **soft ground shadow under every floating block, pillar top, frame and drone**, as the jet already has.
- Shadows show how high things are, which makes lining up with gaps much easier.
- This is a drawing change only. Fade the shadows with the fog.

### 2.6 Not changed

- 3D Flight's Steering feel presets and speeds.
- The Helicopter cave physics (`heliGravity`, `heliLift`); the cave's fair path is built from them.
- Tilt control.
- Every fairness setting.

---

## Part 3 — Visuals

**Goal:** the game should look rich and alive at speed, with each level its own place. Today every level is a flat two-color sky, flat ground and flat-shaded cubes.

**Rules for all new visuals:**
- **Obstacles stay the clearest thing on screen.** Scenery sits in the sky or is low-contrast, and never looks like something you could hit.
- **Original art only**, drawn in code. No image files, fonts or external assets.
- **Config-driven.** Each level gets a `scene` block in `config.js` (documented above `LEVELS`), so looks can be tuned later.
- **Cheap to draw.** Static scenery is drawn once into an off-screen canvas and reused (see 3.1).

### 3.1 Skies and horizons (Classic, 3D Flight, 3D Heli)

New module **`js/scenery.js`**.

- For each level it draws the sky scene into an off-screen canvas, which is redrawn only when the level or screen size changes.
- Each frame the renderers draw that image behind the world. It shifts slightly sideways as you steer (parallax) and tilts with the bank.
- During a level change, cross-fade the old and new scenes over `paletteFadeSec`.

Each level's `scene` lists which elements it uses. Build these elements:

| Element | What it is |
|---|---|
| `sun` | A glowing disc on or near the horizon, with a soft halo. Options: size, height, color, and `bands: true` for horizontal stripes across the lower half. |
| `moon` | A pale disc or crescent with a faint halo. |
| `stars` | A seeded field of small dots, a few of them twinkling. Optional rare shooting star. |
| `clouds` | 2 layers of soft, flat cloud shapes that drift slowly. |
| `ridges` | 2–3 layers of distant hills, mountains or mesas on the horizon, each lighter with distance, with parallax. Options: jaggedness and height. |
| `haze` | A soft glow band along the horizon in the `skyHorizon` color. |
| `rain` | Slanted streaks falling across the view. They are animated, so they're drawn live rather than cached. |
| `bolt` | A forked lightning bolt drawn in the sky when the Storm lightning effect fires, fading in about 200 ms. The existing flash stays. |

**Starting scenes:**

| Level | Scene |
|---|---|
| 1 Morning | low pale sun with halo; 2 cloud layers; soft far hills; haze |
| 2 Sunset | big banded sun sitting on the horizon; dark mountain ridges in front of it; warm haze; a few thin clouds |
| 3 Lagoon | high small sun; puffy clouds; low distant islands; the ground is water (see 3.3) |
| 4 Gates | large pale moon; faint stars; smooth dune ridges |
| 5 Night | dense twinkling stars; crescent moon; rare shooting stars; glowing grid (see 3.3) |
| 6 Canyon | hazy sun; 3 layers of flat-topped mesas; dust (see 3.4) |
| 7 Tilt | drifting clouds at 2 depths; soft hills |
| 8 Storm | heavy dark cloud layers; rain; forked lightning bolts; wet ground (see 3.3) |

Colors come from the level palette. Add optional palette entries such as `sun` and `ridge` where needed, each with a sensible default mixed from the existing colors.

### 3.2 Cubes and blocks

- **Shading:**
  - The front face gets a gentle top-to-bottom gradient (lighter at the top).
  - A thin bright highlight runs along the top front edge.
  - The side face stays darker.
- **Variation:** each cube's brightness varies slightly (±6%), fixed per cube from its position, so a field doesn't look copy-pasted.
- **Ground contact:** a soft dark shadow under each cube, offset away from the level's sun or moon. Skip it for tiny far cubes.
- **Glow levels (Night):** keep the neon outline and add a soft glow on the ground under each cube.
- **Performance:** keep the existing far-cube shortcut (one flat rectangle). Precompute colors per fog step as now; don't create gradients per cube per frame. Use a small set of cached gradient sprites, or two-tone fills.
- **3D Flight and 3D Heli:** apply the same shading to blocks, pillars and frames. Rings get a slow shimmer.

### 3.3 Ground

- **Speed streaks:** short, faint lines on the ground that rush toward the camera near the ship. They are longer and brighter with speed and boost.
- **Horizon glow:** blend the ground into the haze color at the horizon.
- **Water (Lagoon):**
  - gentle sparkle glints that drift;
  - a faint, short mirror reflection under each cube;
  - a subtle wake behind the ship.
- **Neon grid (Night):** brighter grid lines that glow, with a pulse travelling toward the player.
- **Wet ground (Storm):** faint reflections under cubes, and rain splashes near the camera.
- **Dust (Canyon):** see 3.4.

### 3.4 Particles (shared, pooled)

New pure-logic module **`js/particles.js`**: a fixed-size pool with `spawn` and `update`, and no DOM, so it can be tested. The renderers draw from it.

It's used for:
- **Engine trail:**
  - a ribbon behind the Classic ship and the jet that **follows where the ship has been**, so it curves when you steer;
  - it's longer and brighter when boosting.
- **Wingtip trails:** thin white streaks from the wingtips during hard turns.
- **Near-miss sparks:** see 3.5.
- **Crash:** see 3.6.
- **Ambient:**
  - dust motes streaming past in Canyon;
  - a few drifting embers in Sunset;
  - sparkles when a ring is collected.

Caps: at most 300 particles on Full and 80 on Lite.

### 3.5 Near misses (Classic and 3D Flight)

- **Logic:** `game.js` (and `flight.js`) add an event `{ type: 'nearMiss', side }` when an obstacle passes the ship with less than `nearMissDistance` (0.45 units) of clearance without hitting. Each obstacle fires it once.
- **Feedback:**
  - a short burst of sparks on that side of the ship;
  - a quick synthesized "whoosh" (respecting the Sound setting);
  - no vibration.
- **No score change.** This is feel only.

### 3.6 Crashes

- **Classic** (today: only a flash and a shake):
  - the ship breaks into 10–14 spinning shards in the ship's colors;
  - a bright expanding shockwave ring spreads on the ground;
  - the cube that was hit bursts into a few smaller cube bits;
  - the last 150 ms before game over plays in slow motion.
- Keep the existing flash, shake, sound and vibration.
- `gameOverDelayMs` is unchanged, and "Play again" must still be instant.
- **3D Flight and 3D Heli:** the same shards and shockwave, in 3D.
- **Helicopter cave:** it already has a burst and smoke; add the shockwave ring.

### 3.7 Ship, boost and screen effects

- **Boost:**
  - the engine glow stretches into a flame;
  - faint speed lines streak inward from the screen edges;
  - the view widens by 4% (ease in and out), a look-only zoom that doesn't change where obstacles are.
- **Level change:** a soft ring of light sweeps out from the horizon as the banner appears.
- **Score:** a small "pop" when it passes each 100 points and on a new best.
- **Settings → "Visual effects: Full · Lite":**
  - **Full** (default) is everything above.
  - **Lite** keeps the new skies and cube shading, but turns off rain, ambient particles, reflections, speed lines and the boost zoom.
  - Stored as `settings.effects` (`'full'` or `'lite'`) in `swerve:v1`, read with an `effectsOf(save)` helper that returns `'full'` by default, like `flightFeelOf`.
- **Reduced motion:** if the phone has "reduce motion" switched on (`prefers-reduced-motion`), start on Lite and skip the slow motion and the boost zoom.

### 3.8 Helicopter cave

- **Depth:** a third, far parallax layer, plus slow floating dust motes in the air.
- **Light:**
  - a soft headlight cone ahead of the helicopter on Night and Storm;
  - a faint light rim on the cave edges nearest the helicopter.
- **Gems:** a soft glow around each gem and a brighter collect sparkle.
- **Walls:** subtle horizontal rock layers (strata) in the wall fill, drawn into a cached pattern.
- **Rain** on Storm and the **shockwave** on a crash, as above.

### 3.9 Menus

- The start-screen background preview shows the new scenery for the chosen level and mode.
- The level picker's buttons show each level's sky color and sun or moon, so levels are recognizable.
- Keep the layouts, large tap targets and portrait menus.

---

## Saved data and privacy

- **One new saved setting:** `settings.effects`, inside `swerve:v1` (the owner approves this addition). Nothing else new is stored.
- No network requests, no images or fonts loaded from anywhere, and the Content Security Policy stays intact.
- Old saves load unchanged and play on Full.

---

## Tests

**Classic field:**
- `flank` cubes never enter the lane keep-out.
- `flank` is optional and must be `≥ 0` (config check).
- Fairness cases `scatter (dense, flank)` (`density: 8, swing: 9, flank: 1`) and `clusters (flank)` pass at band 30 and band 62.
- `classic-action.test.js`, as described in Part 1.
- The free-ride test passes.

**Controls:**
- Classic: reversing uses the boosted rate; speeding up from rest and friction are unchanged.
- Classic drag: the centre follows the thumb, and turning back 80 px gives an input of about 0.
- 3D Heli cyclic: the centre follows per axis; diagonals still give full x and y; the lever is unaffected.
- `quality.js`: steps down after 2 slow seconds, steps up after 10 smooth seconds, never goes below the lowest step, and doesn't flip-flop.

**Visual logic (pure parts only):**
- `particles.js`: the pool never exceeds its cap, particles expire, and `update` moves and fades them.
- Near miss: fires once per obstacle inside `nearMissDistance`; doesn't fire on a hit or a wide pass.
- Every level has a valid `scene` block with known element names and valid colors.
- Storage: `effects` defaults to `'full'`, round-trips `'lite'` (saves and loads back the same), rejects invalid values, and old saves load.

**Everything else:** all existing tests pass, including fairness for all four modes.

---

## Docs

- **`SPEC.md`:**
  - Classic: `flank`, the new values and the action test.
  - Controls: reverse boost, eased lean, the follow-thumb drag and cyclic, and auto quality.
  - A new **Visuals** section covering Part 3.
  - Saved data: the `effects` setting.
- **`README.md`:** a short "what's new" line.
- **`CLAUDE.md`:** replace it with the new version.

---

## Manual checklist (put this in the PR description)

1. The start screen shows **v1.6.0**, and the background preview has the new sky.
2. **Classic, Morning:** more cubes, with cubes regularly rushing past close by. It's still a gentle first level.
3. **Classic, Lagoon and Night:** Lagoon is no longer quieter than Sunset; Night is busy but always has a way through.
4. **Classic steering:** a quick left-to-right change turns the ship around noticeably faster, and the ship doesn't rock.
5. **Each level looks like its own place:** sun, moon, stars, mountains, water, rain and lightning as listed. Cubes are still the clearest thing on screen.
6. **Near miss:** shave past a cube to see sparks and hear a whoosh. **Crash:** shards and a shockwave, then game over; Play again is instant.
7. **Boost:** flame, speed lines and a slight zoom.
8. **3D Flight and 3D Heli:** shadows under floating blocks make heights easier to judge. The 3D Heli stick's ring follows your thumb.
9. **Helicopter cave:** dust, gem glow, and a headlight on Night and Storm.
10. **Settings → Visual effects → Lite:** rain, particles and reflections switch off; the choice is remembered.
11. `?debug=1`: the frame rate stays smooth on Storm in every mode.

---

## Build order (one commit each, run `node --test` after each)

1. **Classic field:** `flank`, the level values, the fairness cases and the action test. Set `APP_VERSION` to 1.6.0.
2. **Controls:** Classic reverse boost and eased lean; the follow-thumb drag and cyclic; `quality.js` and auto quality; remove per-frame allocations; tests.
3. **Skies and cubes:** `scenery.js`, the level `scene` blocks, cube and block shading, ground shadows (including the 3D depth shadows from 2.5), and ground effects.
4. **Particles and feedback:** `particles.js`, trails, near misses, crashes, boost effects, the level-change ring and the score pop.
5. **Helicopter cave and menus:** 3.8 and 3.9, the Visual effects setting and storage, and reduced motion.
6. **Performance pass and PR:**
   - Check the frame rate on every level and mode, and tune particle caps if needed.
   - Update the docs.
   - Do a privacy check: only the one new local setting, no network, the CSP is intact, no personal info.
   - Open the PR with the checklist.

## Ideas for later (add to `SPEC.md`, don't build)

- Unlockable ship colors and trail styles.
- A photo mode that hides the on-screen display on the pause screen.
- Snappier lift for the Helicopter cave, if it ever feels sluggish. Its fair path is built from the lift values, so the cave would need re-testing.
