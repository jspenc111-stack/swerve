// main.js — boots the app, runs the game loop and switches screens.
// Three game modes share the menus, levels, colors and effects:
//   Classic    — rules in game.js, drawing in render.js
//   3D Flight  — rules in flight.js, drawing in render3d.js
//   Helicopter — rules in heli.js (cave in caveSpawner.js), drawing in renderHeli.js

import { APP_VERSION, CONFIG, LEVELS } from './config.js';
import { createGame, resetGame, stepGame, jumpToLevel } from './game.js';
import { createFlight, resetFlight, stepFlight, jumpFlightToLevel } from './flight.js';
import { createFlightRenderer, drawFlightFrame } from './render3d.js';
import { createHeli, resetHeli, stepHeli, autopilot, jumpHeliToLevel } from './heli.js';
import {
  createHeliRenderer, drawHeliFrame, heliVisibleRange, updateHeliFx, clearHeliFx,
  heliCrashBurst, heliGemSparkle,
} from './renderHeli.js';
import { blendPalette, copyPalette, bannerText, hudLabel } from './levels.js';
import { createRenderer, resizeRenderer, drawFrame } from './render.js';
import {
  createInput, getSteer, getFlightSteer, getBoost, bindBoostButton, clearInput, setControlMode,
  calibrateTilt, requestTiltPermission, getHeliHold,
} from './input.js';
import {
  loadSave, writeSave, recordRun, rankOf, sortedHistory, clearHistory,
  bestScoreOf, runsIn, resetBests,
} from './storage.js';
import {
  unlockAudio, setSoundEnabled, playLevelUp, playCrash, playNewBest, playRing, vibrate,
  playShot, playHit, playBoom, playGem, setRotorHum,
} from './audio.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = createRenderer(canvas, CONFIG);
const input = createInput(canvas, CONFIG);
const game = createGame(CONFIG, LEVELS, (Date.now() >>> 0) || 1);
const flight = createFlight(CONFIG, LEVELS, ((Date.now() >>> 0) ^ 0x5bd1e995) || 2);
const flightRenderer = createFlightRenderer();
const flightSteer = { x: 0, y: 0, joystick: null };
const heli = createHeli(CONFIG, LEVELS, ((Date.now() >>> 0) ^ 0x2545f491) || 3);
const heliRenderer = createHeliRenderer();
let heliHolding = false;
const save = loadSave(undefined, CONFIG.historyMax);
bindBoostButton(input, $('btn-boost'));

// Which game mode is selected: 'classic', 'flight' (3D) or 'heli' (Helicopter).
let gameMode = save.settings.mode;
function cur() {
  if (gameMode === 'flight') return flight;
  if (gameMode === 'heli') return heli;
  return game;
}

const screens = {
  start: $('screen-start'),
  pause: $('screen-pause'),
  over: $('screen-over'),
  settings: $('screen-settings'),
  history: $('screen-history'),
  install: $('screen-install'),
};

// menu | playing | paused | crashing | over | settings | history | install
let mode = 'menu';
let lastTime = 0;
let crashAt = 0;

// ---- Colors and effects ------------------------------------------------------
// When a level starts we fade from `fadeFrom` to the new level's look.
const fadeFrom = copyPalette(LEVELS[0].palette);
const shownPalette = copyPalette(LEVELS[0].palette);
let fadeT = 1;
let glowFrom = 0;
let rollFrom = 0;
let rollAmp = 0;
let shownText = '';
let bannerUntil = 0;
let nextStrike = 0;   // when the next lightning flash happens (Storm level)
let strikeStart = -1;

const view = {
  palette: shownPalette,
  bank: 0, roll: 0, shakeX: 0, shakeY: 0, flash: 0, glow: 0, lean: 0, yaw: 0,
  showShip: true, hitboxes: false,
  camY: CONFIG.flightStartAltitude + CONFIG.flightCameraAbove, // 3D camera height
  joystick: { active: false, x0: 0, y0: 0, x: 0, y: 0 },
};

function effectsOf(level) {
  return level.effects || {};
}

