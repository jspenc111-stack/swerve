// Checks the app's files: offline list, relative paths, privacy rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function appFiles() {
  const files = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js'];
  for (const f of readdirSync(join(root, 'js'))) if (f.endsWith('.js')) files.push(`js/${f}`);
  for (const f of readdirSync(join(root, 'icons'))) files.push(`icons/${f}`);
  return files;
}

function precacheList() {
  const sw = read('sw.js');
  const block = sw.slice(sw.indexOf('const PRECACHE = ['), sw.indexOf('];', sw.indexOf('const PRECACHE = [')));
  return [...block.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
}

test('APP_VERSION looks like a version number', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test('every app file is precached for offline play, and every precached file exists', () => {
  const list = precacheList();
  for (const f of appFiles()) {
    if (f === 'sw.js') continue;
    assert.ok(list.includes(`./${f}`), `${f} missing from sw.js PRECACHE`);
  }
  for (const entry of list) {
    if (entry === './') continue;
    assert.ok(existsSync(join(root, entry)), `${entry} is precached but does not exist`);
  }
});

test('the Content Security Policy is present and strict', () => {
  const html = read('index.html');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.ok(html.includes("default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'"));
});

test('no external URLs, scripts, fonts or network calls in app files', () => {
  for (const f of appFiles()) {
    if (f.endsWith('.png')) continue;
    // The SVG namespace is an identifier, not a download.
    const text = read(f).replaceAll('xmlns="http://www.w3.org/2000/svg"', '');
    assert.ok(!/https?:\/\//i.test(text), `${f} contains an external URL`);
    assert.ok(!/\/\/[a-z0-9.-]+\.(com|net|org|io|dev)/i.test(text), `${f} references another site`);
    assert.ok(!/XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(text), `${f} makes network calls`);
  }
});

test('paths are relative (the site lives in a /swerve/ subfolder)', () => {
  const html = read('index.html');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(m[1].startsWith('./'), `index.html uses non-relative path ${m[1]}`);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  // A fixed app ID keeps Chrome from mixing up installs (never change it once set).
  assert.equal(manifest.id, 'swerve');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) assert.ok(icon.src.startsWith('./'));
  for (const f of appFiles().filter((x) => x.endsWith('.js'))) {
    for (const m of read(f).matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(m[1].startsWith('./') || m[1].startsWith('node:'), `${f} imports ${m[1]}`);
    }
  }
});

test('only the swerve:v1 key is used in localStorage', () => {
  for (const f of appFiles().filter((x) => x.endsWith('.js'))) {
    const text = read(f);
    for (const m of text.matchAll(/localStorage\.(getItem|setItem|removeItem)\(([^,)]+)/g)) {
      assert.ok(/KEY|'swerve:v1'/.test(m[2]), `${f} uses another localStorage key: ${m[2]}`);
    }
  }
});
