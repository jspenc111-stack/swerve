# CLAUDE.md — Swerve

Rules for any Claude Code session working in this repo. Read `SPEC.md` for the full design. Change specs live in `specs/`.

## What this is
Swerve is a personal one-player arcade game with three modes:
- **Classic**: steer an arrow across a field and dodge cubes.
- **3D Flight**: fly a jet up, down and around 3D obstacles, and shoot drones.
- **Helicopter**: a side-view cave; hold to rise, let go to drop.

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
  - Each level has `pattern` (Classic), `flight` (3D Flight) and `heli` (Helicopter) blocks.
  - "Make it harder/easier" means changing obstacle settings and speeds, **never** the fairness settings listed under Hard rules.
- New obstacle patterns go in the mode's spawner, with a fairness test:
  - `js/spawner.js` for Classic,
  - `js/flightSpawner.js` for 3D Flight,
  - `js/caveSpawner.js` for Helicopter.
- Keep game logic free of DOM and canvas code, so it stays testable in Node. The game logic files are `game.js`, `flight.js`, `heli.js`, `levels.js`, `spawner.js`, `flightSpawner.js`, `caveSpawner.js` and `collision.js`.
- Drawing: Classic in `render.js`, 3D Flight in `render3d.js`, Helicopter in `renderHeli.js`. `main.js` runs all three modes.

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
  - Every obstacle pattern must leave a passable gap: `minGapWidth`, plus `minGapHeight` in 3D Flight and `heliMinGap` in Helicopter.
  - The fairness tests must cover every pattern.
  - In 3D Flight, drones count as obstacles and must stay out of the open path.
  - In Helicopter, the open path must respect the slope and bend limits, and the autopilot test must survive every level.
  - Don't loosen these settings to make the game harder: the fairness ones listed above, the hitbox scales, `laneLeash`/`laneSlopeFactor`/`flightLaneLeashY`, and `caveSlopeFactor`/`caveCurveFactor`.
- Original content only. Don't use names, art, sounds or text from Cubefield, Cube Runner, any existing helicopter game, or other existing games.
- The service worker stays **network-first with cache fallback**. Don't switch to cache-first, or the owner gets stuck on old versions.
- Menus are portrait. Only a Helicopter run asks for landscape, and it must still be playable upright.

## Quick reference
- Run tests: `node --test`
- Debug view: open the site with `?debug=1` (FPS, hitboxes, invincible, level skip; in Helicopter mode, also the open path)
- Live site: `https://<github-username>.github.io/swerve/`
