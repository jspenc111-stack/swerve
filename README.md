# Swerve

A personal arcade game for my phone: steer a little arrow across an endless field and swerve around cubes. It speeds up, and every level changes the colors and the obstacles.

It's a **PWA** (a web page that installs like an app and works offline) hosted on **GitHub Pages** (GitHub's free website hosting).

## Play it

Open the game's web address in Chrome on the phone. It ends in `.github.io/swerve/`.

**Install it to the home screen (once):**

1. In Chrome, tap the **⋮** menu (top right).
2. Tap **Add to Home screen** → **Install**.
3. Launch it from the new Swerve icon. It opens fullscreen and works without internet after the first visit.

## How to play

- **Hold the left or right side** of the screen to steer (you can switch to *Tilt phone* or *Drag* in ⚙︎ Settings).
- **Hold the Boost button** (bottom middle) to go 1.5× faster. You score faster too.
- **Pick a starting level** on the menu, then tap Play.
- **History** on the menu shows every run's score, level and when you played (Recent or Top scores).
- Don't touch the cubes. The game gets faster, and every level brings new colors and new obstacle patterns.
- After level 8 you go round again as "Lap 2", faster.
- Tap ⏸ to pause. The game also pauses by itself if you switch apps.

## Chrome says "already installed" but it won't open

This means a broken copy is left on the phone. The game's menu has the same help under **Can't install the app?**

1. Swipe up on the home screen and look for **Swerve** in the app list. If it's there and opens, press and hold it and drag it to the home screen.
2. Otherwise remove the broken copy: **Play Store → profile picture → Manage apps & device → Manage → Swerve → Uninstall**. If it isn't there, try phone **Settings → Apps → See all apps**, switch the list to **Archived** or **Disabled**, and uninstall Swerve.
3. Restart the phone, open the game's web address in Chrome, then **⋮ → Add to Home screen → Install**.
4. Don't use Chrome's "Clear site data" for this site: other apps share the same web address and would lose their saved data.

## Is there an update?

The version number is shown small at the bottom of the start screen (for example `v1.0.0`). Each change gets a new number. When you're online, the app picks up the newest version by itself. If you don't see the new number yet, close the app completely and open it again.

## Privacy

- No accounts, no ads, no tracking, and nothing is ever sent anywhere.
- The only things saved are your best score, best level, settings and your score history (score, level and when), kept on the phone itself.
- If you use *Tilt phone*, the tilt readings are used live for steering and never stored.

## Asking for changes

Ask Claude Code in plain words, for example:

- "Make the game a bit slower at the start."
- "Add a purple level after Night with gates."
- "Make the gaps between cubes wider."

Most changes only touch one file, `js/config.js`, which holds every speed, color and level. Each change arrives as a pull request (a proposed change) that you approve in the GitHub app before it goes live.

**Preview levels quickly:** add `?debug=1` to the end of the web address. A small panel appears where you can jump to any level, turn on "Invincible" and see the frame rate.

## For developers

- Plain HTML, CSS and JavaScript. No frameworks, no build step, no dependencies.
- Run the tests with `node --test`.
- Design: see `SPEC.md`. Rules for Claude Code: see `CLAUDE.md`.
