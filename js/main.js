// main.js — boots the app, runs the game loop and switches screens.
// (Game rules live in game.js; drawing lives in render.js.)

import { APP_VERSION, CONFIG, LEVELS } from './config.js';
import { createGame, resetGame, stepGame } from './game.js';
import { blendPalette, copyPalette, bannerText, hudLabel } from './levels.js';
import { createRenderer, resizeRenderer, drawFrame } from './render.js';
import { createInput, getSteer, clearInput } from './input.js';
import { loadSave, writeSave, recordRun } from './storage.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = createRenderer(canvas, CONFIG);
const input = createInput(canvas, CONFIG);
const game = createGame(CONFIG, LEVELS, (Date.now() >>> 0) || 1);
const save = loadSave();

const screens = {
  start: $('screen-start'),
  over: $('screen-over'),
};

let mode = 'menu'; // menu | playing | crashing | over
let lastTime = 0;
let crashAt = 0;

// Colors: we fade from `fadeFrom` to the current level's palette.
const fadeFrom = copyPalette(LEVELS[0].palette);
const shownPalette = copyPalette(LEVELS[0].palette);
let fadeT = 1;
let glowFrom = 0;
let shownText = '';

let bannerUntil = 0;

const view = {
  palette: shownPalette,
  bank: 0, roll: 0, shakeX: 0, shakeY: 0, flash: 0, glow: 0, lean: 0,
  showShip: true, hitboxes: false,
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.classList.toggle('hidden', key !== name);
  $('hud').classList.toggle('hidden', name !== null);
}

function updateBestDisplays() {
  $('start-best').textContent = save.bestScore;
  $('over-best').textContent = save.bestScore;
}

function startRun() {
  resetGame(game);
  clearInput(input);
  lastScoreShown = -1;
  lastLabel = '';
  view.bank = 0;
  startLevelFade(true);
  mode = 'playing';
  showScreen(null);
  updateHud();
  showBanner(performance.now());
}

// Begin the color cross-fade into the current level (instant if `snap`).
function startLevelFade(snap) {
  copyPalette(shownPalette, fadeFrom);
  glowFrom = view.glow;
  fadeT = snap ? 1 : 0;
  if (snap) {
    copyPalette(game.info.level.palette, shownPalette);
    view.glow = levelGlow();
  }
}

function levelGlow() {
  const e = game.info.level.effects;
  return e && e.glow ? 1 : 0;
}

function updateColors(dt) {
  const target = game.info.level.palette;
  if (fadeT < 1) {
    fadeT = Math.min(1, fadeT + dt / CONFIG.paletteFadeSec);
    blendPalette(fadeFrom, target, fadeT, shownPalette);
    view.glow = glowFrom + (levelGlow() - glowFrom) * fadeT;
  } else if (shownPalette.sky !== target.sky) {
    copyPalette(target, shownPalette);
    view.glow = levelGlow();
  }
  if (shownPalette.text !== shownText) {
    shownText = shownPalette.text;
    document.documentElement.style.setProperty('--hud-text', shownText);
  }
}

function showBanner(now) {
  const el = $('banner');
  el.textContent = bannerText(game.info);
  el.classList.add('show');
  bannerUntil = now + CONFIG.bannerSec * 1000;
}

function updateBanner(now) {
  if (bannerUntil && now > bannerUntil) {
    $('banner').classList.remove('show');
    bannerUntil = 0;
  }
}

function toMenu() {
  mode = 'menu';
  resetGame(game);
  startLevelFade(true);
  $('banner').classList.remove('show');
  updateBestDisplays();
  showScreen('start');
}

function crash(now) {
  mode = 'crashing';
  crashAt = now;
}

function showGameOver() {
  mode = 'over';
  const levelNumber = game.levelIndex + 1;
  const newBest = recordRun(save, game.score, levelNumber);
  writeSave(save);
  $('over-score').textContent = game.score;
  $('over-level').textContent = `Reached level ${levelNumber} · ${game.info.level.name}`;
  $('banner').classList.remove('show');
  $('over-newbest').classList.toggle('hidden', !newBest);
  updateBestDisplays();
  showScreen('over');
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

// Tilt the view toward the turn, easing in and out.
function updateBank(dt) {
  const steerShare = game.vx / CONFIG.maxSteerSpeed;
  const target = steerShare * CONFIG.bankMaxDeg * DEG;
  view.bank += (target - view.bank) * (1 - Math.exp(-CONFIG.bankEase * dt));
}

const DEG = Math.PI / 180;

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
  updateBanner(now);
  if (mode === 'playing') updateBank(realDt);
  view.lean = (game.vx / CONFIG.maxSteerSpeed) * CONFIG.shipLeanDeg * DEG;
  drawFrame(renderer, game, view);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`).catch(() => {});
}

// ---- Wire up buttons ----
$('btn-play').addEventListener('click', startRun);
$('btn-again').addEventListener('click', startRun);
$('btn-menu').addEventListener('click', toMenu);

$('version').textContent = `v${APP_VERSION}`;
window.addEventListener('resize', () => resizeRenderer(renderer));
updateBestDisplays();
showScreen('start');
requestAnimationFrame(frame);
registerServiceWorker();
