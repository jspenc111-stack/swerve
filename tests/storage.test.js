import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSave, writeSave, recordRun, defaultSave, STORAGE_KEY, rankOf, sortedHistory, clearHistory,
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
  assert.deepEqual(s.history[0], { score: 800, level: 5, startLevel: 3, at: 2000 });
  assert.deepEqual(s.history[1], { score: 300, level: 2, startLevel: 1, at: 1000 });
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
  assert.deepEqual(back.history, [{ score: 450, level: 3, startLevel: 1, at: 5000 }]);
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
    { score: 90, level: 3, startLevel: 1, at: 300 },
    { score: 50, level: 2, startLevel: 2, at: 200 },
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
