import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSave, writeSave, recordRun, defaultSave, STORAGE_KEY, rankOf, sortedHistory, clearHistory,
  bestScoreOf, runsIn, resetBests, GAME_MODES, collectiveSideOf, flightFeelOf, effectsOf, startingEffects,
} from '../js/storage.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

test('the storage key is swerve:v1', () => {
  assert.equal(STORAGE_KEY, 'swerve:v1');
});

test('defaults load when nothing is saved', () => {
  assert.deepEqual(loadSave(memoryStorage()), defaultSave());
  assert.deepEqual(loadSave(null), defaultSave());
  assert.equal(defaultSave().settings.controls, 'sides');
  assert.equal(defaultSave().settings.sound, true);
  assert.equal(defaultSave().settings.vibration, true);
});

test('saved values round-trip', () => {
  const store = memoryStorage();
  const s = defaultSave();
  s.bestScore = 1234;
  s.bestLevel = 5;
  s.settings.controls = 'tilt';
  s.settings.sound = false;
  assert.equal(writeSave(s, store), true);
  assert.deepEqual(loadSave(store), s);
  assert.deepEqual(Object.keys(store.data), ['swerve:v1']);
});

test('corrupted data resets safely to defaults', () => {
  const bad = ['not json{', '"a string"', '42', 'null', '[]', '{"bestScore":"lots"}',
    '{"bestScore":-5,"bestLevel":0}', '{"settings":"x"}', '{"bestScore":NaN}'];
  for (const raw of bad) {
    const loaded = loadSave(memoryStorage({ 'swerve:v1': raw }));
    assert.equal(loaded.bestScore, 0, raw);
    assert.equal(loaded.bestLevel, 1, raw);
    assert.equal(loaded.settings.controls, 'sides', raw);
  }
});

test('partly corrupted data keeps the good parts', () => {
  const raw = JSON.stringify({ bestScore: 900, settings: { controls: 'jetpack', sound: false } });
  const loaded = loadSave(memoryStorage({ 'swerve:v1': raw }));
  assert.equal(loaded.bestScore, 900);
  assert.equal(loaded.settings.controls, 'sides');
  assert.equal(loaded.settings.sound, false);
  assert.equal(loaded.settings.vibration, true);
});

test('a storage that throws never crashes the game', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('full'); },
  };
  assert.deepEqual(loadSave(broken), defaultSave());
  assert.equal(writeSave(defaultSave(), broken), false);
});

test('recordRun keeps the best score and level', () => {
  const s = defaultSave();
  assert.equal(recordRun(s, 500, 2), true);
  assert.equal(recordRun(s, 300, 1), false);
  assert.equal(s.bestScore, 500);
  assert.equal(s.bestLevel, 2);
});

test('history records runs newest first, with score, level, start level and time', () => {
  const s = defaultSave();
  recordRun(s, 300, 2, 1, 1000);
  recordRun(s, 800, 5, 3, 2000);
  recordRun(s, 0, 1, 1, 3000); // a zero-point run isn't worth keeping
  assert.equal(s.history.length, 2);
  assert.deepEqual(s.history[0], { score: 800, level: 5, startLevel: 3, at: 2000, mode: 'classic' });
  assert.deepEqual(s.history[1], { score: 300, level: 2, startLevel: 1, at: 1000, mode: 'classic' });
  assert.equal(s.bestScore, 800);
  assert.equal(s.bestLevel, 5);
});

test('history keeps only the newest runs up to the limit', () => {
  const s = defaultSave();
  for (let i = 1; i <= 12; i++) recordRun(s, i * 10, 1, 1, i, 10);
  assert.equal(s.history.length, 10);
  assert.equal(s.history[0].score, 120);
  assert.equal(s.history.at(-1).score, 30);
});

