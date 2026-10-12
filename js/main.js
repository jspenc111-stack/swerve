// main.js — boots the app, runs the game loop and switches screens.
// (Game rules live in game.js; drawing lives in render.js.)

import { APP_VERSION, CONFIG, LEVELS } from './config.js';
import { createGame, resetGame, stepGame } from './game.js';
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

const view = {
  palette: LEVELS[0].palette,
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
  mode = 'playing';
  showScreen(null);
  updateHud();
}

function toMenu() {
  mode = 'menu';
  resetGame(game);
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
  $('over-newbest').classList.toggle('hidden', !newBest);
  updateBestDisplays();
  showScreen('over');
}

let lastScoreShown = -1;
function updateHud() {
  if (game.score !== lastScoreShown) {
    lastScoreShown = game.score;
    $('hud-score').textContent = game.score;
  }
  $('hud-level').textContent = game.info.level.name;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime = now;

  view.flash = 0;
  view.shakeX = 0;
  view.shakeY = 0;

  if (mode === 'playing') {
    const events = stepGame(game, dt, getSteer(input, renderer.w));
    for (const e of events) if (e.type === 'crash') crash(now);
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

  view.palette = game.info.level.palette;
  view.lean = (game.vx / CONFIG.maxSteerSpeed) * CONFIG.shipLeanDeg * (Math.PI / 180);
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
