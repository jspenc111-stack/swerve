# CLAUDE.md — Swerve

Rules for any Claude Code session working in this repo. Read `SPEC.md` for the full design. Change specs live in `specs/`.

## What this is
Swerve is a personal one-player arcade game with four modes:
- **Classic**: steer an arrow across a field and dodge cubes.
- **3D Flight**: fly a jet up, down and around 3D obstacles, and shoot drones.
- **Helicopter**: a side-view cave; hold to rise, let go to drop. Its id in code is `heli`.
- **3D Heli**: a two-thumb helicopter on the 3D Flight courses. The left thumb is the collective (lift, and it stays put); the right thumb is the cyclic (fly forward and slide). Its id in code is `chopper`.

It's a PWA hosted on GitHub Pages and played on an Android phone (Pixel 10). The owner is **not a developer**.

## How to work
- Always work on a **new branch** and open a **pull request**. Never push directly to `main`. The owner approves PRs in the GitHub mobile app; don't merge them yourself.
- Run `node --test` before every commit. Don't open a PR with failing tests.
- **Bump `APP_VERSION` in `js/config.js` on every change.** The service worker cache name uses it, and the start screen shows it. This is how the owner knows an update arrived.
- Write PR descriptions in **plain language**:
  - what changed,
  - how to try it on the phone,
  - anything the owner must do by hand.

  Briefly explain any technical term you use.
- Don't stop to ask questions for small decisions. Choose sensibly and note the choice in the PR.

## Where changes go
- **Tuning requests** go in `js/config.js` only, whenever possible. Examples: faster/slower, easier/harder, new colors, a new level, a different level order.
  - Each level has `pattern` (Classic), `flight` (3D Flight, also used by 3D Heli) and `heli` (Helicopter) blocks.
  - 3D Heli's feel lives in the `chopper…` values.
  - "Make it harder/easier" means changing obstacle settings and speeds, **never** the fairness settings listed under Hard rules.
  - In Classic, the main difficulty settings are `density` (how many cubes) and `swing` (how far the open path swings away from your line, so you must steer), plus `classicSpeedFactor` (Classic-only speed). Make the game harder or easier with these.
    - `flank` adds cubes just beside the open path, so cubes rush past close by. Use it when a level feels empty or quiet; it adds excitement without blocking the path.
    - The `classic-action` test checks that every level gives the player enough to do (dodges and close passes). If the owner asks for a calmer or busier Classic, change its targets to match, and say so in the PR.
  - **Each mode has its own speed and control settings. Changing one mode's feel must not change another's.**
    - Classic: `classicSpeedFactor`, `steerAccel`/`maxSteerSpeed`/`steerFriction`, `classicReverseBoost` (quicker turn-arounds), `shipLeanEase` (look only), tilt and drag. In drag mode the centre follows the thumb.
    - 3D Flight: `flightSteerAccel`/`flightMaxSteerSpeed`/`flightSteerFriction`, `climbAccel`/`flightMaxClimbSpeed`/`climbFriction`, `flightReverseBoost`, `flightJoystickRadiusPx` and `flightMaxAltitude`.
      - **The steering feel comes from `flightFeelPresets`** (`fine`, `medium` and `quick`), which the owner chooses in Settings (default `fine`). Each preset sets:
        - `ringPx`: the joystick size, which replaces `flightJoystickRadiusPx`;
        - `curve`: the softer middle on the stick;
        - `accelScale`: multiplies `flightSteerAccel` and `climbAccel`;
        - `boost`: the extra pull when reversing **or** braking, which replaces `flightReverseBoost`.
      - The joystick's centre follows the thumb, separately on each axis, so it's never more than `ringPx` away. Keep it per axis, so full sideways and full up/down still work together on a diagonal.
      - The jet's bank and nose angles are eased (`flightAttitudeEase`, look only).
      - **Tuning feel:** "too slow to turn" → raise `boost` or `accelScale`, or lower `ringPx`. "Too twitchy or bouncy, or not precise enough" → raise `curve` or `ringPx`, or lower `boost`. Change the preset the owner uses (Fine unless they say otherwise), and keep Quick equal to the v1.5.3 feel.
    - 3D Heli: the `chopper…` values, `joystickRadiusPx` and `chopperMaxAltitude`. The cyclic's centre follows the thumb, per axis.
    - **Whenever a control gets quicker, ease the matching look angle** (lean, bank, nose). Otherwise the craft visibly rocks and feels "bouncy".
    - `baseSpeed` and `speedPerLevel` are shared by every mode except Helicopter.
  - 3D Flight's course is laid out with `maxSteerSpeed`/`maxClimbSpeed` (the course values), not the jet's own maximums. Making the jet more agile doesn't change the courses.
