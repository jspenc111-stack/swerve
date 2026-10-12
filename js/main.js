// main.js — boots the app, runs the game loop and switches screens.
// (Game rules live in game.js; drawing lives in render.js.)

import { APP_VERSION, CONFIG, LEVELS } from './config.js';
import { createGame, resetGame, stepGame } from './game.js';
import { blendPalette, copyPalette, bannerText, hudLabel } from './levels.js';
import { createRenderer, resizeRenderer, drawFrame } from './render.js';
import {
  createInput, getSteer, clearInput, setControlMode, calibrateTilt, requestTiltPermission,
} from './input.js';
import { loadSave, writeSave, recordRun, defaultSave } from './storage.js';
import {
  unlockAudio, setSoundEnabled, playLevelUp, playCrash, playNewBest, vibrate,
} from './audio.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = createRenderer(canvas, CONFIG);
const input = createInput(canvas, CONFIG);
const game = createGame(CONFIG, LEVELS, (Date.now() >>> 0) || 1);
const save = loadSave();

const screens = {
  start: $('screen-start'),
  pause: $('screen-pause'),
  over: $('screen-over'),
  settings: $('screen-settings'),
};

// menu | playing | paused | crashing | over | settings
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
  bank: 0, roll: 0, shakeX: 0, shakeY: 0, flash: 0, glow: 0, lean: 0,
  showShip: true, hitboxes: false,
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
    copyPalette(game.info.level.palette, shownPalette);
    view.glow = effectsOf(game.info.level).glow ? 1 : 0;
    rollAmp = targetRoll();
  }
  nextStrike = 0;
}

function targetRoll() {
  const roll = effectsOf(game.info.level).roll;
  return roll ? roll.degrees * DEG : 0;
}

function updateColors(dt) {
  const level = game.info.level;
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
  const roll = effectsOf(game.info.level).roll;
  const period = roll ? roll.periodSec : 7;
  view.roll = rollAmp * Math.sin((game.time * 2 * Math.PI) / period);
}

// Storm level: occasional brief lightning flashes.
function updateLightning(now) {
  const storm = effectsOf(game.info.level).lightning;
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
  const target = (game.vx / CONFIG.maxSteerSpeed) * CONFIG.bankMaxDeg * DEG;
  view.bank += (target - view.bank) * (1 - Math.exp(-CONFIG.bankEase * dt));
}

// ---- Banner and HUD ------------------------------------------------------------

function showBanner(now) {
  const el = $('banner');
  el.textContent = bannerText(game.info);
  el.classList.add('show');
  bannerUntil = now + CONFIG.bannerSec * 1000;
}

function hideBanner() {
  $('banner').classList.remove('show');
  bannerUntil = 0;
}

let lastScoreShown = -1;
let lastLabel = '';
function updateHud() {
  if (game.score !== lastScoreShown) {
    lastScoreShown = game.score;
    $('hud-score').textContent = game.score;
  }
  const label = hudLabel(game.info);
  if (label !== lastLabel) {
    lastLabel = label;
    $('hud-level').textContent = label;
  }
}

// ---- Screens -------------------------------------------------------------------

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.classList.toggle('hidden', key !== name);
  $('hud').classList.toggle('hidden', !(name === null || name === 'pause'));
}

function updateBestDisplays() {
  $('start-best').textContent = save.bestScore;
  $('over-best').textContent = save.bestScore;
}

const HOWTO = {
  sides: 'Hold left or right side to steer.',
  tilt: 'Tilt your phone to steer.',
  drag: 'Drag left or right to steer.',
};

function startRun() {
  unlockAudio();
  if (save.settings.controls === 'tilt') requestTiltPermission();
  resetGame(game);
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
  mode = 'menu';
  resetGame(game);
  startLevelFade(true);
  view.bank = 0;
  hideBanner();
  updateBestDisplays();
  $('start-howto').textContent = HOWTO[save.settings.controls];
  showScreen('start');
  keepAwake(false);
}

function crash(now) {
  mode = 'crashing';
  crashAt = now;
  playCrash();
  vibrate(CONFIG.vibrateMs, save.settings.vibration);
}

function showGameOver() {
  mode = 'over';
  const levelNumber = game.levelIndex + 1;
  const newBest = recordRun(save, game.score, levelNumber);
  writeSave(save);
  $('over-score').textContent = game.score;
  $('over-level').textContent = `Reached level ${levelNumber} · ${hudLabel(game.info)}`;
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
}

function applySettings() {
  setSoundEnabled(save.settings.sound);
  setControlMode(input, save.settings.controls);
  $('start-howto').textContent = HOWTO[save.settings.controls];
}

function changeSetting(fn) {
  fn(save.settings);
  writeSave(save);
  applySettings();
  renderSettings();
}

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

  if (mode === 'playing') {
    const events = stepGame(game, dt, getSteer(input, renderer.w));
    for (const e of events) {
      if (e.type === 'crash') crash(now);
      else if (e.type === 'level') {
        startLevelFade(false);
        showBanner(now);
        playLevelUp();
      }
    }
    updateHud();
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
  view.lean = (game.vx / CONFIG.maxSteerSpeed) * CONFIG.shipLeanDeg * DEG;
  drawFrame(renderer, game, view);
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
    if (mode === 'menu' || mode === 'settings') location.reload();
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

for (const btn of document.querySelectorAll('[data-controls]')) {
  btn.addEventListener('click', () => changeSetting((s) => { s.controls = btn.dataset.controls; }));
}
$('btn-sound').addEventListener('click', () => changeSetting((s) => { s.sound = !s.sound; }));
$('btn-vibration').addEventListener('click', () => changeSetting((s) => { s.vibration = !s.vibration; }));
$('btn-reset').addEventListener('click', () => $('reset-confirm').classList.remove('hidden'));
$('btn-reset-no').addEventListener('click', () => $('reset-confirm').classList.add('hidden'));
$('btn-reset-yes').addEventListener('click', () => {
  const fresh = defaultSave();
  save.bestScore = fresh.bestScore;
  save.bestLevel = fresh.bestLevel;
  writeSave(save);
  updateBestDisplays();
  $('reset-confirm').classList.add('hidden');
  $('btn-reset').textContent = 'Best score reset ✓';
  setTimeout(() => { $('btn-reset').textContent = 'Reset best score'; }, 1800);
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
window.addEventListener('resize', () => resizeRenderer(renderer));
applySettings();
updateBestDisplays();
showScreen('start');
requestAnimationFrame(frame);
registerServiceWorker();