test('history round-trips, and bad entries are dropped without losing good ones', () => {
  const store = memoryStorage();
  const s = defaultSave();
  recordRun(s, 450, 3, 1, 5000);
  s.settings.startLevel = 4;
  writeSave(s, store);
  const back = loadSave(store);
  assert.deepEqual(back.history, [{ score: 450, level: 3, startLevel: 1, at: 5000, mode: 'classic' }]);
  assert.equal(back.settings.startLevel, 4);

  const raw = JSON.stringify({
    bestScore: 10,
    settings: { startLevel: 'eight' },
    history: [
      { score: 50, level: 2, startLevel: 2, at: 200 },
      { score: 'lots', level: 1, at: 1 },
      null,
      { score: 70, level: 0, at: 5 },
      { score: 90, level: 3, at: 300 }, // missing startLevel → 1
      'nonsense',
    ],
  });
  const loaded = loadSave(memoryStorage({ 'swerve:v1': raw }));
  assert.equal(loaded.settings.startLevel, 1);
  assert.deepEqual(loaded.history, [
    { score: 90, level: 3, startLevel: 1, at: 300, mode: 'classic' },
    { score: 50, level: 2, startLevel: 2, at: 200, mode: 'classic' },
  ]);
  const notList = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify({ history: { a: 1 } }) }));
  assert.deepEqual(notList.history, []);
});

test('top scores, rank and clearing the history', () => {
  const s = defaultSave();
  recordRun(s, 300, 1, 1, 1);
  recordRun(s, 900, 1, 1, 2);
  recordRun(s, 500, 1, 1, 3);
  assert.deepEqual(sortedHistory(s, 'top').map((r) => r.score), [900, 500, 300]);
  assert.deepEqual(sortedHistory(s, 'recent').map((r) => r.score), [500, 900, 300]);
  assert.equal(rankOf(s, 900), 1);
  assert.equal(rankOf(s, 500), 2);
  assert.equal(rankOf(s, 300), 3);
  clearHistory(s);
  assert.equal(s.history.length, 0);
  assert.equal(s.bestScore, 900, 'clearing history keeps the best score');
});

test('each game mode keeps its own best score, and history remembers the mode', () => {
  const store = memoryStorage();
  const s = defaultSave();
  assert.equal(recordRun(s, 500, 3, 1, 10, 100, 'classic'), true);
  assert.equal(recordRun(s, 200, 2, 1, 20, 100, 'flight'), true, 'first 3D run is a 3D best');
  assert.equal(recordRun(s, 300, 4, 1, 30, 100, 'flight'), true);
  assert.equal(recordRun(s, 250, 2, 1, 40, 100, 'flight'), false);
  assert.equal(bestScoreOf(s, 'classic'), 500);
  assert.equal(bestScoreOf(s, 'flight'), 300);
  assert.equal(s.bestLevel, 3);
  assert.equal(s.flightBestLevel, 4);
  assert.equal(rankOf(s, 250, 'flight'), 2);
  assert.equal(rankOf(s, 250, 'classic'), 2);
  assert.equal(runsIn(s, 'flight'), 3);
  assert.deepEqual(sortedHistory(s, 'top', 'flight').map((r) => r.score), [300, 250, 200]);
  assert.equal(sortedHistory(s, 'recent').length, 4);
  s.settings.mode = 'flight';
  s.settings.invertY = true;
  writeSave(s, store);
  const back = loadSave(store);
  assert.equal(back.flightBestScore, 300);
  assert.equal(back.settings.mode, 'flight');
  assert.equal(back.settings.invertY, true);
  assert.equal(back.history[0].mode, 'flight');
  // Bad values fall back to defaults.
  const bad = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify({ settings: { mode: 'space', invertY: 'yes' }, flightBestScore: -4 }) }));
  assert.equal(bad.settings.mode, 'classic');
  assert.equal(bad.settings.invertY, false);
  assert.equal(bad.flightBestScore, 0);
});

test('the 3D auto-fire setting saves, and defaults to on', () => {
  assert.equal(defaultSave().settings.autoFire, true);
  const store = memoryStorage();
  const s = defaultSave();
  s.settings.autoFire = false;
  writeSave(s, store);
  assert.equal(loadSave(store).settings.autoFire, false);
  const bad = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify({ settings: { autoFire: 'yes' } }) }));
  assert.equal(bad.settings.autoFire, true);
});

// ---- Helicopter mode (v1.4) ----

test('an old v1.3 save loads unchanged and gains the Helicopter fields', () => {
  const old = {
    bestScore: 1200, bestLevel: 4, flightBestScore: 800, flightBestLevel: 3,
    settings: { controls: 'drag', sound: false, vibration: true, startLevel: 2, mode: 'flight', invertY: true, autoFire: false },
    history: [
      { score: 1200, level: 4, startLevel: 1, at: 2000, mode: 'classic' },
      { score: 800, level: 3, startLevel: 1, at: 1000, mode: 'flight' },
    ],
  };
  const loaded = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify(old) }));
  assert.equal(loaded.heliBestScore, 0);
  assert.equal(loaded.heliBestLevel, 1);
  for (const [k, v] of Object.entries(old)) assert.deepEqual(loaded[k], v, k);
});

