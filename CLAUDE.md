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
  - **Each mode has its own speed and control settings. Changing one mode's feel must not change another's.**
    - Classic: `classicSpeedFactor`, `steerAccel`/`maxSteerSpeed`/`steerFriction`, tilt and drag.
    - 3D Flight: `flightSteerAccel`/`flightMaxSteerSpeed`/`flightSteerFriction`, `climbAccel`/`flightMaxClimbSpeed`/`climbFriction`, `flightReverseBoost`, `flightJoystickRadiusPx` and `flightMaxAltitude`.
      - `flightReverseBoost` is the extra pull when reversing **or** braking.
      - The 3D Flight joystick's centre follows the thumb, separately on each axis, so it's never more than `flightJoystickRadiusPx` away. Keep it per axis, so full sideways and full up/down still work together on a diagonal.
      - If the owner says direction changes feel slow, these are the settings to adjust.
    - 3D Heli: the `chopper…` values, `joystickRadiusPx` and `chopperMaxAltitude`.
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
- Debug view: open the site with `?debug=1`. It shows FPS, hitboxes, the invincible toggle and level skip; in Helicopter and 3D Heli, also the open path; in 3D Heli, also the lever, stick and multiplier values.
- Live site: `https://<github-username>.github.io/swerve/`
