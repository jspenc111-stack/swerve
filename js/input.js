// input.js — touch, tilt and keyboard steering.
//
// getSteer() returns -1 (full left) … 0 … 1 (full right).
//
// Modes:
//   sides — hold the left or right half of the screen (most recent touch wins)
//   tilt  — tilt the phone; "straight" is whatever angle you held at the start
//   drag  — steer toward where your finger is, relative to where it first touched
// Tilt readings are only used live for steering; they are never stored.

export function createInput(target, config) {
  const input = {
    mode: 'sides',
    pointers: [], // active touches, most recent last: { id, x, startX }
    left: false,
    right: false,
    onPause: null,
    gamma: null,   // latest left/right tilt reading, in degrees
    neutral: 0,    // tilt treated as "straight"
    listening: false,
    needsCalibration: false,
    boostKey: false,   // ↑ or W held (keyboard)
    boostTouches: 0,   // fingers on the boost button
  };

  target.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    removePointer(input, e.pointerId);
    input.pointers.push({ id: e.pointerId, x: e.clientX, startX: e.clientX });
  });
  target.addEventListener('pointermove', (e) => {
    const p = input.pointers.find((q) => q.id === e.pointerId);
    if (p) p.x = e.clientX;
  });
  const end = (e) => removePointer(input, e.pointerId);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
  target.addEventListener('lostpointercapture', end);
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.boostKey = true;
    else if (e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      if (input.onPause && !e.repeat) input.onPause();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.boostKey = false;
  });
  window.addEventListener('blur', () => clearInput(input));

  input.config = config;
  input.onTilt = (e) => {
    if (typeof e.gamma !== 'number') return;
    input.gamma = e.gamma;
    if (input.needsCalibration) {
      input.neutral = e.gamma;
      input.needsCalibration = false;
    }
  };
  return input;
}

export function setControlMode(input, mode) {
  input.mode = mode;
  const wantTilt = mode === 'tilt';
  if (wantTilt && !input.listening) {
    window.addEventListener('deviceorientation', input.onTilt);
    input.listening = true;
  } else if (!wantTilt && input.listening) {
    window.removeEventListener('deviceorientation', input.onTilt);
    input.listening = false;
    input.gamma = null;
  }
}

// Some phones need permission for tilt; must be called from a tap.
export function requestTiltPermission() {
  try {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') return D.requestPermission().catch(() => 'denied');
  } catch { /* ignore */ }
  return Promise.resolve('granted');
}

// Treat the phone's current angle as "straight ahead" (called when a run starts).
export function calibrateTilt(input) {
  input.neutral = input.gamma ?? 0;
  input.needsCalibration = input.gamma === null; // no reading yet: use the first one
}

function removePointer(input, id) {
  const i = input.pointers.findIndex((p) => p.id === id);
  if (i >= 0) input.pointers.splice(i, 1);
}

export function clearInput(input) {
  input.pointers.length = 0;
  input.left = false;
  input.right = false;
  input.boostKey = false;
  if (input.clearBoost) input.clearBoost();
}

// The boost button: hold it to go faster. It keeps its own touches, so you
// can steer with one thumb and boost with the other.
export function bindBoostButton(input, el) {
  input.boostButton = el;
  const held = new Set();
  const sync = () => {
    input.boostTouches = held.size;
    el.classList.toggle('active', held.size > 0);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    held.add(e.pointerId);
    sync();
  });
  const end = (e) => { held.delete(e.pointerId); sync(); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  input.clearBoost = () => { held.clear(); sync(); };
}

export function getBoost(input) {
  return input.boostKey || input.boostTouches > 0;
}

export function getSteer(input, viewWidth) {
  // Keyboard always works (handy for testing on a computer).
  const keys = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (keys !== 0) return keys;

  const cfg = input.config;
  if (input.mode === 'tilt') {
    if (input.gamma === null) return 0;
    const d = input.gamma - input.neutral;
    const mag = Math.abs(d) - cfg.tiltDeadZoneDeg;
    if (mag <= 0) return 0;
    return Math.sign(d) * Math.min(1, mag / Math.max(1, cfg.tiltRangeDeg - cfg.tiltDeadZoneDeg));
  }

  const p = input.pointers[input.pointers.length - 1]; // most recent touch
  if (!p) return 0;
  if (input.mode === 'drag') {
    return Math.max(-1, Math.min(1, (p.x - p.startX) / cfg.dragRangePx));
  }
  return p.x < viewWidth / 2 ? -1 : 1;
}