test('Helicopter runs save, filter and rank separately', () => {
  const store = memoryStorage();
  const s = defaultSave();
  assert.deepEqual(GAME_MODES, ['classic', 'flight', 'heli', 'chopper']); // v1.5 added 3D Heli
  recordRun(s, 900, 3, 1, 100, 100, 'classic');
  assert.equal(recordRun(s, 400, 2, 1, 200, 100, 'heli'), true);
  assert.equal(recordRun(s, 300, 1, 1, 300, 100, 'heli'), false);
  assert.equal(recordRun(s, 650, 4, 2, 400, 100, 'heli'), true);
  assert.equal(s.heliBestScore, 650);
  assert.equal(s.heliBestLevel, 4);
  assert.equal(s.bestScore, 900, 'Classic best untouched');
  assert.equal(s.flightBestScore, 0, '3D best untouched');
  assert.equal(bestScoreOf(s, 'heli'), 650);
  assert.equal(runsIn(s, 'heli'), 3);
  assert.equal(rankOf(s, 500, 'heli'), 2);
  assert.equal(rankOf(s, 500, 'classic'), 2);
  assert.deepEqual(sortedHistory(s, 'top', 'heli').map((r) => r.score), [650, 400, 300]);
  assert.ok(sortedHistory(s, 'recent', 'heli').every((r) => r.mode === 'heli'));
  writeSave(s, store);
  const back = loadSave(store);
  assert.equal(back.heliBestScore, 650);
  assert.equal(back.heliBestLevel, 4);
  assert.deepEqual(sortedHistory(back, 'top', 'heli').map((r) => r.score), [650, 400, 300]);
  assert.deepEqual(Object.keys(store.data), ['swerve:v1']);
});

test("settings.mode = 'heli' round-trips", () => {
  const store = memoryStorage();
  const s = defaultSave();
  s.settings.mode = 'heli';
  writeSave(s, store);
  assert.equal(loadSave(store).settings.mode, 'heli');
  assert.deepEqual(loadSave(store), s);
});

test('resetting best scores resets every mode and keeps the history', () => {
  const s = defaultSave();
  recordRun(s, 100, 2, 1, 1, 100, 'classic');
  recordRun(s, 200, 3, 1, 2, 100, 'flight');
  recordRun(s, 300, 4, 1, 3, 100, 'heli');
  resetBests(s);
  const fresh = defaultSave();
  for (const k of ['bestScore', 'bestLevel', 'flightBestScore', 'flightBestLevel', 'heliBestScore', 'heliBestLevel']) {
    assert.equal(s[k], fresh[k], k);
  }
  assert.equal(s.history.length, 3);
});

test('the 3D Heli collective side saves, and defaults to left', () => {
  assert.equal(collectiveSideOf(defaultSave()), 'left');
  const store = memoryStorage();
  const s = defaultSave();
  s.settings.collectiveSide = 'right';
  writeSave(s, store);
  assert.equal(collectiveSideOf(loadSave(store)), 'right');
  const bad = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify({ settings: { collectiveSide: 'middle' } }) }));
  assert.equal(collectiveSideOf(bad), 'left');
});

test('3D Flight Steering feel: defaults to fine; medium and quick round-trip', () => {
  assert.equal(flightFeelOf(defaultSave()), 'fine');
  assert.equal('flightFeel' in defaultSave().settings, false, 'only stored once set');
  for (const feel of ['medium', 'quick', 'fine']) {
    const store = memoryStorage();
    const s = defaultSave();
    s.settings.flightFeel = feel;
    writeSave(s, store);
    assert.equal(JSON.parse(store.getItem('swerve:v1')).settings.flightFeel, feel, 'saved inside swerve:v1');
    assert.equal(flightFeelOf(loadSave(store)), feel);
  }
  // Not set: nothing extra is written.
  const store = memoryStorage();
  writeSave(defaultSave(), store);
  assert.equal('flightFeel' in JSON.parse(store.getItem('swerve:v1')).settings, false);
});

