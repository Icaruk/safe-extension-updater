import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chunk, fetchOsvActive, fetchOsvReport, foldFindings, parseOsvBatch } from '../src/gallery/osv.js'

const live: unknown = JSON.parse(
  '{"results":[{"vulns":[{"id":"MAL-2026-5161","modified":"2026-06-02T12:15:51.000880Z"},{"id":"MAL-2026-5162","modified":"2026-06-02T12:15:50.952766Z"}]},{"vulns":[{"id":"MAL-2026-5162"}]},{},{}]}',
)

test('parseOsvBatch maps hits and leaves empty results undefined', () => {
  const parsed = parseOsvBatch(live)
  assert.deepEqual(parsed[0], ['MAL-2026-5161', 'MAL-2026-5162'])
  assert.deepEqual(parsed[1], ['MAL-2026-5162'])
  assert.equal(parsed[2], undefined)
  assert.equal(parsed[3], undefined)
})

test('parseOsvBatch tolerates garbage payloads without throwing', () => {
  assert.deepEqual(parseOsvBatch(undefined), [])
  assert.deepEqual(parseOsvBatch('nope'), [])
  assert.deepEqual(parseOsvBatch({}), [])
  assert.deepEqual(parseOsvBatch({ results: [null, 'x', { vulns: [null, {}, { id: 3 }, { id: 'MAL-1' }] }] }), [
    undefined,
    undefined,
    ['MAL-1'],
  ])
})

test('foldFindings dedups across identities and skips failed slots', () => {
  const folded = foldFindings([
    { extId: 'a.b', ids: ['CVE-1', 'CVE-2'] },
    { extId: 'a.b', ids: undefined }, // one identity failed: the other still reports
    { extId: 'a.b', ids: ['CVE-2', 'CVE-3'] }, // CVE-2 found by both: appears once
    { extId: 'c.d', ids: [] },
  ])
  assert.deepEqual(folded.get('a.b'), ['CVE-1', 'CVE-2', 'CVE-3'])
  assert.equal(folded.has('c.d'), false)
  assert.equal(folded.size, 1)
})

test('foldFindings keeps a single identity and handles empty input', () => {
  assert.deepEqual(foldFindings([{ extId: 'a.b', ids: ['MAL-1'] }]).get('a.b'), ['MAL-1'])
  assert.deepEqual(foldFindings([]), new Map())
})

test('chunk splits at the OSV batch cap', () => {
  assert.deepEqual(chunk([]), [])
  assert.deepEqual(chunk([1, 2, 3]), [[1, 2, 3]])
  assert.deepEqual(chunk(Array.from({ length: 100 }, (_, i) => i).map(String)).length, 1)
  const hundredOne = chunk(Array.from({ length: 101 }, (_, i) => i))
  assert.deepEqual([hundredOne.length, hundredOne[0]?.length, hundredOne[1]?.length], [2, 100, 1])
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})

/** One OSV query as sent over the wire: a commit slot or a package slot. */
type WireQuery = { readonly commit?: string; readonly package?: { readonly name?: string; readonly version?: string } }

/** Stub globalThis.fetch with a key → ids table; works in any call order. */
function stubOsv(table: ReadonlyMap<string, readonly string[]>): () => void {
  const original = globalThis.fetch
  const keyOf = (query: WireQuery): string =>
    query.commit !== undefined ? `commit:${query.commit}` : `pkg:${query.package?.name}|${query.package?.version ?? ''}`
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { queries: readonly WireQuery[] }
    const results = body.queries.map((query) => {
      const ids = table.get(keyOf(query))
      return ids ? { vulns: ids.map((id) => ({ id })) } : {}
    })
    return { ok: true, json: async () => ({ results }) } as Response
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test('fetchOsvActive reports repo-only CVEs the package slot misses', async () => {
  const restore = stubOsv(
    new Map([['commit:31bc248f1cde8dada598b3cb345e68528c5446c9', ['CVE-2026-11422', 'CVE-2022-45025']]]),
  )
  try {
    const ext = 'shd101wyy.markdown-preview-enhanced'
    const found = await fetchOsvActive(
      [ext],
      new Map([[ext, '0.8.18']]),
      'test-agent',
      new Map([[ext, ['31bc248f1cde8dada598b3cb345e68528c5446c9']]]),
    )
    assert.deepEqual(found.get(ext), ['CVE-2026-11422', 'CVE-2022-45025'])
  } finally {
    restore()
  }
})

test('fetchOsvReport folds identities and counts past findings', async () => {
  const installedSha = '31bc248f1cde8dada598b3cb345e68528c5446c9'
  const restore = stubOsv(
    new Map([
      [`commit:${'f'.repeat(40)}`, ['CVE-2022-45026']], // historical tag only: past
      [`commit:${installedSha}`, ['CVE-2026-11422']], // also historical for the candidate
      [`commit:${'e'.repeat(40)}`, ['CVE-2026-9999']], // candidate tag: active
    ]),
  )
  try {
    const ext = 'demo.ext'
    const report = await fetchOsvReport(
      [ext],
      new Map([[ext, '1.2.0']]),
      'test-agent',
      new Map([[ext, ['f'.repeat(40), installedSha]]]),
      new Map([[ext, ['e'.repeat(40)]]]),
    )
    assert.deepEqual(report.active.get(ext), ['CVE-2026-9999'])
    assert.equal(report.pastCount.get(ext), 2) // CVE-2022-45026 + CVE-2026-11422
  } finally {
    restore()
  }
})