// Begin the color cross-fade into the current level (instant if `snap`).
function startLevelFade(snap) {
  copyPalette(shownPalette, fadeFrom);
  glowFrom = view.glow;
  rollFrom = rollAmp;
  fadeT = snap ? 1 : 0;
  if (snap) {
    copyPalette(cur().info.level.palette, shownPalette);
    view.glow = effectsOf(cur().info.level).glow ? 1 : 0;
    rollAmp = targetRoll();
  }
  nextStrike = 0;
}

function targetRoll() {
  const roll = effectsOf(cur().info.level).roll;
  return roll ? roll.degrees * DEG : 0;
}

function updateColors(dt) {
  const level = cur().info.level;
  const glowTarget = effectsOf(level).glow ? 1 : 0;
  if (fadeT < 1) {
    fadeT = Math.min(1, fadeT + dt / CONFIG.paletteFadeSec);
    blendPalette(fadeFrom, level.palette, fadeT, shownPalette);
    view.glow = glowFrom + (glowTarget - glowFrom) * fadeT;
    rollAmp = rollFrom + (targetRoll() - rollFrom) * fadeT;
  } else if (shownPalette.sky !== level.palette.sky) {
    copyPalette(level.palette, shownPalette);
    view.glow = glowTarget;
    rollAmp = targetRoll();
  }
  if (shownPalette.text !== shownText) {
    shownText = shownPalette.text;
    document.documentElement.style.setProperty('--hud-text', shownText);
  }
}

// Tilt level: the whole view slowly rolls back and forth.
function updateRoll() {
  const roll = effectsOf(cur().info.level).roll;
  const period = roll ? roll.periodSec : 7;
  view.roll = rollAmp * Math.sin((cur().time * 2 * Math.PI) / period);
}

// Storm level: occasional brief lightning flashes.
function updateLightning(now) {
  const storm = effectsOf(cur().info.level).lightning;
  if (!storm || mode !== 'playing') {
    strikeStart = -1;
    return 0;
  }
  if (!nextStrike) nextStrike = now + randomBetween(storm.minGapSec, storm.maxGapSec) * 1000;
  if (now >= nextStrike) {
    strikeStart = now;
    nextStrike = now + randomBetween(storm.minGapSec, storm.maxGapSec) * 1000;
  }
  if (strikeStart < 0) return 0;
  const t = now - strikeStart;
  if (t < 70) return 0.55;   // flash
  if (t < 130) return 0;     // flicker off
  if (t < 230) return 0.35;  // second, weaker flash
  strikeStart = -1;
  return 0;
}

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

// Tilt the view toward the turn, easing in and out.
function updateBank(dt) {
  if (gameMode === 'heli') return; // the helicopter view doesn't bank
  const target = (cur().vx / CONFIG.maxSteerSpeed) * CONFIG.bankMaxDeg * DEG;
  view.bank += (target - view.bank) * (1 - Math.exp(-CONFIG.bankEase * dt));
}

// ---- Banner and HUD ------------------------------------------------------------

function showBanner(now) {
  const el = $('banner');
  el.textContent = bannerText(cur().info);
  el.classList.add('show');
  bannerUntil = now + CONFIG.bannerSec * 1000;
}

function hideBanner() {
  $('banner').classList.remove('show');
  bannerUntil = 0;
}

let lastScoreShown = -1;
let lastLabel = '';
let lastLevelShown = -1;
function updateHud() {
  const g = cur();
  if (g.score !== lastScoreShown) {
    lastScoreShown = g.score;
    $('hud-score').textContent = g.score;
  }
  if (g.levelIndex !== lastLevelShown || lastLabel === '') {
    lastLevelShown = g.levelIndex;
    lastLabel = hudLabel(g.info);
    $('hud-level').textContent = lastLabel;
  }
  if (gameMode === 'flight') {
    // Height meter: marker near the top when flying high.
    const t = (flight.y - CONFIG.flightMinAltitude) / (CONFIG.flightMaxAltitude - CONFIG.flightMinAltitude);
    $('alt-marker').style.top = `${((1 - t) * 100).toFixed(1)}%`;
  }
}

