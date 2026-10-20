# CLAUDE.md — Swerve

Rules for any Claude Code session working in this repo. Read `SPEC.md` for the full design.

## What this is
Swerve is a personal one-player arcade game: steer an arrow across a field and dodge cubes. It's a PWA hosted on GitHub Pages and played on an Android phone (Pixel 10). The owner is **not a developer**.

## How to work
- Always work on a **new branch** and open a **pull request**. Never push directly to `main`. The owner approves PRs in the GitHub mobile app.
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
- New obstacle patterns go in `js/spawner.js` (Classic) or `js/flightSpawner.js` (3D Flight), with a fairness test.
- Keep game logic (`game.js`, `flight.js`, `levels.js`, `spawner.js`, `flightSpawner.js`, `collision.js`) free of DOM and canvas code, so it stays testable in Node.
- Drawing: Classic in `render.js`, 3D Flight in `render3d.js`. `main.js` runs both modes.

## Hard rules
- Plain HTML, CSS and JS only: no frameworks, no build step, no npm runtime dependencies.
- **Relative paths only** (`./…`). The site is served from a subfolder (`/swerve/`).
- **Privacy**:
  - No analytics, trackers, ads or crash reporting.
  - No external scripts, fonts or CDNs.
  - No network requests beyond the app's own files.
- Keep the Content Security Policy in `index.html` intact.
- The only stored data is the `swerve:v1` key in localStorage (best score and level per mode, settings, score history). Don't add more without the owner's say-so.
- The repo is **public**. Never commit personal information (names, emails, locations, anything about the owner).
- Every obstacle pattern must always leave a passable gap (`minGapWidth`), and the fairness tests must cover it.
- Original content only. Don't use names, art, sounds or text from Cubefield, Cube Runner or other existing games.
- The service worker stays **network-first with cache fallback**. Don't switch to cache-first, or the owner gets stuck on old versions.

## Quick reference
- Run tests: `node --test`
- Debug view: open the site with `?debug=1` (FPS, hitboxes, invincible, level skip)
- Live site: `https://<github-username>.github.io/swerve/`
