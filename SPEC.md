# Swerve — Build Spec

> **For Claude Code.** Build everything in this spec in one branch and one pull request, with one commit per build step (see §12). Run the tests after each step. Don't stop to ask questions: make a sensible choice, note it in the PR description, and keep going.
>
> The owner is not a developer. Write the PR description in plain language: what was built, how to try it, and anything they need to do by hand.

---

## 1. What we're building

**Swerve** (working name) is a personal arcade game for one player on an Android phone (Pixel 10). It's in the spirit of the classic browser game where you steer a little arrow across an endless field and swerve around cubes.

- The player steers a small arrow-shaped ship that always moves forward across a flat field toward the horizon.
- Cubes come toward the player. Touching one ends the run.
- The game keeps speeding up. Every level changes the colors and scenery and introduces new obstacle patterns, such as slalom gates and winding canyons.
- The score goes up with distance. The best score is saved on the phone.

**It must be an original game.** Don't use the name, logo, art, sounds or text of Cubefield, Cube Runner or any other existing game. Only the general idea (an arrow dodging cubes) is borrowed.

**It will be customized over time.** Every tunable number, color and level definition lives in **one file, `js/config.js`**, so future changes ("make it faster", "add a purple level") are small and safe.

---

## 2. Tech rules (hard requirements)

| Rule | Why |
|---|---|
| Plain HTML, CSS and JavaScript (ES modules). No frameworks, no build step, no npm runtime dependencies. | Simple, fast, nothing to break or update. |
| Draw with **HTML Canvas 2D** and a simple homemade 3D projection (§5). No WebGL or 3D libraries. | Small and easy to tweak. |
| Must work as an installable **PWA** (§9) and play **fully offline** after the first visit. | Feels like a real app on the home screen. |
| Hosted on **GitHub Pages** from the `main` branch root. Use **relative paths everywhere** (`./js/main.js`, never `/js/main.js`), because the site lives at `https://<user>.github.io/swerve/`. | Absolute paths break on GitHub Pages subfolders. |
| No network calls at runtime other than loading the app's own files. No external fonts, CDNs, analytics or trackers. | Privacy (§10) and offline play. |
| Game logic modules (`game.js`, `levels.js`, `collision.js`, `spawner.js`) must not touch the DOM or canvas, so they can be unit tested in Node. | Testability. |
| Tests use Node's built-in test runner: `node --test`. No test libraries. | No dependencies. |

---

## 3. File structure

```
/
├── index.html              # single page, canvas + overlay screens
├── styles.css
├── manifest.webmanifest
├── sw.js                   # service worker (offline + updates)
├── icons/                  # icon-192.png, icon-512.png, icon-maskable-512.png, icon.svg
├── js/
│   ├── config.js           # ALL tunable values + level definitions + APP_VERSION
│   ├── main.js             # boot, game loop, screen switching
│   ├── game.js             # game state: player, speed, score, level progression (pure logic)
│   ├── levels.js           # level lookup, looping, palette blending (pure logic)
│   ├── spawner.js          # creates obstacle patterns (pure logic, seeded random)
│   ├── collision.js        # hit detection (pure logic)
│   ├── render.js           # all drawing to canvas
│   ├── input.js            # touch, tilt, keyboard
│   ├── audio.js            # tiny synthesized sounds (Web Audio, no files)
│   └── storage.js          # localStorage wrapper (best score, settings)
├── tests/                  # node --test files for the pure-logic modules
├── CLAUDE.md
├── SPEC.md
└── README.md               # plain-language: what it is, how to install, how to ask for changes
```

---

## 4. Screens

All screens are HTML overlays on top of the canvas. Use large tap targets (at least 48×48 px) and system fonts.

1. **Start screen**
   - Title "Swerve", best score, a big **Play** button and a ⚙︎ settings button.
   - A short how-to line: "Hold left or right side to steer."
   - The app version is shown small at the bottom (e.g. `v1.0.3`), so the owner can confirm an update arrived.
