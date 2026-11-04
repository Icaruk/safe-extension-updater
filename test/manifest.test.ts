import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manifestToInstalled } from '../src/core/manifest.js';

test('manifestToInstalled narrows a valid manifest, lowercasing the id', () => {
  assert.deepEqual(manifestToInstalled(
    { publisher: 'Anthropic', name: 'claude-code', version: '2.1.3', displayName: 'Claude' },
    false,
  ), {
    id: 'anthropic.claude-code',
    displayName: 'Claude',
    version: '2.1.3',
    prerelease: false,
    manifestPreRelease: undefined,
  });
});

test('displayName falls back to the name; preRelease flag passes through', () => {
  const entry = manifestToInstalled({ publisher: 'a', name: 'b', version: '1.0.0', preRelease: true }, false);
  assert.equal(entry?.displayName, 'b');
  assert.equal(entry?.manifestPreRelease, true);
});

test('manifestToInstalled rejects garbage, missing fields and builtins', () => {
  assert.equal(manifestToInstalled(undefined, false), undefined);
  assert.equal(manifestToInstalled('nope', false), undefined);
  assert.equal(manifestToInstalled({ publisher: 'a' }, false), undefined);
  assert.equal(manifestToInstalled({ publisher: 'a', name: 'b' }, false), undefined);
  assert.equal(manifestToInstalled({ publisher: 'a', name: 'b', version: '' }, false), undefined);
  assert.equal(manifestToInstalled({ publisher: 'a', name: 'b', version: '1', isBuiltin: true }, false), undefined);
  assert.equal(manifestToInstalled({ publisher: 'a', name: 'b', version: '1' }, true), undefined);
});
