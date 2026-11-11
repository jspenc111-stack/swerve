// quality.js — keeps the frame rate steady (pure logic, no DOM, no drawing).
//
// While a run is being played, main.js tells this module how long each frame
// took. It keeps the average of the last 60 frames and compares it with the
// screen's own frame time (16.7 ms on a 60 Hz screen, 8.3 ms on 120 Hz):
//   • too slow for 2 seconds  → lower the drawing resolution one step
//                               (device pixel ratio 2 → 1.5 → 1.25);
//   • still too slow at the lowest step → switch Visual effects to Lite for
//                               the rest of the run;
//   • smooth for 10 seconds   → step the resolution back up, at most once
//                               every 20 seconds, and never mid-crash.
// If stepping up brings the slowness straight back, that step is remembered
// as "too much" and isn't tried again, so the picture never flip-flops.
//
// main.js resizes the canvas only when the step changes, never every frame.

const WINDOW = 60;                 // frames in the rolling average
const REFRESH_MS = [1000 / 144, 1000 / 120, 1000 / 90, 1000 / 60];
const SMOOTH_FACTOR = 1.1;         // "smooth" = within 10% of the screen's frame time
const RETRY_GUARD_SEC = 20;        // a step up that fails within this long is not retried

// options: { steps, slowFactor, downSec, upSec, upGapSec } (see config.js).
export function createQuality(options = {}) {
  const q = {
    steps: (options.steps && options.steps.length ? options.steps : [2, 1.5, 1.25]).slice(),
    slowFactor: options.slowFactor ?? 1.25,
    downSec: options.downSec ?? 2,
    upSec: options.upSec ?? 10,
    upGapSec: options.upGapSec ?? 20,
    step: 0,            // index into steps (0 = sharpest)
    best: 0,            // the sharpest step still worth trying
    lite: false,        // true once effects were forced to Lite for this run
    refreshMs: 1000 / 60, // the screen's own frame time (see noteRefresh)
    samples: new Float64Array(WINDOW),
    count: 0,
    index: 0,
    sum: 0,
    average: 0,         // average frame time, ms
    slowFor: 0,         // seconds spent too slow in a row
    smoothFor: 0,       // seconds spent smooth in a row
    sinceUp: Infinity,  // seconds since the last step up
    fastest: Infinity,  // quickest 10-frame average seen (for noteRefresh)
    burst: 0,
    burstCount: 0,
  };
  return q;
}

// The current device-pixel-ratio cap.
export function qualityScale(q) {
  return q.steps[q.step];
}

// Forget the measurements (after a step change, a pause or a new run).
function clearSamples(q) {
  q.count = 0;
  q.index = 0;
  q.sum = 0;
  q.average = 0;
  q.slowFor = 0;
  q.smoothFor = 0;
}

// A new run: effects go back to the owner's choice. The resolution step is
// kept (the phone is the same phone).
export function resetQualityRun(q) {
  q.lite = false;
  clearSamples(q);
}

// Call after a pause or any long gap, so one long frame isn't counted.
export function pauseQuality(q) {
  clearSamples(q);
}

// Work out the screen's own frame time from the quickest frames seen: the
// fastest 10-frame average, snapped to a common refresh rate.
function noteRefresh(q, frameMs) {
  q.burst += frameMs;
  if (++q.burstCount < 10) return;
  const avg = q.burst / 10;
  q.burst = 0;
  q.burstCount = 0;
  if (avg >= q.fastest) return;
  q.fastest = avg;
  let best = REFRESH_MS[REFRESH_MS.length - 1];
  for (const ms of REFRESH_MS) {
    if (Math.abs(avg - ms) < Math.abs(avg - best)) best = ms;
  }
  // Only ever move to a faster screen rate: slow frames say nothing about the screen.
  if (best < q.refreshMs && avg < best * 1.12) q.refreshMs = best;
}

// Call once per played frame with that frame's time in milliseconds.
// allowUp: false while a step up would be unwelcome (mid-crash).
// Returns 'down', 'up' or 'lite' when something changed, otherwise null.
export function updateQuality(q, frameMs, allowUp = true) {
  if (!(frameMs > 0) || frameMs > 250) return null; // a hiccup or a pause, not a frame rate
  noteRefresh(q, frameMs);
  if (q.count === WINDOW) q.sum -= q.samples[q.index];
  else q.count++;
  q.samples[q.index] = frameMs;
  q.sum += frameMs;
  q.index = (q.index + 1) % WINDOW;
  q.average = q.sum / q.count;
  const sec = frameMs / 1000;
  q.sinceUp += sec;
  if (q.count < WINDOW) return null; // not enough frames yet

  const slow = q.average > q.refreshMs * q.slowFactor;
  const smooth = q.average <= q.refreshMs * SMOOTH_FACTOR;
  q.slowFor = slow ? q.slowFor + sec : 0;
  q.smoothFor = smooth ? q.smoothFor + sec : 0;

  if (q.slowFor >= q.downSec) {
    if (q.step < q.steps.length - 1) {
      // If we only just stepped up to here, this step is too much: don't try it again.
      if (q.sinceUp < RETRY_GUARD_SEC) q.best = q.step + 1;
      q.step++;
      clearSamples(q);
      return 'down';
    }
    if (!q.lite) {
      q.lite = true;
      clearSamples(q);
      return 'lite';
    }
    q.slowFor = 0;
    return null;
  }
  if (allowUp && q.smoothFor >= q.upSec && q.sinceUp >= q.upGapSec && q.step > q.best) {
    q.step--;
    q.sinceUp = 0;
    clearSamples(q);
    return 'up';
  }
  return null;
}