2. **Playing**
   - Score at the top center, level name small underneath, a pause ⏸ button in the top corner.
   - When a level starts, a banner fades in and out (e.g. "Level 4 · Gates").
3. **Paused**: Resume, Restart and Quit to menu.
4. **Game over**
   - Final score, level reached and best score. Show "New best!" with a small celebration when it applies.
   - **Play again** (big) and **Menu**.
   - Restarting must be instant: one tap, no loading.
5. **Settings**
   - Controls: *Hold sides* (default) / *Tilt phone* / *Drag*.
   - Sound on/off (default on).
   - Vibration on/off (default on).
   - "Reset best score", with a confirm step.

---

## 5. How the 3D look works (rendering)

The game fakes 3D on a flat canvas using **perspective projection**: things further away are drawn smaller and closer to the horizon.

- **World coordinates**:
  - `x` runs left/right.
  - `z` is distance ahead; bigger means further away.
  - The ground is the plane `y = 0`.
- **Camera**: sits a little above and behind the ship, and follows the ship's `x`. The ship is always drawn at the horizontal center of the screen. Steering moves the world sideways around it.
- **Projection** for a point (x, y, z), with focal length `f` and horizon at `horizonY` (about 38% down the screen):
  - `screenX = centerX + (x - cameraX) * f / z`
  - `screenY = horizonY + (cameraHeight - y) * f / z`
- **Cubes**:
  - Draw the front face, the top face, and the visible side face (left side if the cube is right of the camera, right side if left).
  - Shade each face from the level palette: the top is lightest, the side darkest.
  - Sort far to near before drawing (the "painter's algorithm", where distant things are painted first so near things cover them).
- **Fog**: cubes fade in from the sky color near the horizon, so they don't pop into existence.
- **Ground**: a solid color with a subtle gradient toward the horizon. Optionally add faint grid lines that scroll toward the player to sell the speed; this is controlled by the level palette.
- **Bank effect**: while steering, tilt the whole view (horizon and field) slightly, by up to about 6°, in the direction of the turn, easing back when released. This is key to the feel.
- **Ship**:
  - A clean arrow or chevron shape near the bottom center.
  - It leans slightly into turns and has a soft shadow on the ground.
  - Its color comes from the level palette and must contrast with the ground.
- **Crash**: a quick white flash, a short screen shake (~250 ms), a crash sound and a 60 ms vibration (if enabled). Show game over after about 600 ms.
- **Sharpness**: scale the canvas by `devicePixelRatio`, capped at 2 for performance, so it's crisp on the Pixel.

---

## 6. Gameplay

All numbers below are **starting values in `config.js`**, not fixed rules.

### Movement
- The ship always moves forward. Forward speed starts at `baseSpeed` and rises:
  - by `speedPerLevel` at each new level, and
  - gently within a level, by `speedRampPerSecond`.
- Steering uses sideways **velocity with acceleration**, not instant jumps, so it feels smooth: `steerAccel`, `maxSteerSpeed` and `steerFriction` (slowdown when you let go).

### Controls (`input.js`)
- **Hold sides** (default): touching the left half steers left and the right half steers right. Multi-touch uses the most recent touch.
- **Tilt**:
  - Uses the phone's tilt sensor (`deviceorientation` gamma).
  - The neutral position is calibrated when a run starts, with a small dead zone so it doesn't drift.
  - Tilt data is used only in memory, never stored or sent.
- **Drag**: steer toward where your finger is, relative to where it first touched.
- **Keyboard** (for testing on a computer): ← → or A/D steer, space pauses.

### Score and levels
- The score increases with distance traveled.
- A new level starts every `levelLength` points (aim for about 30–40 seconds per level).
- **Level change**:
  1. Clear a short obstacle-free stretch so the player can breathe.
  2. Show the banner.
  3. Cross-fade the colors over about 1 second.
- After the last level, loop back to level 1 as **"Lap 2"**, faster, and so on.

### Collision (`collision.js`)
- The ship's hitbox is a box at the ship's fixed `z`. It's slightly **smaller than it looks** (`hitboxScale`, about 0.8) so near-misses feel fair.
- A crash happens when the ship's box overlaps any cube's box in both `x` and `z`.