- New obstacle patterns go in the mode's spawner, with a fairness test:
  - `js/spawner.js` for Classic,
  - `js/flightSpawner.js` for 3D Flight and 3D Heli,
  - `js/caveSpawner.js` for Helicopter.
- Keep game logic free of DOM and canvas code, so it stays testable in Node. The game logic files are `game.js`, `flight.js`, `heli.js`, `chopper.js`, `levels.js`, `spawner.js`, `flightSpawner.js`, `caveSpawner.js` and `collision.js`.
- Drawing:
  - Classic in `render.js`;
  - 3D Flight and 3D Heli in `render3d.js` (the helicopter model is in `chopperModel.js`);
  - Helicopter in `renderHeli.js`.

  `main.js` runs all four modes.
- **Visuals:**
  - Each level's look is its `scene` block and palette in `config.js`. Change looks there first.
  - Skies and horizons are in `scenery.js`. They're drawn once into an off-screen canvas and reused; only animated things (rain, lightning bolts) are drawn live.
  - Particles (trails, sparks, crash shards, dust) use the pooled, pure-logic `particles.js`.
  - `quality.js` lowers the drawing resolution, then the effects, if the frame rate drops.
  - The owner's "Visual effects" setting is Full or Lite. Every new effect must say what it does on Lite.
- A change to `flightSpawner.js` affects both 3D Flight and 3D Heli. Run both modes' fairness tests.

## Hard rules
- Plain HTML, CSS and JS only: no frameworks, no build step, no npm runtime dependencies.
- **Relative paths only** (`./…`). The site is served from a subfolder (`/swerve/`).
- **Privacy**:
  - No analytics, trackers, ads or crash reporting.
  - No external scripts, fonts or CDNs.
  - No network requests beyond the app's own files.
- Keep the Content Security Policy in `index.html` intact.
- The only stored data is the `swerve:v1` key in localStorage: best score and level per mode, settings, and score history. Don't add more without the owner's say-so.
- **Visual rules:**
  - Obstacles must stay the clearest thing on screen. Scenery sits in the sky or is low-contrast, and must never look like something you could hit.
  - All art is drawn in code: no image files, fonts or other assets.
  - Don't create gradients, arrays or objects every frame in the draw loops. Cache and reuse them.
  - Effects never change the rules. Near-miss sparks, zooms and slow motion are look and sound only: no score, speed or hitbox changes.
  - Keep a smooth frame rate on the Pixel 10 on every level and mode. Check with `?debug=1` after any visual change.
- The repo is **public**. Never commit personal information (names, emails, locations, anything about the owner).
- **Fairness: there is always a way through.**
  - Every obstacle pattern must leave a passable gap: `minGapWidth`, plus `minGapHeight` in 3D Flight and 3D Heli, and `heliMinGap` in Helicopter.
  - The fairness tests must cover every pattern.
  - In 3D Flight, drones count as obstacles and must stay out of the open path.
  - In Helicopter and 3D Heli, the autopilot test must survive every level. In 3D Heli it flies at top speed using only the two thumb controls.
  - In 3D Heli, the hitbox **including the rotor** must fit within 80% of the minimum gap.
  - In Classic, `swing` must be at most `laneLeash − 1`. The band where cubes appear must cover the whole visible field, with counts scaled so the density stays the same.
  - Don't loosen these settings to make the game harder: the fairness ones listed above, the hitbox scales, `laneLeash`/`laneSlopeFactor`/`flightLaneLeashY`, and `caveSlopeFactor`/`caveCurveFactor`.
- **No free rides in Classic.** The `free-ride` test checks that a pilot who never steers can't coast for long. If the owner asks for easier or harder Classic levels, change the target range in that test to match, and say so in the PR.
- Original content only. Don't use names, art, sounds or text from Cubefield, Cube Runner, any existing helicopter game, real helicopter models, or other existing games.
- The service worker stays **network-first with cache fallback**. Don't switch to cache-first, or the owner gets stuck on old versions.
- Menus are portrait. Only Helicopter and 3D Heli runs ask for landscape, and both must still be playable upright.

## Quick reference
- Run tests: `node --test`
- Classic changes must not change 3D Flight, Helicopter or 3D Heli. Shared settings (`breatherBefore`, `breatherAfter`, `fogDistance`) affect all of them.
- Debug view: open the site with `?debug=1`. It shows FPS, the resolution step and effects level, hitboxes, the invincible toggle and level skip; in Helicopter and 3D Heli, also the open path; in 3D Heli, also the lever, stick and multiplier values.
- Live site: `https://<github-username>.github.io/swerve/`
