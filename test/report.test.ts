import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PendingUpdate } from '../src/gallery/types.js'
import { buildReport } from '../src/report.js'

const base: PendingUpdate = {
  id: 'pub.ext',
  displayName: 'Theme booster',
  installedVersion: '1.0.0',
  availableVersion: '2.0.0',
  releasedAt: '2026-11-01T00:00:00Z',
}

test('report lists both versions, the fixed/still/new sets and links', () => {
  const report = buildReport(
    {
      ...base,
      installedVulns: ['GHSA-B', 'GHSA-C'],
      malicious: ['GHSA-A', 'GHSA-B'],
    },
    new Date('2026-11-12T10:00:00Z'),
  )

  assert.match(report, /# Security report: Theme booster/)
  assert.match(report, /`pub\.ext`/)
  assert.match(report, /## Installed version: 1\.0\.0/)
  assert.match(report, /## Candidate version: 2\.0\.0 \(latest\)/)
  // fixed = installed minus candidate
  assert.match(report, /fixes.*\[GHSA-C\]/)
  // still affected = intersection
  assert.match(report, /Still affected.*\[GHSA-B\]/)
  // new = candidate minus installed
  assert.match(report, /New.*\[GHSA-A\]/)
  // every id links to osv.dev
  assert.match(report, /https:\/\/osv\.dev\/vulnerability\/GHSA-A/)
  // blocked note present: candidate has findings
  assert.match(report, /One-click install stays blocked/)
})

test('report omits the analysis when the installed version is clean', () => {
  const report = buildReport({ ...base, malicious: ['GHSA-A'] }, new Date())
  assert.ok(!report.includes('## Analysis'))
  assert.match(report, /## Installed version: 1\.0\.0/)
  assert.match(report, /No active OSV findings/)
  assert.match(report, /One-click install stays blocked/)
})

test('report with no findings anywhere has no blocked note', () => {
  const report = buildReport(base, new Date())
  assert.ok(!report.includes('One-click install stays blocked'))
  assert.equal(report.match(/No active OSV findings/g)?.length, 2)
})

test('report includes vulnerable bundled dependencies when present', () => {
  const report = buildReport(
    {
      ...base,
      depVulns: [{ name: 'leftpad', version: '3.2.5', ids: ['MAL-D1'] }],
    },
    new Date(),
  )
  assert.match(report, /## Vulnerable bundled dependencies/)
  assert.match(report, /leftpad 3\.2\.5: \[MAL-D1\]/)
})