function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
}

// ---- Screens -------------------------------------------------------------------

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.classList.toggle('hidden', key !== name);
  $('hud').classList.toggle('hidden', !(name === null || name === 'pause'));
}

function updateBestDisplays() {
  $('start-best').textContent = bestScoreOf(save, gameMode);
  $('over-best').textContent = bestScoreOf(save, gameMode);
}

const HOWTO = {
  sides: 'Hold left or right side to steer. Hold Boost to go faster.',
  tilt: 'Tilt your phone to steer. Hold Boost to go faster.',
  drag: 'Drag left or right to steer. Hold Boost to go faster.',
};
const HOWTO_FLIGHT = {
  touch: 'Drag anywhere to fly. Your guns fire by themselves: line up the reticle with drones to blast them.',
  tilt: 'Tilt to fly: sideways to turn, toward/away to climb/dive. Guns fire by themselves: aim at drones.',
};
const HOWTO_HELI = 'Hold anywhere to fly up. Let go to drop. Turn your phone sideways for the best view.';
function howto() {
  if (gameMode === 'heli') return HOWTO_HELI;
  if (gameMode === 'flight') return save.settings.controls === 'tilt' ? HOWTO_FLIGHT.tilt : HOWTO_FLIGHT.touch;
  return HOWTO[save.settings.controls];
}

// Start a fresh run (or menu preview) in the selected mode at the chosen level.
function resetCurrent() {
  if (gameMode === 'flight') {
    resetFlight(flight, undefined, startLevelIndex());
    view.camY = flight.y + CONFIG.flightCameraAbove;
  } else if (gameMode === 'heli') {
    sizeHeliCave();
    resetHeli(heli, undefined, startLevelIndex());
    clearHeliFx(heliRenderer);
  } else {
    resetGame(game, undefined, startLevelIndex());
  }
}

// ---- Game mode switch (start screen) ---------------------------------------------

function renderModeSwitch() {
  for (const b of document.querySelectorAll('[data-mode]')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === gameMode));
  }
  $('altimeter').classList.toggle('hidden', gameMode !== 'flight');
  $('btn-boost').classList.toggle('hidden', gameMode === 'heli'); // no boost in Helicopter mode
  input.heliMode = gameMode === 'heli';
  $('start-howto').textContent = howto();
}

function setGameMode(m) {
  if (m === gameMode) return;
  gameMode = m;
  save.settings.mode = m;
  writeSave(save);
  resetCurrent();
  startLevelFade(true);
  lastLabel = '';
  renderModeSwitch();
  updateBestDisplays();
}

// The chosen starting level (0-based), kept within the level list.
function startLevelIndex() {
  return Math.min(Math.max(save.settings.startLevel, 1), LEVELS.length) - 1;
}

function startRun() {
  unlockAudio();
  if (save.settings.controls === 'tilt') requestTiltPermission();
  resetCurrent();
  clearInput(input);
  calibrateTilt(input);
  lastScoreShown = -1;
  lastLabel = '';
  view.bank = 0;
  startLevelFade(true);
  mode = 'playing';
  lastTime = 0;
  showScreen(null);
  updateHud();
  showBanner(performance.now());
  keepAwake(true);
  if (gameMode === 'heli') startHeliRun();
}

function pause() {
  if (mode !== 'playing') return;
  mode = 'paused';
  clearInput(input);
  showScreen('pause');
  keepAwake(false);
}

function resume() {
  if (mode !== 'paused') return;
  unlockAudio();
  clearInput(input);
  mode = 'playing';
  lastTime = 0;
  showScreen(null);
  keepAwake(true);
}

function toMenu() {
  if (reloadPending) {
    location.reload();
    return;
  }
  lockOrientation('portrait'); // the menus stay upright
  hideHeliHints();
  mode = 'menu';
  resetCurrent();
  startLevelFade(true);
  renderPicker();
  view.bank = 0;
  hideBanner();
  updateBestDisplays();
  renderModeSwitch();
  showScreen('start');
  keepAwake(false);
}

