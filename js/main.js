// main.js — starts the app: sizes the canvas, shows the start screen and
// registers the service worker (offline support).
import { APP_VERSION, CONFIG, LEVELS } from './config.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);

let viewW = 0;
let viewH = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackdrop();
}

function drawBackdrop() {
  const p = LEVELS[0].palette;
  const horizon = viewH * CONFIG.horizonRatio;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, p.sky);
  sky.addColorStop(1, p.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, viewW, horizon);
  ctx.fillStyle = p.ground;
  ctx.fillRect(0, horizon, viewW, viewH - horizon);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`).catch(() => {});
}

$('version').textContent = `v${APP_VERSION}`;
window.addEventListener('resize', resize);
resize();
registerServiceWorker();
