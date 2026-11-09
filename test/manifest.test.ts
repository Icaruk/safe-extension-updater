import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterRegistered, manifestToInstalled } from '../src/core/manifest.js'

test('manifestToInstalled narrows a valid manifest, lowercasing the id', () => {
  assert.deepEqual(
    manifestToInstalled(
      { publisher: 'Anthropic', name: 'claude-code', version: '2.1.3', displayName: 'Claude' },
      false,
    ),
    {
      id: 'anthropic.claude-code',
      displayName: 'Claude',
      version: '2.1.3',
      prerelease: false,
      manifestPreRelease: undefined,
      repository: undefined,
    },
  )
})

test('displayName falls back to the name; preRelease flag passes through', () => {
  const entry = manifestToInstalled({ publisher: 'a', name: 'b', version: '1.0.0', preRelease: true }, false)
  assert.equal(entry?.displayName, 'b')
  assert.equal(entry?.manifestPreRelease, true)
})

test('manifestToInstalled rejects garbage, missing fields and builtins', () => {
  assert.equal(manifestToInstalled(undefined, false), undefined)
  assert.equal(manifestToInstalled('nope', false), undefined)
  assert.equal(manifestToInstalled({ publisher: 'a' }, false), undefined)
  assert.equal(manifestToInstalled({ publisher: 'a', name: 'b' }, false), undefined)
  assert.equal(manifestToInstalled({ publisher: 'a', name: 'b', version: '' }, false), undefined)
  assert.equal(manifestToInstalled({ publisher: 'a', name: 'b', version: '1', isBuiltin: true }, false), undefined)
  assert.equal(manifestToInstalled({ publisher: 'a', name: 'b', version: '1' }, true), undefined)
})

test('filterRegistered keeps only local folders registered in extensions.json', () => {
  const entries = [
    { id: 'a', extensionPath: '/home/u/.vscode/extensions/pub.a-2.0.0' },
    { id: 'a', extensionPath: '/home/u/.vscode/extensions/pub.a-1.0.0' },
    { id: 'r', extensionPath: '/home/u/.vscode-server/extensions/pub.r-1.0.0' },
  ]
  const filtered = filterRegistered(entries, '/home/u/.vscode/extensions', new Set(['pub.a-2.0.0']))
  assert.deepEqual(filtered, [entries[0], entries[2]])
})

test('filterRegistered accepts a trailing separator on the local directory', () => {
  const entries = [{ id: 'a', extensionPath: '/home/u/.vscode/extensions/pub.a-2.0.0' }]
  assert.deepEqual(filterRegistered(entries, '/home/u/.vscode/extensions/', new Set(['pub.a-2.0.0'])), entries)
})