function crash(now) {
  mode = 'crashing';
  crashAt = now;
  if (gameMode === 'heli') heliCrashBurst(heliRenderer, heli, shownPalette.ship);
  playCrash();
  vibrate(CONFIG.vibrateMs, save.settings.vibration);
}

function showGameOver() {
  mode = 'over';
  const g = cur();
  const levelNumber = g.levelIndex + 1;
  const startNumber = g.startLevel + 1;
  const newBest = recordRun(save, g.score, levelNumber, startNumber, Date.now(), CONFIG.historyMax, gameMode);
  writeSave(save);
  $('over-score').textContent = g.score;
  $('over-level').textContent = `Reached level ${levelNumber} · ${hudLabel(g.info)}` +
    (startNumber > 1 ? ` (started at ${startNumber})` : '') +
    (gameMode === 'flight' && flight.rings > 0 ? ` · ${flight.rings} ring${flight.rings === 1 ? '' : 's'}` : '') +
    (gameMode === 'flight' && flight.kills > 0 ? ` · ${flight.kills} drone${flight.kills === 1 ? '' : 's'}` : '') +
    (gameMode === 'heli' && heli.gems > 0 ? ` · ${heli.gems} gem${heli.gems === 1 ? '' : 's'}` : '');
  // "Your #3 score" for a good run that isn't a new best (within this mode).
  const rank = rankOf(save, g.score, gameMode);
  const runs = runsIn(save, gameMode);
  const rankEl = $('over-rank');
  rankEl.classList.toggle('hidden', newBest || g.score === 0 || rank > 10 || runs < 3);
  const modeWord = gameMode === 'flight' ? '3D ' : gameMode === 'heli' ? 'Helicopter ' : '';
  rankEl.textContent = `Your #${rank} ${modeWord}score out of ${runs} runs`;
  const nb = $('over-newbest');
  nb.classList.add('hidden');
  if (newBest) {
    void nb.offsetWidth; // restart the celebration animation
    nb.classList.remove('hidden');
    playNewBest();
  }
  hideBanner();
  updateBestDisplays();
  showScreen('over');
  keepAwake(false);
}

// ---- Helicopter mode: screen orientation and hints --------------------------------
// Helicopter mode is best played sideways. When a run starts we ask the phone
// to turn the screen to landscape (this works in the installed app); the menus
// go back to portrait. If the phone is still upright, a hint suggests turning
// it, but the game is fully playable upright too.

function lockOrientation(kind) {
  try {
    const o = screen.orientation;
    if (o && typeof o.lock === 'function') o.lock(kind).catch(() => {});
  } catch { /* not supported: play anyway */ }
}

const isLandscape = () => window.innerWidth > window.innerHeight;
let wasLandscape = isLandscape();
let turnHintTimer = 0;

function startHeliRun() {
  lockOrientation('landscape');
  $('heli-hold').classList.remove('hidden');
  clearTimeout(turnHintTimer);
  // Give the screen a moment to turn before checking.
  turnHintTimer = setTimeout(() => {
    if (gameMode !== 'heli' || (mode !== 'playing' && mode !== 'paused') || isLandscape()) return;
    $('heli-turn').classList.remove('hidden');
    turnHintTimer = setTimeout(() => $('heli-turn').classList.add('hidden'), 3000);
  }, 600);
}

function hideHeliHints() {
  clearTimeout(turnHintTimer);
  $('heli-hold').classList.add('hidden');
  $('heli-turn').classList.add('hidden');
}

// Build the cave just beyond the right edge of the screen (never in view).
function sizeHeliCave() {
  const range = heliVisibleRange(renderer.w, renderer.h, CONFIG);
  heli.spawner.ahead = range.ahead + 4;
  heli.spawner.behind = range.behind + 6;
}

