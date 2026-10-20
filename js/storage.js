// storage.js — the only saved data: best score and level (for each game
// mode), settings and a history of past runs (score, level reached, mode and
// when). It's kept on this phone in localStorage under one key. Nothing is
// ever sent anywhere.

export const STORAGE_KEY = 'swerve:v1';
export const CONTROL_MODES = ['sides', 'tilt', 'drag'];
export const GAME_MODES = ['classic', 'flight'];
export const DEFAULT_HISTORY_MAX = 100;

export function defaultSave() {
  return {
    bestScore: 0,          // Classic
    bestLevel: 1,
    flightBestScore: 0,    // 3D Flight
    flightBestLevel: 1,
    settings: {
      controls: 'sides', sound: true, vibration: true, startLevel: 1,
      mode: 'classic', invertY: false,
    },
    history: [],
  };
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null; // storage blocked (e.g. private mode)
  }
}

const isCount = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isLevel = (n) => isCount(n) && n >= 1;

// One past run: { score, level (reached), startLevel, at (time, ms since 1970),
// mode ('classic' or 'flight') }.
function cleanRun(run) {
  if (!run || typeof run !== 'object') return null;
  if (!isCount(run.score) || !isLevel(run.level) || !isCount(run.at)) return null;
  return {
    score: Math.floor(run.score),
    level: Math.floor(run.level),
    startLevel: isLevel(run.startLevel) ? Math.floor(run.startLevel) : 1,
    at: Math.floor(run.at),
    mode: GAME_MODES.includes(run.mode) ? run.mode : 'classic',
  };
}

// Always returns a complete, valid save. Missing or corrupted data → defaults.
export function loadSave(storage = defaultStorage(), max = DEFAULT_HISTORY_MAX) {
  const save = defaultSave();
  if (!storage) return save;
  let raw;
  try {
    raw = JSON.parse(storage.getItem(STORAGE_KEY));
  } catch {
    return save;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return save;
  if (isCount(raw.bestScore)) save.bestScore = Math.floor(raw.bestScore);
  if (isLevel(raw.bestLevel)) save.bestLevel = Math.floor(raw.bestLevel);
  if (isCount(raw.flightBestScore)) save.flightBestScore = Math.floor(raw.flightBestScore);
  if (isLevel(raw.flightBestLevel)) save.flightBestLevel = Math.floor(raw.flightBestLevel);
  const s = raw.settings;
  if (s && typeof s === 'object') {
    if (CONTROL_MODES.includes(s.controls)) save.settings.controls = s.controls;
    if (typeof s.sound === 'boolean') save.settings.sound = s.sound;
    if (typeof s.vibration === 'boolean') save.settings.vibration = s.vibration;
    if (isLevel(s.startLevel)) save.settings.startLevel = Math.floor(s.startLevel);
    if (GAME_MODES.includes(s.mode)) save.settings.mode = s.mode;
    if (typeof s.invertY === 'boolean') save.settings.invertY = s.invertY;
  }
  if (Array.isArray(raw.history)) {
    for (const run of raw.history) {
      const clean = cleanRun(run);
      if (clean) save.history.push(clean);
    }
    save.history.sort((a, b) => b.at - a.at); // newest first
    save.history.length = Math.min(save.history.length, max);
  }
  return save;
}

export function writeSave(save, storage = defaultStorage()) {
  if (!storage) return false;
  const clean = {
    bestScore: save.bestScore,
    bestLevel: save.bestLevel,
    flightBestScore: save.flightBestScore,
    flightBestLevel: save.flightBestLevel,
    settings: {
      controls: save.settings.controls,
      sound: save.settings.sound,
      vibration: save.settings.vibration,
      startLevel: save.settings.startLevel,
      mode: save.settings.mode,
      invertY: save.settings.invertY,
    },
    history: save.history.map(cleanRun).filter(Boolean),
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false; // storage full or blocked: the game keeps working
  }
}

// Best score for a game mode.
export function bestScoreOf(save, mode = 'classic') {
  return mode === 'flight' ? save.flightBestScore : save.bestScore;
}

// Records a finished run: updates that mode's best score/level and adds it to
// the history (newest first, oldest dropped beyond `max`). Returns true for a
// new best score in that mode. levelNumber and startLevel are 1-based; at is ms.
export function recordRun(save, score, levelNumber, startLevel = 1, at = Date.now(),
  max = DEFAULT_HISTORY_MAX, mode = 'classic') {
  const flight = mode === 'flight';
  const newBest = score > (flight ? save.flightBestScore : save.bestScore);
  if (flight) {
    if (newBest) save.flightBestScore = score;
    if (levelNumber > save.flightBestLevel) save.flightBestLevel = levelNumber;
  } else {
    if (newBest) save.bestScore = score;
    if (levelNumber > save.bestLevel) save.bestLevel = levelNumber;
  }
  if (score > 0) {
    save.history.unshift({ score, level: levelNumber, startLevel, at, mode: flight ? 'flight' : 'classic' });
    if (save.history.length > max) save.history.length = max;
  }
  return newBest;
}

// 1 = the highest score in that mode's history, 2 = second highest, …
export function rankOf(save, score, mode = 'classic') {
  let higher = 0;
  for (const run of save.history) if (run.mode === mode && run.score > score) higher++;
  return higher + 1;
}

export function runsIn(save, mode) {
  let n = 0;
  for (const run of save.history) if (run.mode === mode) n++;
  return n;
}

// History sorted for display: 'recent' (newest first) or 'top' (highest
// first). Pass a mode to list only that mode's runs.
export function sortedHistory(save, order, mode = null) {
  const list = mode ? save.history.filter((r) => r.mode === mode) : save.history.slice();
  if (order === 'top') list.sort((a, b) => b.score - a.score || b.at - a.at);
  else list.sort((a, b) => b.at - a.at);
  return list;
}

export function clearHistory(save) {
  save.history.length = 0;
}
