// storage.js — the only saved data: best score, best level, settings and a
// history of past runs (score, level reached and when). It's kept on this
// phone in localStorage under one key. Nothing is ever sent anywhere.

export const STORAGE_KEY = 'swerve:v1';
export const CONTROL_MODES = ['sides', 'tilt', 'drag'];
export const DEFAULT_HISTORY_MAX = 100;

export function defaultSave() {
  return {
    bestScore: 0,
    bestLevel: 1,
    settings: { controls: 'sides', sound: true, vibration: true, startLevel: 1 },
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

// One past run: { score, level (reached), startLevel, at (time, ms since 1970) }.
function cleanRun(run) {
  if (!run || typeof run !== 'object') return null;
  if (!isCount(run.score) || !isLevel(run.level) || !isCount(run.at)) return null;
  return {
    score: Math.floor(run.score),
    level: Math.floor(run.level),
    startLevel: isLevel(run.startLevel) ? Math.floor(run.startLevel) : 1,
    at: Math.floor(run.at),
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
  const s = raw.settings;
  if (s && typeof s === 'object') {
    if (CONTROL_MODES.includes(s.controls)) save.settings.controls = s.controls;
    if (typeof s.sound === 'boolean') save.settings.sound = s.sound;
    if (typeof s.vibration === 'boolean') save.settings.vibration = s.vibration;
    if (isLevel(s.startLevel)) save.settings.startLevel = Math.floor(s.startLevel);
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
    settings: {
      controls: save.settings.controls,
      sound: save.settings.sound,
      vibration: save.settings.vibration,
      startLevel: save.settings.startLevel,
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

// Records a finished run: updates best score/level and adds it to the history
// (newest first, oldest dropped beyond `max`). Returns true for a new best score.
// levelNumber and startLevel are 1-based; at is a time in ms.
export function recordRun(save, score, levelNumber, startLevel = 1, at = Date.now(), max = DEFAULT_HISTORY_MAX) {
  const newBest = score > save.bestScore;
  if (newBest) save.bestScore = score;
  if (levelNumber > save.bestLevel) save.bestLevel = levelNumber;
  if (score > 0) {
    save.history.unshift({ score, level: levelNumber, startLevel, at });
    if (save.history.length > max) save.history.length = max;
  }
  return newBest;
}

// 1 = this run is the highest score in the history, 2 = second highest, …
export function rankOf(save, score) {
  let higher = 0;
  for (const run of save.history) if (run.score > score) higher++;
  return higher + 1;
}

// History sorted for display: 'recent' (newest first) or 'top' (highest first).
export function sortedHistory(save, order) {
  const list = save.history.slice();
  if (order === 'top') list.sort((a, b) => b.score - a.score || b.at - a.at);
  else list.sort((a, b) => b.at - a.at);
  return list;
}

export function clearHistory(save) {
  save.history.length = 0;
}
