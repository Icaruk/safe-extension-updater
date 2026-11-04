import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRemovedPackages } from '../src/gallery/removed.js'

const SAMPLE = `# History of Extensions Removed from VS Marketplace

| Extension Identifier | Removal Date | Type |
|---|---|---|
| anthropic.claude-code | 10/28/2026 | Malware |
| VeniceProductions.marker-board | 11/03/2026 | Impersonation |
`

test('parses table rows, skipping header and separator', () => {
  const entries = parseRemovedPackages(SAMPLE)
  assert.equal(entries.size, 2)
  assert.deepEqual(entries.get('anthropic.claude-code'), { date: '10/28/2026', type: 'Malware' })
  assert.deepEqual(entries.get('veniceproductions.marker-board'), { date: '11/03/2026', type: 'Impersonation' })
})

test('non-table lines are ignored', () => {
  assert.equal(parseRemovedPackages('plain text\n| only | two |').size, 0)
})
