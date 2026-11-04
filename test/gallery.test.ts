import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildRequestBody } from '../src/gallery/marketplace.js'
import { openVsxUrl } from '../src/gallery/openvsx.js'
import { prefersOpenVsx, resolveGallery } from '../src/gallery/select.js'
import { parseMarketplaceResponse, parseOpenVsxExtension } from '../src/gallery/validate.js'

const here = dirname(fileURLToPath(import.meta.url))
const marketplaceRaw: unknown = JSON.parse(readFileSync(join(here, 'fixtures/marketplace-python.json'), 'utf8'))
const openvsxRaw: unknown = JSON.parse(readFileSync(join(here, 'fixtures/openvsx-prettier.json'), 'utf8'))

test('parseMarketplaceResponse narrows the real trimmed response', () => {
  const extensions = parseMarketplaceResponse(marketplaceRaw)
  assert.deepEqual(extensions.map((extension) => extension.id).sort(), ['esbenp.prettier-vscode', 'ms-python.python'])
  const python = extensions.find((extension) => extension.id === 'ms-python.python')
  assert.equal(python?.versions.length, 11)
  assert.equal(python?.versions[0]?.prerelease, true)
  assert.equal(python?.versions[0]?.engine, '^1.95.0')
  const prettier = extensions.find((extension) => extension.id === 'esbenp.prettier-vscode')
  assert.equal(prettier?.displayName, 'Prettier - Code formatter')
  assert.equal(prettier?.versions[0]?.prerelease, false)
})

test('parseMarketplaceResponse skips malformed entries without throwing', () => {
  assert.deepEqual(parseMarketplaceResponse(null), [])
  assert.deepEqual(parseMarketplaceResponse('nope'), [])
  assert.deepEqual(parseMarketplaceResponse({}), [])
  assert.deepEqual(parseMarketplaceResponse({ results: 'x' }), [])
  assert.deepEqual(parseMarketplaceResponse({ results: [null, {}, { extensions: [null, 1, 'x', {}] }] }), [])
  assert.deepEqual(
    parseMarketplaceResponse({
      results: [{ extensions: [{ publisher: { publisherName: 'a' }, extensionName: 'b' }] }],
    }).length,
    1, // extension without versions still parses (empty version list)
  )
  assert.deepEqual(
    parseMarketplaceResponse({
      results: [
        {
          extensions: [
            {
              publisher: { publisherName: 'a' },
              extensionName: 'b',
              versions: [{ version: '1.0.0' }], // missing lastUpdated → skipped
            },
          ],
        },
      ],
    })[0]?.versions.length,
    0,
  )
})

test('parseOpenVsxExtension narrows the real trimmed payload', () => {
  const extension = parseOpenVsxExtension(openvsxRaw)
  assert.equal(extension?.id, 'esbenp.prettier-vscode')
  assert.equal(extension?.versions[0]?.version, '12.4.0')
  assert.equal(extension?.versions[0]?.engine, '^1.101.0')
  assert.equal(extension?.versions[0]?.lastUpdated, '2026-03-16T19:14:43.319347Z')
  assert.equal(extension?.versions[0]?.prerelease, false)
})

test('parseOpenVsxExtension flags preview and preRelease payloads', () => {
  assert.equal(parseOpenVsxExtension({ ...openvsxRaw, preview: true })?.versions[0]?.prerelease, true)
  assert.equal(parseOpenVsxExtension({ ...openvsxRaw, preRelease: true })?.versions[0]?.prerelease, true)
})

test('parseOpenVsxExtension rejects malformed payloads', () => {
  assert.equal(parseOpenVsxExtension(null), undefined)
  assert.equal(parseOpenVsxExtension({}), undefined)
  assert.equal(parseOpenVsxExtension({ namespace: 'a', name: 'b' }), undefined)
  assert.equal(parseOpenVsxExtension({ namespace: 'a', name: 'b', version: 5 }), undefined)
})

test('buildRequestBody batches ids as filterType 7 criteria', () => {
  const body = buildRequestBody(['a.b', 'c.d', 'e.f'])
  const filter = (body.filters as { criteria: { filterType: number; value: string }[] }[])[0]
  assert.equal(filter.criteria.length, 3)
  assert.equal(filter.criteria[0]?.filterType, 7)
  assert.equal(filter.criteria[2]?.value, 'e.f')
  assert.equal(body.flags, 946)
})

test('openVsxUrl builds the per-extension endpoint and rejects malformed ids', () => {
  assert.equal(openVsxUrl('esbenp.prettier-vscode'), 'https://open-vsx.org/api/esbenp/prettier-vscode')
  assert.equal(openVsxUrl('nodot'), '')
})

test('prefersOpenVsx matches forks by appName', () => {
  assert.equal(prefersOpenVsx('auto', 'Visual Studio Code'), false)
  assert.equal(prefersOpenVsx('auto', 'VSCodium'), true)
  assert.equal(prefersOpenVsx('auto', 'Cursor'), true)
  assert.equal(prefersOpenVsx('auto', 'Windsurf'), true)
  assert.equal(prefersOpenVsx('marketplace', 'VSCodium'), false)
  assert.equal(prefersOpenVsx('openvsx', 'Visual Studio Code'), true)
  // resolveGallery wires the same decision
  assert.ok(resolveGallery('openvsx', 'Visual Studio Code', 'ua').query instanceof Function)
})
