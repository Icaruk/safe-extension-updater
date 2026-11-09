import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectSecurityIntel } from '../src/security.js'

/** One pkt-line: 4 hex length chars (self-included) + payload + newline. */
const pkt = (line: string): string => `${(line.length + 5).toString(16).padStart(4, '0')}${line}\n`

const shaInstalled = 'a'.repeat(40)
const shaCandidate = 'b'.repeat(40)
const refs = [
  pkt('# service=git-upload-pack'),
  '0000',
  pkt(`${shaInstalled} refs/tags/1.2.3`),
  pkt(`${shaCandidate} refs/tags/1.2.4`),
].join('')

test('collectSecurityIntel warns per repo state and folds commit findings in', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const href = String(input)
    if (href.includes('github.com')) {
      if (href.includes('owner/private-repo')) return { ok: false, status: 404 } as Response
      return { ok: true, text: async () => refs } as Response
    }
    if (href.includes('api.osv.dev')) {
      const queries = (JSON.parse(String(init?.body)) as { queries: readonly { commit?: string }[] }).queries
      const results = queries.map((query) => (query.commit === shaInstalled ? { vulns: [{ id: 'CVE-1' }] } : {}))
      return { ok: true, json: async () => ({ results }) } as Response
    }
    return { ok: false, status: 500 } as Response // removed list: fails open
  }) as typeof fetch
  try {
    const intel = await collectSecurityIntel(
      [
        {
          id: 'pub.a',
          displayName: 'A',
          installedVersion: '1.2.3',
          availableVersion: '1.2.4',
          releasedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'pub.b',
          displayName: 'B',
          installedVersion: '0.1.0',
          availableVersion: '0.2.0',
          releasedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'pub.c',
          displayName: 'C',
          installedVersion: '2.0.0',
          availableVersion: '2.1.0',
          releasedAt: '2026-01-01T00:00:00Z',
        },
      ],
      [
        {
          id: 'pub.a',
          displayName: 'A',
          version: '1.2.3',
          prerelease: false,
          repository: 'https://github.com/owner/repo-a',
          extensionPath: '/nonexistent',
        },
        { id: 'pub.b', displayName: 'B', version: '0.1.0', prerelease: false, extensionPath: '/nonexistent' },
        {
          id: 'pub.c',
          displayName: 'C',
          version: '2.0.0',
          prerelease: false,
          repository: 'https://github.com/owner/private-repo',
          extensionPath: '/nonexistent',
        },
      ],
      'test-agent',
    )
    assert.deepEqual(intel.updates.find((update) => update.id === 'pub.a')?.installedVulns, ['CVE-1'])
    assert.equal(intel.updates.find((update) => update.id === 'pub.a')?.malicious, undefined)
    assert.equal(intel.updates.find((update) => update.id === 'pub.b')?.installedVulns, undefined)
    assert.equal(intel.repoWarnings.get('pub.b'), 'missing')
    assert.equal(intel.repoWarnings.get('pub.c'), 'private')
    assert.equal(intel.repoWarnings.has('pub.a'), false)
    assert.deepEqual(intel.removed, [])
  } finally {
    globalThis.fetch = original
  }
})
