import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, recordRun, defaultSave, STORAGE_KEY } from '../js/storage.js';

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