function onResize() {
  resizeRenderer(renderer);
  sizeHeliCave();
  const land = isLandscape();
  if (land === wasLandscape) return;
  wasLandscape = land;
  if (land) $('heli-turn').classList.add('hidden');
  // Turning the phone mid-run pauses, so you're never caught out.
  if (gameMode === 'heli' && mode === 'playing' && heli.started) pause();
}

// ---- Settings ------------------------------------------------------------------

function openSettings() {
  mode = 'settings';
  $('reset-confirm').classList.add('hidden');
  renderSettings();
  showScreen('settings');
}

function renderSettings() {
  for (const btn of document.querySelectorAll('[data-controls]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.controls === save.settings.controls));
  }
  $('btn-sound').textContent = `Sound: ${save.settings.sound ? 'On' : 'Off'}`;
  $('btn-sound').setAttribute('aria-checked', String(save.settings.sound));
  $('btn-vibration').textContent = `Vibration: ${save.settings.vibration ? 'On' : 'Off'}`;
  $('btn-vibration').setAttribute('aria-checked', String(save.settings.vibration));
  $('btn-invert').textContent = `3D up/down: ${save.settings.invertY ? 'Inverted (like a plane)' : 'Normal'}`;
  $('btn-invert').setAttribute('aria-checked', String(save.settings.invertY));
  $('btn-autofire').textContent = `3D auto-fire: ${save.settings.autoFire ? 'On' : 'Off'}`;
  $('btn-autofire').setAttribute('aria-checked', String(save.settings.autoFire));
}

function applySettings() {
  setSoundEnabled(save.settings.sound);
  setControlMode(input, save.settings.controls);
  $('start-howto').textContent = howto();
}

function changeSetting(fn) {
  fn(save.settings);
  writeSave(save);
  applySettings();
  renderSettings();
}

// ---- Level picker (start screen) ------------------------------------------------

function buildPicker() {
  const box = $('level-picker');
  LEVELS.forEach((level, i) => {
    const b = document.createElement('button');
    b.className = 'level-chip';
    b.setAttribute('role', 'radio');
    b.dataset.level = String(i + 1);
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    const p = level.palette;
    swatch.style.background = `linear-gradient(${p.sky} 0%, ${p.skyHorizon} 48%, ${p.ground} 52%, ${p.ground} 100%)`;
    const cube = document.createElement('span');
    cube.className = 'swatch-cube';
    cube.style.background = p.cube;
    swatch.appendChild(cube);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = level.name;
    b.append(swatch, num, name);
    b.addEventListener('click', () => pickLevel(i + 1));
    box.appendChild(b);
  });
  renderPicker();
}

function renderPicker() {
  for (const b of document.querySelectorAll('.level-chip')) {
    b.setAttribute('aria-checked', String(Number(b.dataset.level) === startLevelIndex() + 1));
  }
}

function pickLevel(n) {
  save.settings.startLevel = n;
  writeSave(save);
  renderPicker();
  if (mode === 'menu') {
    // Show the chosen level's colors behind the menu.
    resetCurrent();
    startLevelFade(false);
  }
}

// ---- Score history --------------------------------------------------------------

let historyOrder = 'recent';
let historyMode = 'classic';

function openHistory() {
  mode = 'history';
  historyMode = gameMode;
  $('history-confirm').classList.add('hidden');
  renderHistory();
  showScreen('history');
}

function renderHistory() {
  for (const b of document.querySelectorAll('[data-order]')) {
    b.setAttribute('aria-checked', String(b.dataset.order === historyOrder));
  }
  for (const b of document.querySelectorAll('[data-hmode]')) {
    b.setAttribute('aria-checked', String(b.dataset.hmode === historyMode));
  }
  const list = $('history-list');
  list.textContent = '';
  const runs = sortedHistory(save, historyOrder, historyMode);
  $('history-empty').classList.toggle('hidden', runs.length > 0);
  $('btn-history-clear').classList.toggle('hidden', runs.length === 0);
  const best = runs.reduce((m, r) => Math.max(m, r.score), 0);
  runs.forEach((run, i) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.className = 'h-score';
    left.textContent = (historyOrder === 'top' ? `${i + 1}. ` : '') + run.score + (run.score === best ? ' ★' : '');
    const mid = document.createElement('span');
    mid.className = 'h-level';
    const lvl = LEVELS[(run.level - 1) % LEVELS.length];
    mid.textContent = `Level ${run.level}${lvl ? ` · ${lvl.name}` : ''}` +
      (run.startLevel > 1 ? ` (from ${run.startLevel})` : '');
    const right = document.createElement('span');
    right.className = 'h-when';
    right.textContent = formatWhen(run.at);
    li.append(left, mid, right);
    list.appendChild(li);
  });
}

