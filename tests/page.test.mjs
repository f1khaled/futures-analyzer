import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { HTML } from './helpers.mjs';

test('the page script parses without syntax errors', () => {
  const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s));
});

test('every element id used by the script exists in the page', () => {
  const ids = new Set([...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const used = new Set([...HTML.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]));
  for (const id of used) assert.ok(ids.has(id), `missing element #${id}`);
});

test('no external scripts are loaded (single-file, no dependencies)', () => {
  assert.equal(/<script[^>]+src=/.test(HTML), false);
});
