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
// In Helicopter mode, holding ANY touch (or the mouse, Space, ↑ or W) lifts;
// the pause button and P/Esc pause.
// In 3D Heli mode, two thumbs: touches starting in the collective zone (left
// 40% of the screen, or right 40% for left-handed play) slide the lift lever,
// which stays where you leave it; touches starting anywhere else work a
// floating joystick (the cyclic). See "3D Heli: two-thumb controls" below.
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
    spaceKey: false,   // Space held (lift in Helicopter mode)
    heliMode: false,   // true in Helicopter mode: Space lifts instead of pausing
    chopperMode: false, // true in 3D Heli mode: touches go to the two-thumb controls
    chopper: createChopperControls(config),
    keyW: false,       // W / S held: move the 3D Heli lever
    keyS: false,
    arrowUp: false,    // ↑ / ↓ held: the 3D Heli cyclic, forward/back
    arrowDown: false,
  };
  const viewWidth = () => window.innerWidth || target.clientWidth || 1;

  target.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    removePointer(input, e.pointerId);
    input.pointers.push({ id: e.pointerId, x: e.clientX, startX: e.clientX, y: e.clientY, startY: e.clientY });
    if (input.chopperMode) thumbDown(input.chopper, e.pointerId, e.clientX, e.clientY, viewWidth());
  });
  target.addEventListener('pointermove', (e) => {
    const p = input.pointers.find((q) => q.id === e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    thumbMove(input.chopper, e.pointerId, e.clientX, e.clientY);
  });
  const end = (e) => {
    removePointer(input, e.pointerId);
    thumbUp(input.chopper, e.pointerId);
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
  target.addEventListener('lostpointercapture', end);
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  const setChopperKey = (e, on) => {
    if (e.key === 'w' || e.key === 'W') input.keyW = on;
    else if (e.key === 's' || e.key === 'S') input.keyS = on;
    else if (e.key === 'ArrowUp') input.arrowUp = on;
    else if (e.key === 'ArrowDown') input.arrowDown = on;
  };
  window.addEventListener('keydown', (e) => {
    setChopperKey(e, true);
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.upKey = true;
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.downKey = true;
    else if (e.key === 'Shift') input.shiftKey = true;
    else if (e.key === ' ' && input.heliMode) {
      e.preventDefault();
      input.spaceKey = true;
    } else if (e.key === ' ' || e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (input.onPause && !e.repeat) input.onPause();
    }
  });
  window.addEventListener('keyup', (e) => {
    setChopperKey(e, false);
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.upKey = false;
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.downKey = false;
    else if (e.key === 'Shift') input.shiftKey = false;
    else if (e.key === ' ') input.spaceKey = false;
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
  input.spaceKey = false;
  input.keyW = false;
  input.keyS = false;
  input.arrowUp = false;
  input.arrowDown = false;
  releaseThumbs(input.chopper); // the lever stays where it is
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
  const R = cfg.flightJoystickRadiusPx; // 3D Flight's own (smaller) joystick
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

// Helicopter mode: true while any touch, mouse button, Space, ↑ or W is held.
export function getHeliHold(input) {
  return input.pointers.length > 0 || input.spaceKey || input.upKey;
}

// ---- 3D Heli: two-thumb controls ---------------------------------------------
// Pure logic (no DOM), so it can be tested in Node. Pointer positions are in
// screen pixels.
//
//   lever  — the collective, 0 (bottom) … 1 (top). Dragging is RELATIVE: put
//            your thumb anywhere in the collective zone; moving it up by
//            collectiveTravelPx moves the lever its full range. It stays put
//            when you let go.
//   stickX — the cyclic sideways, -1 left … 1 right
//   stickY — the cyclic forward/back, -1 pull back … 1 push forward
//            (a floating joystick where your thumb lands; it eases back to
//            the middle when you let go)
// Each touch keeps the role of the zone it STARTED in until it lifts, so
// thumbs can wander without swapping jobs.

export const COLLECTIVE_ZONE = 0.4;  // share of the screen width
const STICK_RETURN = 14;             // how quickly the stick eases back to the middle
const KEY_LEVER_SPEED = 0.7;         // W/S: lever travel per second

export function createChopperControls(config) {
  return {
    config,
    side: 'left',       // which side the collective is on ('left' or 'right')
    lever: 0,
    stickX: 0,
    stickY: 0,
    thumbs: [],         // { id, role: 'lever' | 'stick', x0, y0, x, y, lastY }
    hoverTick: false,   // set when the lever crosses the hover mark (for a tiny buzz)
  };
}

// Which job a touch starting at x gets.
export function thumbRole(x, width, side = 'left') {
  const zone = width * COLLECTIVE_ZONE;
  if (side === 'right') return x >= width - zone ? 'lever' : 'stick';
  return x < zone ? 'lever' : 'stick';
}

export function thumbDown(cc, id, x, y, width) {
  thumbUp(cc, id);
  cc.thumbs.push({ id, role: thumbRole(x, width, cc.side), x0: x, y0: y, x, y, lastY: y });
}

export function thumbMove(cc, id, x, y) {
  const t = cc.thumbs.find((q) => q.id === id);
  if (!t) return;
  t.x = x;
  t.y = y;
  if (t.role === 'lever') {
    setLever(cc, cc.lever - (y - t.lastY) / cc.config.collectiveTravelPx);
    t.lastY = y;
  }
}

export function thumbUp(cc, id) {
  const i = cc.thumbs.findIndex((q) => q.id === id);
  if (i >= 0) cc.thumbs.splice(i, 1);
}

export function releaseThumbs(cc) {
  cc.thumbs.length = 0;
}

// Fresh run: lever at the bottom, stick centred.
export function resetChopperControls(cc) {
  cc.thumbs.length = 0;
  cc.lever = 0;
  cc.stickX = 0;
  cc.stickY = 0;
  cc.hoverTick = false;
}

function setLever(cc, value) {
  const v = Math.max(0, Math.min(1, value));
  const h = cc.config.chopperHover;
  if ((cc.lever - h) * (v - h) < 0 || (v === h && cc.lever !== h)) cc.hoverTick = true;
  cc.lever = v;
}

// The joystick touch (the most recent stick touch), or null.
export function stickThumb(cc) {
  for (let i = cc.thumbs.length - 1; i >= 0; i--) if (cc.thumbs[i].role === 'stick') return cc.thumbs[i];
  return null;
}

// True while a thumb is on the lever.
export function leverHeld(cc) {
  return cc.thumbs.some((t) => t.role === 'lever');
}

// Call once a frame. keys: { up, down } move the lever (W/S); { fwd, back,
// left, right } work the cyclic (arrow keys).
export function updateChopperControls(cc, dt, keys = NO_KEYS) {
  const leverKeys = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  if (leverKeys !== 0 && dt > 0) setLever(cc, cc.lever + leverKeys * KEY_LEVER_SPEED * Math.min(dt, 0.1));
  const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const ky = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0);
  const t = stickThumb(cc);
  if (kx !== 0 || ky !== 0) {
    cc.stickX = kx;
    cc.stickY = ky;
  } else if (t) {
    const R = cc.config.joystickRadiusPx;
    cc.stickX = Math.max(-1, Math.min(1, (t.x - t.x0) / R));
    cc.stickY = Math.max(-1, Math.min(1, -(t.y - t.y0) / R));
  } else {
    // Released: spring back to the middle, quickly.
    const k = Math.exp(-STICK_RETURN * Math.max(0, dt));
    cc.stickX *= k;
    cc.stickY *= k;
    if (Math.abs(cc.stickX) < 0.02) cc.stickX = 0;
    if (Math.abs(cc.stickY) < 0.02) cc.stickY = 0;
  }
  return cc;
}
const NO_KEYS = {};

// The keyboard state for updateChopperControls, from this input.
export function chopperKeys(input, out = {}) {
  out.up = input.keyW;
  out.down = input.keyS;
  out.fwd = input.arrowUp;
  out.back = input.arrowDown;
  out.left = input.left;
  out.right = input.right;
  return out;
}
