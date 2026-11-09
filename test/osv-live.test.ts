/**
 * Live OSV.dev + GitHub checks against extensions with well-known CVEs.
 * Real network, real data: run with `npm run test:live` (OSV_LIVE=1); the
 * offline suite skips these. OSV contents evolve, so assertions stay on
 * stable facts (an id is present, a count is at least N), not full lists.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchOsvActive, fetchOsvActiveEntries, fetchOsvReport } from '../src/gallery/osv.js'
import { fetchRepoTags, tagShas } from '../src/gallery/repo.js'

/** One extension whose CVEs are filed against its source repository. */
interface KnownCase {
  readonly slug: string
  readonly extId: string
  /** a version whose tag commit is affected */
  readonly affected: string
  /** a CVE provably affecting `affected` (via the repo identity) */
  readonly affectedCve: string
  /** a CVE reachable only through a historical tag commit */
  readonly pastCve: string
  /** a version whose tag commit is clean */
  readonly clean: string
}

const cases: readonly KnownCase[] = [
  {
    slug: 'shd101wyy/vscode-markdown-preview-enhanced',
    extId: 'shd101wyy.markdown-preview-enhanced',
    affected: '0.8.18',
    affectedCve: 'CVE-2026-11422', // 0.8.x code injection, filed against the repo
    pastCve: 'CVE-2022-45026', // single-commit GIT range: only a historical tag reaches it
    clean: '0.8.40',
  },
]

const live = process.env.OSV_LIVE === '1'
const userAgent = 'safe-extension-updater-live-test'

for (const known of cases) {
  test(`live: ${known.extId} known CVEs via the repo identity`, { skip: !live }, async () => {
    const { status, tags } = await fetchRepoTags(known.slug, userAgent)
    assert.equal(status, undefined)
    assert.ok(tags.size > 80)
    const affected = tagShas(tags, known.affected)
    assert.ok(affected !== undefined)
    const clean = tagShas(tags, known.clean) ?? []

    // 1. The Marketplace identity alone finds nothing here: these CVEs are
    //    GIT-range records, reachable only through the commit identity.
    const [pkg] = await fetchOsvActiveEntries('VSCode', [{ name: known.extId, version: known.affected }], userAgent)
    assert.equal(pkg, undefined)

    // 2. The affected version's tag commit carries its CVEs ("Must update").
    const installedFindings = await fetchOsvActive(
      [known.extId],
      new Map([[known.extId, known.affected]]),
      userAgent,
      new Map([[known.extId, affected]]),
    )
    const ids = installedFindings.get(known.extId) ?? []
    assert.ok(ids.includes(known.affectedCve), `expected ${known.affectedCve} in [${ids.join(', ')}]`)
    assert.ok(ids.length >= 5)

    // 3. The union over every tag commit surfaces past CVEs that no version
    //    query can reach (this also exercises chunking: > 100 commits).
    const history = [...new Set(tags.values())]
    const union = await fetchOsvActive(
      [known.extId],
      new Map([[known.extId, known.affected]]),
      userAgent,
      new Map([[known.extId, history]]),
    )
    const unionIds = union.get(known.extId) ?? []
    assert.ok(unionIds.includes(known.pastCve), `expected ${known.pastCve} in [${unionIds.join(', ')}]`)

    // 4. Report: the clean candidate is not blocked and past findings count.
    const report = await fetchOsvReport(
      [known.extId],
      new Map([[known.extId, known.clean]]),
      userAgent,
      new Map([[known.extId, history]]),
      new Map([[known.extId, clean]]),
    )
    assert.equal(report.active.get(known.extId), undefined)
    assert.ok((report.pastCount.get(known.extId) ?? 0) >= 2)
  })
}
