// input.js — touch, tilt and keyboard steering.
//
// getSteer() returns -1 (full left) … 0 … 1 (full right).

export function createInput(target, config) {
  const input = {
    mode: 'sides',
    pointers: [], // active touches, most recent last: { id, x, startX }
    left: false,
    right: false,
    onPause: null,
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
    else if (e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      if (input.onPause && !e.repeat) input.onPause();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
  });
  window.addEventListener('blur', () => clearInput(input));

  input.config = config;
  return input;
}

function removePointer(input, id) {
  const i = input.pointers.findIndex((p) => p.id === id);
  if (i >= 0) input.pointers.splice(i, 1);
}

export function clearInput(input) {
  input.pointers.length = 0;
  input.left = false;
  input.right = false;
}

export function getSteer(input, viewWidth) {
  // Keyboard always works (handy for testing on a computer).
  const keys = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (keys !== 0) return keys;

  const p = input.pointers[input.pointers.length - 1]; // most recent touch
  if (!p) return 0;
  return p.x < viewWidth / 2 ? -1 : 1;
}
