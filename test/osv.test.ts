import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOsvReport, parseOsvBatch } from '../src/gallery/osv.js';

const live: unknown = JSON.parse(
  '{"results":[{"vulns":[{"id":"MAL-2026-5161","modified":"2026-06-02T12:15:51.000880Z"},{"id":"MAL-2026-5162","modified":"2026-06-02T12:15:50.952766Z"}]},{"vulns":[{"id":"MAL-2026-5162"}]},{},{}]}',
);

test('parseOsvBatch maps hits and leaves empty results undefined', () => {
  const parsed = parseOsvBatch(live);
  assert.deepEqual(parsed[0], ['MAL-2026-5161', 'MAL-2026-5162']);
  assert.deepEqual(parsed[1], ['MAL-2026-5162']);
  assert.equal(parsed[2], undefined);
  assert.equal(parsed[3], undefined);
});

test('parseOsvBatch tolerates garbage payloads without throwing', () => {
  assert.deepEqual(parseOsvBatch(undefined), []);
  assert.deepEqual(parseOsvBatch('nope'), []);
  assert.deepEqual(parseOsvBatch({}), []);
  assert.deepEqual(parseOsvBatch({ results: [null, 'x', { vulns: [null, {}, { id: 3 }, { id: 'MAL-1' }] }] }), [
    undefined,
    undefined,
    ['MAL-1'],
  ]);
});

test('buildOsvReport splits active from past entries', () => {
  const report = buildOsvReport(['a.b', 'c.d'], [['MAL-1', 'MAL-2'], undefined], [['MAL-1'], undefined]);
  assert.deepEqual(report.active.get('a.b'), ['MAL-1']);
  assert.equal(report.pastCount.get('a.b'), 1);
  assert.equal(report.active.has('c.d'), false);
  assert.equal(report.pastCount.has('c.d'), false);
});