### Fairness (must be guaranteed and tested)
- There must **always** be a path wide enough to get through. Gaps in gates and canyons must be at least `minGapWidth` (about 2.5× the ship width).
- A random scatter never places cubes so tightly that the player can't get through.
- New obstacles appear only beyond the fog distance, never right in front of the player.
- The frame time is capped at 50 ms, so a phone hiccup can't teleport the ship into a cube.

---

## 7. Levels and obstacle patterns

### Patterns (`spawner.js`)
Every pattern is defined in config and uses a seeded random generator, so tests are repeatable.

| Pattern | What it looks like |
|---|---|
| `scatter` | Randomly placed cubes; how many is set by `density`. |
| `clusters` | Small groups of 3–6 cubes with open lanes between them. |
| `gates` | Rows of cubes spanning the field, each with one gap. The gap shifts left and right from row to row, so you weave through them like a slalom. |
| `canyon` | Two walls of cubes forming a winding corridor. The path curves using smooth random turns. |
| `mixed` | Alternates between the above every few seconds. |

Obstacles spawn in a band around the player's current `x` (the field is effectively endless sideways). Cubes are removed once they're behind the camera or far off to the side.

### Starting levels (in `config.js`)

| # | Name | Pattern | Look |
|---|---|---|---|
| 1 | Morning | scatter, sparse | pale sky, white ground, grey cubes |
| 2 | Sunset | scatter, denser | orange-pink sky, sand ground, coral cubes |
| 3 | Lagoon | clusters | light blue sky, teal ground, white cubes |
| 4 | Gates | gates | lavender sky, cream ground, purple cubes |
| 5 | Night | scatter, dense | near-black sky, dark ground, glowing neon cyan cubes (subtle glow) |
| 6 | Canyon | canyon | warm red-brown, desert palette |
| 7 | Tilt | mixed | the whole view slowly rolls ±10° back and forth (steering is not reversed) |
| 8 | Storm | mixed, fast | grey-green, with occasional brief "lightning" flashes |

Each level entry includes:
- `name`
- `pattern` and pattern settings
- a `palette`: `sky`, `skyHorizon`, `ground`, `cube`, `ship`, `grid` (optional) and `text`
- optional `effects`: `roll`, `lightning`, `glow`

Adding a level means adding one entry to this list. No other code changes are needed.

---

## 8. Sound and vibration

- Generate sounds in code with the Web Audio API. Don't use sound files.
  - A soft "whoosh" tick on level up.
  - A crash thud.
  - A tiny chime for "New best!".
- Audio starts only after the first tap (browsers require this).
- Vibration uses `navigator.vibrate`, only when it's enabled in settings.
- Sound and vibration are skipped silently if the phone doesn't support them.

---

## 9. PWA and phone behavior

### Manifest
- `name: "Swerve"`, `short_name: "Swerve"`
- `start_url: "./"`, `scope: "./"`
- `display: "fullscreen"`, `orientation: "portrait"`
- Theme and background colors match the start screen.
- Icons at 192 and 512, plus a 512 maskable icon. The icon is an original arrow-and-cubes design.
- Generate PNG icons from `icons/icon.svg` with a one-off local script if needed. Commit the PNGs, but don't add the script's tools as project dependencies.

### Service worker (`sw.js`)
- **Network-first for all of the app's own files, falling back to cache when offline.** The owner always gets the newest version when online, and the game still works offline.
  - This avoids the "stuck on an old version until I clear the cache" problem seen in the owner's other apps.
- The cache name includes `APP_VERSION`. On activate, delete old caches and call `clients.claim()`.
- When a new service worker takes over, reload the page once, but only if the player is **not** mid-run.
- Precache all app files on install so the first offline launch works.

