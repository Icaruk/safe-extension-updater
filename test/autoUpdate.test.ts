import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoUpdateState, optInsAutoUpdate } from '../src/core/autoUpdateValue.js';

test('autoUpdateState maps the enum to enabled / partial / disabled', () => {
  assert.equal(autoUpdateState('on'), 'enabled');
  assert.equal(autoUpdateState(true), 'enabled'); // legacy
  assert.equal(autoUpdateState(undefined), 'enabled'); // missing → default 'on'
  assert.equal(autoUpdateState('onlyEnabledExtensions'), 'partial');
  assert.equal(autoUpdateState('onlySelectedExtensions'), 'partial');
  assert.equal(autoUpdateState('off'), 'disabled');
  assert.equal(autoUpdateState(false), 'disabled'); // legacy
  assert.equal(autoUpdateState('garbage'), 'enabled'); // unknown value → assume active
});

test('optInsAutoUpdate is true only for a non-empty opt-in list', () => {
  assert.equal(optInsAutoUpdate(['biomejs.biome']), true);
  assert.equal(optInsAutoUpdate(['biome']), true); // publisher (no dot) counts too
  assert.equal(optInsAutoUpdate([]), false);
  assert.equal(optInsAutoUpdate(undefined), false);
  assert.equal(optInsAutoUpdate('garbage'), false);
});
