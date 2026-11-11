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

// A quick airy "whoosh" for a near miss (kept soft: it can repeat quickly).
let lastWhoosh = 0;
export function playWhoosh() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    if (t - lastWhoosh < 0.12) return; // several cubes at once make one whoosh
    lastWhoosh = t;
    noiseBurst(t, 0.16, 'bandpass', 2600, 700, 0.16);
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

// Soft "pew" for each shot (kept quiet: it repeats several times a second).
export function playShot() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    tone(t, 'square', 1400, 500, 0.06, 0.035);
  } catch { /* ignore */ }
}

// "Tink" when a shot hits a big drone's armor.
export function playHit() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    tone(t, 'triangle', 2200, 1600, 0.08, 0.12);
  } catch { /* ignore */ }
}

// Drone explosion: a bright pop over a rumble (bigger for big drones).
export function playBoom(big = false) {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    noiseBurst(t, big ? 0.6 : 0.35, 'lowpass', 3000, 150, big ? 0.7 : 0.45);
    tone(t, 'sine', big ? 180 : 260, 50, big ? 0.45 : 0.25, big ? 0.6 : 0.4);
  } catch { /* ignore */ }
}

// Gem chime (Helicopter mode): the ring "ding", a little higher.
export function playGem() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    tone(t, 'sine', 1397, 1397, 0.16, 0.2);
    tone(t + 0.06, 'sine', 1865, 1865, 0.26, 0.18);
  } catch { /* ignore */ }
}

// Helicopter rotor hum: a soft, low, pulsing hum while flying. Its pitch
// rises a little while you hold. Call every frame; it only changes when needed.
let hum = null;
let humHolding = null;

export function setRotorHum(on, holding = false) {
  if (!on || !ready()) {
    stopHum();
    return;
  }
  try {
    if (!hum) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 62;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 280;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.07, ctx.currentTime, 0.12);
      // The "chop": a slow wobble in volume.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 13;
      const depth = ctx.createGain();
      depth.gain.value = 0.035;
      lfo.connect(depth).connect(gain.gain);
      osc.connect(filter).connect(gain).connect(master);
      osc.start();
      lfo.start();
      hum = { osc, lfo, gain };
      humHolding = null;
    }
    if (holding !== humHolding) {
      humHolding = holding;
      const t = ctx.currentTime;
      hum.osc.frequency.setTargetAtTime(holding ? 74 : 62, t, 0.1);
      hum.lfo.frequency.setTargetAtTime(holding ? 16 : 13, t, 0.1);
    }
  } catch {
    hum = null;
  }
}

function stopHum() {
  if (!hum) return;
  const h = hum;
  hum = null;
  try {
    const t = ctx.currentTime;
    h.gain.gain.cancelScheduledValues(t);
    h.gain.gain.setTargetAtTime(0.0001, t, 0.05);
    h.osc.stop(t + 0.3);
    h.lfo.stop(t + 0.3);
  } catch { /* ignore */ }
}

// 3D Heli: a soft thump when the skids touch down.
export function playLand() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime;
    tone(t, 'sine', 120, 60, 0.18, 0.35);
    noiseBurst(t, 0.15, 'lowpass', 700, 150, 0.2);
  } catch { /* ignore */ }
}

// 3D Heli rotor: a "thwop-thwop" pulse of filtered noise that beats faster as
// the collective rises (about 7 to 14 beats a second). Call every frame; it
// only changes when needed. on = false (paused, crashed, menu) stops it.
let rotor = null;
let rotorRate = 0;

export function setChopperRotor(on, lever = 0) {
  if (!on || !ready()) {
    stopRotor();
    return;
  }
  try {
    if (!rotor) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 190;
      filter.Q.value = 0.9;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.15);
      // The pulse: a slow wave pushing the volume up and down.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 7;
      const depth = ctx.createGain();
      depth.gain.value = 0.15;
      lfo.connect(depth).connect(gain.gain);
      src.connect(filter).connect(gain).connect(master);
      src.start();
      lfo.start();
      rotor = { src, lfo, gain, filter };
      rotorRate = 0;
    }
    const rate = 7 + 7 * Math.max(0, Math.min(1, lever));
    if (Math.abs(rate - rotorRate) > 0.15) {
      rotorRate = rate;
      const t = ctx.currentTime;
      rotor.lfo.frequency.setTargetAtTime(rate, t, 0.12);
      rotor.filter.frequency.setTargetAtTime(170 + 60 * lever, t, 0.12);
    }
  } catch {
    rotor = null;
  }
}

function stopRotor() {
  if (!rotor) return;
  const r = rotor;
  rotor = null;
  try {
    const t = ctx.currentTime;
    r.gain.gain.cancelScheduledValues(t);
    r.gain.gain.setTargetAtTime(0.0001, t, 0.05);
    r.src.stop(t + 0.3);
    r.lfo.stop(t + 0.3);
  } catch { /* ignore */ }
}