test('3D Flight Steering feel: invalid values fall back to fine', () => {
  for (const bad of ['FAST', 'toString', 3, null, true, '']) {
    const loaded = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify({ settings: { flightFeel: bad } }) }));
    assert.equal(flightFeelOf(loaded), 'fine', String(bad));
    const s = defaultSave();
    s.settings.flightFeel = bad;
    const store = memoryStorage();
    writeSave(s, store);
    assert.equal('flightFeel' in JSON.parse(store.getItem('swerve:v1')).settings, false, `${bad} is not saved`);
  }
});

test('3D Flight Steering feel: an older save (from before v1.5.4) loads unchanged and plays as Fine', () => {
  const old = {
    bestScore: 120, bestLevel: 3, flightBestScore: 900, flightBestLevel: 4,
    settings: { controls: 'drag', sound: false, vibration: true, startLevel: 2, mode: 'flight', invertY: true, autoFire: false, collectiveSide: 'right' },
    history: [{ score: 900, level: 4, startLevel: 1, at: 1000, mode: 'flight' }],
  };
  const loaded = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify(old) }));
  assert.equal(flightFeelOf(loaded), 'fine');
  assert.equal(loaded.flightBestScore, 900);
  assert.equal(loaded.settings.controls, 'drag');
  assert.equal(loaded.settings.invertY, true);
  assert.equal(loaded.settings.autoFire, false);
  assert.equal(collectiveSideOf(loaded), 'right');
  assert.equal(loaded.history.length, 1);
});

// ---- v1.6: the Visual effects setting (settings.effects) ----

test('effects: defaults to full, and is only stored once set', () => {
  assert.equal(effectsOf(defaultSave()), 'full');
  assert.equal('effects' in defaultSave().settings, false, 'only stored once set');
  const store = memoryStorage();
  writeSave(defaultSave(), store);
  assert.equal('effects' in JSON.parse(store.getItem('swerve:v1')).settings, false);
});

test('effects: lite (and full) round-trip inside swerve:v1', () => {
  for (const level of ['lite', 'full']) {
    const store = memoryStorage();
    const s = defaultSave();
    s.settings.effects = level;
    writeSave(s, store);
    assert.equal(JSON.parse(store.getItem('swerve:v1')).settings.effects, level, 'saved inside swerve:v1');
    assert.equal(effectsOf(loadSave(store)), level);
    assert.deepEqual(Object.keys(store.data ?? { 'swerve:v1': 1 }), ['swerve:v1'], 'no other key is written');
  }
});

test('effects: invalid values are rejected on load and on save', () => {
  for (const bad of ['ultra', 'Lite', '', 0, true, null, ['lite'], { level: 'lite' }]) {
    const loaded = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify({ settings: { effects: bad } }) }));
    assert.equal(effectsOf(loaded), 'full', String(bad));
    assert.equal('effects' in loaded.settings, false);
    const store = memoryStorage();
    const s = defaultSave();
    s.settings.effects = bad;
    writeSave(s, store);
    assert.equal('effects' in JSON.parse(store.getItem('swerve:v1')).settings, false, `${String(bad)} is not saved`);
  }
});

test('effects: old saves (v1.5.4 and earlier) load unchanged and play on Full', () => {
  const old = {
    bestScore: 1234, bestLevel: 5, flightBestScore: 77, flightBestLevel: 2,
    settings: { controls: 'drag', sound: false, vibration: true, startLevel: 3, mode: 'flight', invertY: true, autoFire: false, flightFeel: 'quick', collectiveSide: 'right' },
    history: [{ score: 1234, level: 5, startLevel: 1, at: 1700000000000, mode: 'classic' }],
  };
  const loaded = loadSave(memoryStorage({ 'swerve:v1': JSON.stringify(old) }));
  assert.equal(loaded.bestScore, 1234);
  assert.equal(loaded.settings.controls, 'drag');
  assert.equal(loaded.settings.flightFeel, 'quick');
  assert.equal(loaded.history.length, 1);
  assert.equal(effectsOf(loaded), 'full');
  assert.equal('effects' in loaded.settings, false);
});

test('effects: with "reduce motion" on, a phone that has never chosen starts on Lite; a choice always wins', () => {
  const fresh = defaultSave();
  assert.equal(startingEffects(fresh, false), 'full');
  assert.equal(startingEffects(fresh, true), 'lite');
  assert.equal('effects' in fresh.settings, false, 'nothing is stored just by starting on Lite');
  const chose = defaultSave();
  chose.settings.effects = 'full';
  assert.equal(startingEffects(chose, true), 'full');
  chose.settings.effects = 'lite';
  assert.equal(startingEffects(chose, false), 'lite');
});
