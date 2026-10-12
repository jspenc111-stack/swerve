// storage.js — the only saved data: best score, best level and settings,
// kept on this phone in localStorage under one key. Nothing is ever sent.

export const STORAGE_KEY = 'swerve:v1';
export const CONTROL_MODES = ['sides', 'tilt', 'drag'];

export function defaultSave() {
  return {
    bestScore: 0,
    bestLevel: 1,
    settings: { controls: 'sides', sound: true, vibration: true },
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

// Always returns a complete, valid save. Missing or corrupted data → defaults.
export function loadSave(storage = defaultStorage()) {
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
  if (isCount(raw.bestLevel) && raw.bestLevel >= 1) save.bestLevel = Math.floor(raw.bestLevel);
  const s = raw.settings;
  if (s && typeof s === 'object') {
    if (CONTROL_MODES.includes(s.controls)) save.settings.controls = s.controls;
    if (typeof s.sound === 'boolean') save.settings.sound = s.sound;
    if (typeof s.vibration === 'boolean') save.settings.vibration = s.vibration;
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
    },
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false; // storage full or blocked: the game keeps working
  }
}

// Updates best score/level if beaten. Returns true for a new best score.
export function recordRun(save, score, levelNumber) {
  const newBest = score > save.bestScore;
  if (newBest) save.bestScore = score;
  if (levelNumber > save.bestLevel) save.bestLevel = levelNumber;
  return newBest;
}
