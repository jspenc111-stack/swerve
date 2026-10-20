// audio.js — tiny sounds made in code with the Web Audio API (no sound files).
// Sound can only start after the first tap (a browser rule), so unlock() is
// called from the Play button. Everything fails silently if unsupported.

let ctx = null;
let master = null;
let noise = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // One second of white noise, reused for whooshes and thuds.
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function ready() {
  return enabled && ctx && ctx.state === 'running';
}

function envelope(gain, t, attack, peak, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseBurst(t, duration, filterType, f0, f1, peak) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(f1, t + duration);
  const gain = ctx.createGain();
  envelope(gain, t, duration * 0.35, peak, duration * 0.65);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + duration + 0.05);
}

function tone(t, type, f0, f1, duration, peak) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + duration);
  const gain = ctx.createGain();
  envelope(gain, t, 0.01, peak, duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

// Soft "whoosh" for a new level.
export function playLevelUp() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    noiseBurst(t, 0.55, 'bandpass', 400, 2400, 0.35);
    tone(t + 0.05, 'sine', 660, 990, 0.25, 0.08);
  } catch { /* ignore */ }
}

// Crash thud.
export function playCrash() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    tone(t, 'sine', 150, 40, 0.4, 0.9);
    noiseBurst(t, 0.3, 'lowpass', 1800, 200, 0.6);
  } catch { /* ignore */ }
}

// Little chime for "New best!".
export function playNewBest() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    tone(t, 'triangle', 784, 784, 0.25, 0.25);
    tone(t + 0.12, 'triangle', 1047, 1047, 0.25, 0.25);
    tone(t + 0.24, 'triangle', 1319, 1319, 0.45, 0.25);
  } catch { /* ignore */ }
}

// Short buzz, if the phone supports it and vibration is on.
export function vibrate(ms, on) {
  if (!on) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch { /* ignore */ }
}

// Bright "ding" for flying through a bonus ring (3D Flight).
export function playRing() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    tone(t, 'sine', 1175, 1175, 0.18, 0.2);
    tone(t + 0.06, 'sine', 1568, 1568, 0.28, 0.18);
  } catch { /* ignore */ }
}