### Phone polish
- Prevent pull-to-refresh, page bounce, text selection, the long-press menu and double-tap zoom on the game area (`overscroll-behavior: none`, `touch-action: none`, `user-select: none`).
- Respect the phone's notch and gesture bar using safe-area insets.
- **Keep the screen awake while playing** (Screen Wake Lock API). Release the lock when paused or on the menu.
- **Pause automatically** when the app goes to the background (`visibilitychange`).
- Target a steady 60 fps on the Pixel 10:
  - use `requestAnimationFrame`;
  - reuse objects instead of creating new ones every frame;
  - don't resize the canvas every frame.

---

## 10. Privacy (hard rules)

- **No accounts, no server and no database.** The game runs entirely on the phone.
- **The only stored data** is the best score, best level and settings, kept in the phone's `localStorage` under one key, `swerve:v1`. Nothing else is saved.
- **Nothing is ever sent anywhere.**
  - No analytics, ads, trackers or crash reporting.
  - No third-party scripts, fonts or CDNs.
- Add a **Content Security Policy** meta tag in `index.html` limiting everything to the app's own files: `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'`.
- Tilt sensor readings are used live for steering only and are never stored.
- **The repo is public** (required for free GitHub Pages).
  - Never put personal info (names, emails, locations) in code, comments, commits or the README.
  - Commit messages should describe code changes only.
- `storage.js` must handle a missing or corrupted saved value by resetting to defaults, never by crashing.

---

## 11. Testing

### Automated (`node --test`)
These test the pure-logic modules.

- **Collision**:
  - overlap, no overlap and edge-touching cases;
  - the hitbox scale is applied.
- **Fairness**:
  - for each pattern, with many seeds, generate 2 minutes of obstacles and confirm a passable gap of at least `minGapWidth` always exists;
  - no cube spawns closer than the fog distance.
- **Levels**:
  - the correct level for a given score;
  - looping to Lap 2 increases speed;
  - palette blending returns valid colors.
- **Game state**:
  - speed ramps correctly;
  - the frame-time cap is applied;
  - the score only increases.
- **Storage**:
  - defaults load correctly;
  - corrupted data resets safely.
- **Config check**: every level has all required fields, and all colors are valid.

### Debug mode (hidden)
Opening the app with `?debug=1` at the end of the URL shows an overlay with:
- frames per second;
- hitboxes drawn as outlines;
- an "invincible" toggle;
- buttons to jump to any level.

It isn't linked from anywhere. It helps the owner preview new levels quickly.

### Manual checklist (in the PR description)
1. Install to the home screen and launch: it opens fullscreen, with no browser bar.
2. Play through levels 1–3: steering feels smooth and the level banners and color changes work.
3. Use `?debug=1` to jump to levels 4–8: each one looks and plays as described.
4. Crash: the flash, shake, sound and buzz all happen, and game over shows. Play again is instant.
5. Turn on airplane mode and relaunch from the home screen: the game still works.
6. Switch apps mid-run: the game pauses.
7. The screen doesn't dim during a long run.

---

## 12. Build order (one commit each, run tests after each)

1. **Skeleton**: files from §3, `config.js` with all values, a blank canvas that fills the screen, the start screen, and the PWA manifest and service worker. Deploy-ready.
2. **Core game**: perspective rendering, the ship, `scatter` obstacles, hold-sides controls, collision, score, game over, and best-score saving. Tests for collision, game and storage.
3. **Levels**: all 8 levels, palette cross-fade, banners, the bank effect, and looping laps. Tests for levels and config.
4. **Patterns**: `clusters`, `gates`, `canyon` and `mixed`, plus the fairness tests.
5. **Feel and polish**:
   - crash effects, sound and vibration, the Tilt level roll and Storm lightning;
   - pause, the settings screen, tilt and drag controls;
   - wake lock and auto-pause.
6. **Finish**: debug mode, icons, the README (plain language), a performance pass, and the full test run. Open the PR with the manual checklist.

---

## 13. Ideas for later (don't build now)

- Practice mode: start from any level you've reached.
- Power-ups (slow-motion, shield).
- New ship designs unlocked by score.
- Daily challenge with a fixed seed.
- More levels and patterns, such as moving cubes and shrinking gaps.
