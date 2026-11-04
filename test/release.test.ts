import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isInstalledPreRelease, isRecentRelease, parseIsoDate, pickUpdate, relativeAge } from '../src/core/release.js'
import type { GalleryExtension } from '../src/gallery/types.js'
import { parseMarketplaceResponse } from '../src/gallery/validate.js'

const here = dirname(fileURLToPath(import.meta.url))
const marketplaceRaw: unknown = JSON.parse(readFileSync(join(here, 'fixtures/marketplace-python.json'), 'utf8'))
const extensions = parseMarketplaceResponse(marketplaceRaw)
const _python = extensions.find((extension) => extension.id === 'ms-python.python')
const _prettier = extensions.find((extension) => extension.id === 'esbenp.prettier-vscode')

function galleryOf(id: string): GalleryExtension {
  const gallery = extensions.find((extension) => extension.id === id)
  assert.ok(gallery, `fixture should contain ${id}`)
  return gallery
}

const HOST = '1.101.0'
const NOW = new Date('2026-11-03T12:00:00Z')

test('parseIsoDate accepts 3-digit fractions and Open VSX 6-digit fractions', () => {
  assert.equal(parseIsoDate('2026-10-29T14:13:58.763Z')?.toISOString(), '2026-10-29T14:13:58.763Z')
  assert.equal(parseIsoDate('2026-03-16T19:14:43.319347Z')?.toISOString(), '2026-03-16T19:14:43.319Z')
  assert.equal(parseIsoDate('not-a-date'), undefined)
})

test('pickUpdate finds the stable update for a stable install (prettier)', () => {
  const update = pickUpdate(
    { id: 'esbenp.prettier-vscode', displayName: 'Prettier', version: '11.2.2', prerelease: false },
    galleryOf('esbenp.prettier-vscode'),
    { hostVersion: HOST, now: NOW },
  )
  assert.equal(update?.availableVersion, '12.4.0')
  assert.equal(update?.releasedAt, '2026-03-16T19:18:07.213Z')
})

test('pickUpdate skips pre-release candidates for a stable install (python)', () => {
  const update = pickUpdate(
    { id: 'ms-python.python', displayName: 'Python', version: '2024.9.11721010', prerelease: false },
    galleryOf('ms-python.python'),
    { hostVersion: HOST, now: NOW },
  )
  assert.equal(update, undefined)
})

test('pickUpdate allows pre-release candidates for a pre-release install (python)', () => {
  const update = pickUpdate(
    {
      id: 'ms-python.python',
      displayName: 'Python',
      version: '2024.9.11721010',
      prerelease: true,
    },
    galleryOf('ms-python.python'),
    { hostVersion: HOST, now: NOW },
  )
  assert.equal(update?.availableVersion, '2026.11.2026102901')
  // duplicated version entries: the first (newest lastUpdated) wins
  assert.equal(update?.releasedAt, '2026-10-29T14:13:58.763Z')
})

test('pickUpdate falls back to an older engine-compatible version', () => {
  const update = pickUpdate(
    { id: 'a.b', displayName: 'B', version: '1.0.0', prerelease: false },
    {
      id: 'a.b',
      displayName: 'B',
      versions: [
        { version: '2.0.0', lastUpdated: '2026-10-01T00:00:00Z', prerelease: false, engine: '^1.101.0' },
        { version: '1.5.0', lastUpdated: '2026-09-01T00:00:00Z', prerelease: false, engine: '^1.95.0' },
      ],
    },
    { hostVersion: '1.100.0', now: NOW },
  )
  assert.equal(update?.availableVersion, '1.5.0')
})

test('pickUpdate returns nothing when installed equals the latest', () => {
  const update = pickUpdate(
    { id: 'esbenp.prettier-vscode', displayName: 'Prettier', version: '12.4.0', prerelease: false },
    galleryOf('esbenp.prettier-vscode'),
    { hostVersion: HOST, now: NOW },
  )
  assert.equal(update, undefined)
})

test('pickUpdate returns nothing when every candidate is engine-incompatible', () => {
  const update = pickUpdate(
    { id: 'esbenp.prettier-vscode', displayName: 'Prettier', version: '11.2.2', prerelease: false },
    galleryOf('esbenp.prettier-vscode'),
    { hostVersion: '1.95.0', now: NOW }, // prettier needs ^1.101.0
  )
  assert.equal(update, undefined)
})

test('isInstalledPreRelease: manifest flag, semver suffix, gallery flag, else false', () => {
  assert.equal(isInstalledPreRelease(true, '1.0.0', undefined), true)
  assert.equal(isInstalledPreRelease(false, '1.2.3-beta.1', undefined), true)
  assert.equal(isInstalledPreRelease(undefined, '2026.11.2026102901', galleryOf('ms-python.python')), true)
  assert.equal(isInstalledPreRelease(undefined, '12.4.0', galleryOf('esbenp.prettier-vscode')), false)
})

test('isRecentRelease boundary and invalid dates', () => {
  assert.equal(isRecentRelease('2026-11-03T11:00:00Z', NOW, 24), true) // 1 h
  assert.equal(isRecentRelease('2026-11-02T13:00:01Z', NOW, 24), true) // 23:59:59
  assert.equal(isRecentRelease('2026-11-02T12:00:00Z', NOW, 24), false) // exactly 24 h
  assert.equal(isRecentRelease('2026-11-01T12:00:00Z', NOW, 24), false) // 48 h
  assert.equal(isRecentRelease('2026-11-03T13:00:00Z', NOW, 24), false) // future
  assert.equal(isRecentRelease('garbage', NOW, 24), false)
})

test('relativeAge renders exact English strings', () => {
  assert.equal(relativeAge('2026-11-03T11:15:00Z', NOW), '45 min. ago')
  assert.equal(relativeAge('2026-11-03T09:00:00Z', NOW), '3 hours ago')
  assert.equal(relativeAge('2026-10-29T12:00:00Z', NOW), '5 days ago')
  assert.equal(relativeAge('2026-09-03T12:00:00Z', NOW), '2 months ago')
  assert.equal(relativeAge('2024-06-20T10:20:37.73Z', NOW).endsWith('ago'), true)
  assert.equal(relativeAge('2026-11-03T13:00:00Z', NOW), 'just now') // future
  assert.equal(relativeAge('garbage', NOW), 'unknown date')
})