// "Today 3:41 PM", "Yesterday 9:05 AM", "Oct 18, 3:41 PM" (in the phone's own format).
function formatWhen(t) {
  const d = new Date(t);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return `${d.toLocaleDateString(undefined, opts)}, ${time}`;
}

// ---- Installing the app -------------------------------------------------------------
// Shows an "Install app" button when Chrome offers it. If Chrome never offers
// (for example because it wrongly thinks Swerve is already installed), shows a
// "Can't install?" link with step-by-step help instead.

let installPrompt = null;
let installHelpReady = false;

function runningAsApp() {
  return matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;
}

function updateInstallUi() {
  const inApp = runningAsApp();
  $('btn-install').classList.toggle('hidden', inApp || !installPrompt);
  $('btn-install-help').classList.toggle('hidden', inApp || !!installPrompt || !installHelpReady);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  updateInstallUi();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  updateInstallUi();
});
setTimeout(() => { installHelpReady = true; updateInstallUi(); }, 4000);

// ---- Keep the screen awake while playing ----------------------------------------

let wakeLock = null;
let wantAwake = false;

async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      const lock = await navigator.wakeLock.request('screen');
      if (!wantAwake) {
        lock.release().catch(() => {});
        return;
      }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    } else if (!on && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch {
    // Not supported or refused: the game still works, the screen may dim.
  }
}

// ---- Main loop -------------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime = now;

  view.flash = 0;
  view.shakeX = 0;
  view.shakeY = 0;

  view.joystick.active = false;
  if (mode === 'playing') {
    let events;
    if (gameMode === 'flight') {
      getFlightSteer(input, flightSteer, save.settings.invertY);
      events = stepFlight(flight, dt, flightSteer.x, flightSteer.y, getBoost(input, true),
        save.settings.autoFire);
      const p = flightSteer.joystick;
      if (p) {
        view.joystick.active = true;
        view.joystick.x0 = p.startX;
        view.joystick.y0 = p.startY;
        view.joystick.x = p.x;
        view.joystick.y = p.y;
      }
    } else if (gameMode === 'heli') {
      heliHolding = getHeliHold(input);
      events = stepHeli(heli, dt, heliHolding);
      if (heli.started) $('heli-hold').classList.add('hidden');
    } else {
      events = stepGame(game, dt, getSteer(input, renderer.w), getBoost(input));
    }
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.type === 'crash') crash(now);
      else if (e.type === 'ring') {
        playRing();
        showToast(`+${CONFIG.ringBonus}`);
      } else if (e.type === 'shot') {
        playShot();
      } else if (e.type === 'hit') {
        playHit();
      } else if (e.type === 'gem') {
        heliGemSparkle(heliRenderer, heli, CONFIG.heliGemBonus);
        playGem();
      } else if (e.type === 'destroy') {
        playBoom(e.big);
        vibrate(e.big ? 30 : 15, save.settings.vibration);
      } else if (e.type === 'level') {
        startLevelFade(false);
        showBanner(now);
        playLevelUp();
      }
    }
    updateHud();
  } else if (mode === 'menu' && gameMode === 'heli') {
    // Menu preview: the helicopter flies itself through the chosen level.
    heliHolding = heli.started ? autopilot(heli) : true;
    stepHeli(heli, dt, heliHolding);
    if (heli.crashed || heli.levelIndex !== heli.startLevel) {
      resetHeli(heli, undefined, startLevelIndex());
      clearHeliFx(heliRenderer);
    }
  } else if (mode === 'crashing') {
    const t = now - crashAt;
    view.flash = Math.max(0, 1 - t / CONFIG.crashFlashMs);
    if (t < CONFIG.crashShakeMs) {
      const k = CONFIG.crashShakePx * (1 - t / CONFIG.crashShakeMs);
      view.shakeX = (Math.random() * 2 - 1) * k;
      view.shakeY = (Math.random() * 2 - 1) * k;
    }
    if (t >= CONFIG.gameOverDelayMs) showGameOver();
  }

  const realDt = Math.min(dt, 0.1);
  updateColors(realDt);
  if (bannerUntil && now > bannerUntil) hideBanner();
  if (mode === 'playing') updateBank(realDt);
  updateRoll();
  view.flash = Math.max(view.flash, updateLightning(now));
  // Rotor hum: only while a Helicopter run is on screen (not paused or crashed).
  setRotorHum(gameMode === 'heli' && mode === 'playing' && !heli.crashed, heliHolding && heli.started);
  if (gameMode === 'heli') {
    const fxDt = mode === 'paused' || mode === 'settings' || mode === 'history' ? 0 : realDt;
    updateHeliFx(heliRenderer, heli, CONFIG, fxDt, heliHolding && heli.started, heli.started && !heli.crashed);
    drawHeliFrame(renderer, heliRenderer, heli, view);
  } else if (gameMode === 'flight') {
    // The camera follows climbs and dives with a slight lag.
    const target = flight.y + CONFIG.flightCameraAbove;
    view.camY += (target - view.camY) * (1 - Math.exp(-CONFIG.flightCameraFollow * realDt));
    view.firing = save.settings.autoFire && mode === 'playing';
    drawFlightFrame(renderer, flightRenderer, flight, view);
  } else {
    view.lean = (game.vx / CONFIG.maxSteerSpeed) * CONFIG.shipLeanDeg * DEG;
    view.yaw = CONFIG.shipYawFactor * Math.atan2(game.vx, Math.max(1, game.speed));
    drawFrame(renderer, game, view);
  }
  if (DEBUG) updateFps(now);
}

