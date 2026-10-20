// input.js — touch, tilt and keyboard steering.
//
// getSteer() returns -1 (full left) … 0 … 1 (full right).
// getFlightSteer() (3D Flight mode) also gives up/down: -1 (down) … 1 (up).
//
// Modes:
//   sides — hold the left or right half of the screen (most recent touch wins)
//   tilt  — tilt the phone; "straight" is whatever angle you held at the start
//   drag  — steer toward where your finger is, relative to where it first touched
// In 3D Flight mode, touch works as a joystick (drag in any direction from
// where you touched), and tilt uses both left/right and forward/back tilt.
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
    beta: null,    // latest forward/back tilt reading, in degrees (3D Flight)
    neutralBeta: 0,
    listening: false,
    needsCalibration: false,
    upKey: false,      // ↑ or W held (boost in Classic, climb in 3D Flight)
    downKey: false,    // ↓ or S held (dive in 3D Flight)
    shiftKey: false,   // Shift held (boost in either mode)
    boostTouches: 0,   // fingers on the boost button
  };

  target.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    removePointer(input, e.pointerId);
    input.pointers.push({ id: e.pointerId, x: e.clientX, startX: e.clientX, y: e.clientY, startY: e.clientY });
  });
  target.addEventListener('pointermove', (e) => {
    const p = input.pointers.find((q) => q.id === e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
  });
  const end = (e) => removePointer(input, e.pointerId);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
  target.addEventListener('lostpointercapture', end);
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.upKey = true;
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.downKey = true;
    else if (e.key === 'Shift') input.shiftKey = true;
    else if (e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      if (input.onPause && !e.repeat) input.onPause();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.upKey = false;
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.downKey = false;
    else if (e.key === 'Shift') input.shiftKey = false;
  });
  window.addEventListener('blur', () => clearInput(input));

  input.config = config;
  input.onTilt = (e) => {
    if (typeof e.gamma !== 'number') return;
    input.gamma = e.gamma;
    input.beta = typeof e.beta === 'number' ? e.beta : null;
    if (input.needsCalibration) {
      input.neutral = e.gamma;
      input.neutralBeta = input.beta ?? 0;
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
    input.beta = null;
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
  input.neutralBeta = input.beta ?? 0;
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
  input.upKey = false;
  input.downKey = false;
  input.shiftKey = false;
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

// Boost: the on-screen button, Shift, or (Classic only) ↑/W.
export function getBoost(input, flight = false) {
  return input.boostTouches > 0 || input.shiftKey || (!flight && input.upKey);
}

// Tilt reading → -1 … 1, with a dead zone.
function tiltAxis(value, neutral, cfg) {
  const d = value - neutral;
  const mag = Math.abs(d) - cfg.tiltDeadZoneDeg;
  if (mag <= 0) return 0;
  return Math.sign(d) * Math.min(1, mag / Math.max(1, cfg.tiltRangeDeg - cfg.tiltDeadZoneDeg));
}

// 3D Flight steering: out.x (-1 left … 1 right), out.y (-1 down … 1 up).
// invertY flips up/down (like a plane's control stick).
export function getFlightSteer(input, out, invertY = false) {
  const cfg = input.config;
  out.x = 0;
  out.y = 0;
  out.joystick = null;
  const kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const ky = (input.upKey ? 1 : 0) - (input.downKey ? 1 : 0);
  if (kx !== 0 || ky !== 0) {
    out.x = kx;
    out.y = ky;
    return out;
  }
  if (input.mode === 'tilt') {
    if (input.gamma !== null) out.x = tiltAxis(input.gamma, input.neutral, cfg);
    // Tilting the top of the phone toward you (bigger beta) climbs.
    if (input.beta !== null) out.y = tiltAxis(input.beta, input.neutralBeta, cfg) * (invertY ? -1 : 1);
    return out;
  }
  const p = input.pointers[input.pointers.length - 1];
  if (!p) return out;
  const R = cfg.joystickRadiusPx;
  out.x = Math.max(-1, Math.min(1, (p.x - p.startX) / R));
  out.y = Math.max(-1, Math.min(1, -(p.y - p.startY) / R)) * (invertY ? -1 : 1);
  out.joystick = p;
  return out;
}

export function getSteer(input, viewWidth) {
  // Keyboard always works (handy for testing on a computer).
  const keys = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (keys !== 0) return keys;

  const cfg = input.config;
  if (input.mode === 'tilt') {
    if (input.gamma === null) return 0;
    return tiltAxis(input.gamma, input.neutral, cfg);
  }

  const p = input.pointers[input.pointers.length - 1]; // most recent touch
  if (!p) return 0;
  if (input.mode === 'drag') {
    return Math.max(-1, Math.min(1, (p.x - p.startX) / cfg.dragRangePx));
  }
  return p.x < viewWidth / 2 ? -1 : 1;
}
