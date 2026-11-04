import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isEngineCompatible, parseSemver } from '../src/core/versioning.js';

test('parseSemver handles plain, v-prefixed and prerelease versions', () => {
  assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] });
  assert.deepEqual(parseSemver('v2.10.0'), { major: 2, minor: 10, patch: 0, prerelease: [] });
  assert.equal(parseSemver('2026.11.2026102901')?.minor, 11);
  assert.deepEqual(parseSemver('1.90.0-insider'), {
    major: 1,
    minor: 90,
    patch: 0,
    prerelease: ['insider'],
  });
  assert.equal(parseSemver('1.90.0-insider+build.7')?.prerelease.join('.'), 'insider');
  assert.equal(parseSemver('latest'), undefined);
  assert.equal(parseSemver('1.2'), undefined);
});

test('compareVersions orders semver, including date-like versions', () => {
  assert.ok(compareVersions('1.2.3', '1.10.0') < 0);
  assert.ok(compareVersions('2.0.0', '1.9.9') > 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.ok(compareVersions('2026.11.2026102901', '2026.10.2026091501') > 0);
  assert.ok(compareVersions('2024.9.11721010', '2026.11.2026102901') < 0);
});

test('prerelease versions rank below their release', () => {
  assert.ok(compareVersions('1.2.3-alpha', '1.2.3') < 0);
  assert.ok(compareVersions('1.0.0-beta.2', '1.0.0-beta.10') < 0);
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0-beta') > 0);
  assert.ok(compareVersions('1.0.0-beta', '1.0.0-beta.1') < 0);
});

test('isEngineCompatible covers ^ ~ >= > <= < = * and unknown engines', () => {
  assert.equal(isEngineCompatible('^1.95.0', '1.101.0'), true);
  assert.equal(isEngineCompatible('^1.101.0', '1.95.0'), false);
  assert.equal(isEngineCompatible('^1.90.0', '2.0.0'), false);
  assert.equal(isEngineCompatible('^1.101.0', '1.101.0'), true);
  assert.equal(isEngineCompatible('^0.2.3', '0.2.9'), true);
  assert.equal(isEngineCompatible('^0.2.3', '0.3.0'), false);
  // legacy ^0.x engines run on any 1.x host (VS Code rewrite rule), not on 0.x minor drift or 2.x
  assert.equal(isEngineCompatible('^0.10.10', '1.104.0'), true);
  assert.equal(isEngineCompatible('^0.2.3', '1.0.0'), true);
  assert.equal(isEngineCompatible('^0.2.3', '2.0.0'), false);
  assert.equal(isEngineCompatible('~1.95.0', '1.95.4'), true);
  assert.equal(isEngineCompatible('~1.95.0', '1.96.0'), false);
  assert.equal(isEngineCompatible('>=1.80.0', '1.79.9'), false);
  assert.equal(isEngineCompatible('>=1.80.0', '2.0.0'), true);
  assert.equal(isEngineCompatible('<2.0.0', '1.99.0'), true);
  assert.equal(isEngineCompatible('<2.0.0', '2.0.0'), false);
  assert.equal(isEngineCompatible('*', '1.50.0'), true);
  assert.equal(isEngineCompatible('', '1.90.0'), true);
  assert.equal(isEngineCompatible('nonsense!!', '1.90.0'), true);
  assert.equal(isEngineCompatible('^1.101.0', 'banana'), true); // unparseable host stays permissive
  assert.equal(isEngineCompatible('^1.89.0-20240415', '1.101.0'), true); // engine range with suffix
  assert.equal(isEngineCompatible('^1.95.0', '1.95.0-insider'), true); // insider host stripped
});