// ---- Updates (service worker) -----------------------------------------------------
// The service worker keeps the game working offline. When a new version
// arrives, reload once to use it — but never in the middle of a run.

let reloadPending = false;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadPending) return; // first install: nothing to reload
    reloadPending = true;
    if (mode === 'menu' || mode === 'settings' || mode === 'history' || mode === 'install') location.reload();
  });
  navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`)
    .then((reg) => {
      // Check for a newer version whenever the app comes back to the front.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}

// ---- Debug mode (open the page with ?debug=1) -----------------------------------------
// Shows frames per second, hitbox outlines, an "invincible" switch and buttons
// to jump to any level. Not linked from anywhere.

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
let fpsFrames = 0;
let fpsSince = 0;
let fpsEl = null;

function setupDebug() {
  const panel = $('debug');
  panel.classList.remove('hidden');
  const make = (tag, text, parent) => {
    const el = document.createElement(tag);
    el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  fpsEl = make('div', 'FPS –', panel);
  const toggles = make('div', '', panel);
  toggles.className = 'row';
  const inv = make('button', 'Invincible', toggles);
  inv.addEventListener('click', () => {
    game.invincible = !game.invincible;
    flight.invincible = game.invincible;
    heli.invincible = game.invincible;
    inv.classList.toggle('on', game.invincible);
  });
  const hit = make('button', 'Hitboxes', toggles);
  hit.addEventListener('click', () => {
    view.hitboxes = !view.hitboxes;
    hit.classList.toggle('on', view.hitboxes);
  });
  const levels = make('div', 'Level: ', panel);
  levels.className = 'row';
  LEVELS.forEach((level, i) => {
    const b = make('button', String(i + 1), levels);
    b.title = level.name;
    b.addEventListener('click', () => debugJump(i));
  });
}

function debugJump(index) {
  if (mode !== 'playing') startRun();
  if (gameMode === 'flight') jumpFlightToLevel(flight, index);
  else if (gameMode === 'heli') jumpHeliToLevel(heli, index);
  else jumpToLevel(game, index);
  lastLabel = '';
  startLevelFade(true);
  updateHud();
  showBanner(performance.now());
}

function updateFps(now) {
  fpsFrames++;
  if (now - fpsSince >= 500) {
    const count = gameMode === 'flight' ? flight.spawner.boxes.length
      : gameMode === 'heli' ? heli.spawner.obstacles.length : game.spawner.cubes.length;
    fpsEl.textContent = `FPS ${Math.round((fpsFrames * 1000) / (now - fpsSince))} · obstacles ${count}`;
    fpsFrames = 0;
    fpsSince = now;
  }
}

// ---- Wire everything up ------------------------------------------------------------

$('btn-play').addEventListener('click', startRun);
$('btn-again').addEventListener('click', startRun);
$('btn-menu').addEventListener('click', toMenu);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', startRun);
$('btn-quit').addEventListener('click', toMenu);
$('btn-settings').addEventListener('click', openSettings);
$('btn-settings-done').addEventListener('click', toMenu);
$('btn-history').addEventListener('click', openHistory);
$('btn-history-done').addEventListener('click', toMenu);
for (const b of document.querySelectorAll('[data-order]')) {
  b.addEventListener('click', () => { historyOrder = b.dataset.order; renderHistory(); });
}
for (const b of document.querySelectorAll('[data-hmode]')) {
  b.addEventListener('click', () => { historyMode = b.dataset.hmode; renderHistory(); });
}
for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => setGameMode(b.dataset.mode));
}
$('btn-history-clear').addEventListener('click', () => $('history-confirm').classList.remove('hidden'));
$('btn-history-clear-no').addEventListener('click', () => $('history-confirm').classList.add('hidden'));
$('btn-history-clear-yes').addEventListener('click', () => {
  clearHistory(save);
  writeSave(save);
  $('history-confirm').classList.add('hidden');
  renderHistory();
});
$('btn-install').addEventListener('click', () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  installPrompt.userChoice.finally(() => { installPrompt = null; updateInstallUi(); });
});
$('btn-install-help').addEventListener('click', () => { mode = 'install'; showScreen('install'); });
$('btn-install-done').addEventListener('click', toMenu);

for (const btn of document.querySelectorAll('[data-controls]')) {
  btn.addEventListener('click', () => changeSetting((s) => { s.controls = btn.dataset.controls; }));
}
$('btn-sound').addEventListener('click', () => changeSetting((s) => { s.sound = !s.sound; }));
$('btn-vibration').addEventListener('click', () => changeSetting((s) => { s.vibration = !s.vibration; }));
$('btn-invert').addEventListener('click', () => changeSetting((s) => { s.invertY = !s.invertY; }));
$('btn-autofire').addEventListener('click', () => changeSetting((s) => { s.autoFire = !s.autoFire; }));
$('btn-reset').addEventListener('click', () => $('reset-confirm').classList.remove('hidden'));
$('btn-reset-no').addEventListener('click', () => $('reset-confirm').classList.add('hidden'));
$('btn-reset-yes').addEventListener('click', () => {
  resetBests(save);
  writeSave(save);
  updateBestDisplays();
  $('reset-confirm').classList.add('hidden');
  $('btn-reset').textContent = 'Best scores reset ✓';
  setTimeout(() => { $('btn-reset').textContent = 'Reset best scores'; }, 1800);
});

input.onPause = () => {
  if (mode === 'playing') pause();
  else if (mode === 'paused') resume();
};

// Pause automatically when the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pause();
});
window.addEventListener('pagehide', pause);

$('version').textContent = `v${APP_VERSION}`;
window.addEventListener('resize', onResize);
applySettings();
buildPicker();
renderModeSwitch();
resetCurrent();
startLevelFade(true);
updateInstallUi();
if (DEBUG) setupDebug();
updateBestDisplays();
showScreen('start');
requestAnimationFrame(frame);
registerServiceWorker();
