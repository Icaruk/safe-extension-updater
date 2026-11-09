/**
 * Live OSV.dev + GitHub checks against an extension whose CVEs are filed
 * against its source repository. Real network, real data: run with
 * `npm run test:live` (OSV_LIVE=1); the offline suite skips this. OSV
 * contents evolve, so assertions stay on stable facts (an id is present,
 * a count is at least N), not full lists.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchOsvActive, fetchOsvActiveEntries, fetchOsvReport } from '../src/gallery/osv.js'
import { fetchRepoTags, tagShas } from '../src/gallery/repo.js'

const live = process.env.OSV_LIVE === '1'
const userAgent = 'safe-extension-updater-live-test'

const slug = 'shd101wyy/vscode-markdown-preview-enhanced'
const extId = 'shd101wyy.markdown-preview-enhanced'
const affectedVersion = '0.8.18' // tag commit affected by known CVEs
const affectedCve = 'CVE-2026-11422' // 0.8.x code injection, filed against the repo
const pastCve = 'CVE-2022-45026' // single-commit GIT range: only a historical tag reaches it
const cleanVersion = '0.8.40'

test(`live: ${extId} known CVEs via the repo identity`, { skip: !live }, async () => {
  const { status, tags } = await fetchRepoTags(slug, userAgent)
  assert.equal(status, undefined)
  assert.ok(tags.size > 80)

  const affected = tagShas(tags, affectedVersion)
  assert.ok(affected !== undefined)
  const clean = tagShas(tags, cleanVersion) ?? []

  // 1. The Marketplace identity alone finds nothing here: these CVEs are
  //    GIT-range records, reachable only through the commit identity.
  const [pkg] = await fetchOsvActiveEntries('VSCode', [{ name: extId, version: affectedVersion }], userAgent)
  assert.equal(pkg, undefined)

  // 2. The affected version's tag commit carries its CVEs ("Must update").
  const installedFindings = await fetchOsvActive(
    [extId],
    new Map([[extId, affectedVersion]]),
    userAgent,
    new Map([[extId, affected]]),
  )
  const ids = installedFindings.get(extId) ?? []
  assert.ok(ids.includes(affectedCve), `expected ${affectedCve} in [${ids.join(', ')}]`)
  assert.ok(ids.length >= 5)

  // 3. The union over every tag commit surfaces past CVEs that no version
  //    query can reach (this also exercises chunking: > 100 commits).
  const history = [...new Set(tags.values())]
  const union = await fetchOsvActive(
    [extId],
    new Map([[extId, affectedVersion]]),
    userAgent,
    new Map([[extId, history]]),
  )
  const unionIds = union.get(extId) ?? []
  assert.ok(unionIds.includes(pastCve), `expected ${pastCve} in [${unionIds.join(', ')}]`)

  // 4. Report: the clean candidate is not blocked and past findings count.
  const report = await fetchOsvReport(
    [extId],
    new Map([[extId, cleanVersion]]),
    userAgent,
    new Map([[extId, history]]),
    new Map([[extId, clean]]),
  )
  assert.equal(report.active.get(extId), undefined)
  assert.ok((report.pastCount.get(extId) ?? 0) >= 2)
})
