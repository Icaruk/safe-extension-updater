import assert from 'node:assert/strict'
import { test } from 'node:test'
import { repoReference } from '../src/gallery/repo.js'

test('missing repository', () => {
  assert.deepEqual(repoReference(undefined), { kind: 'none' })
  assert.deepEqual(repoReference({ type: 'git' }), { kind: 'none' })
})

test('github urls extract owner/repo', () => {
  assert.deepEqual(repoReference('https://github.com/anthropics/claude-code'), {
    kind: 'github',
    slug: 'anthropics/claude-code',
  })
  assert.deepEqual(repoReference('git+https://github.com/owner/repo.git'), { kind: 'github', slug: 'owner/repo' })
  assert.deepEqual(repoReference({ type: 'git', url: 'https://github.com/owner/repo/' }), {
    kind: 'github',
    slug: 'owner/repo',
  })
})

test('npm shorthand counts as github', () => {
  assert.deepEqual(repoReference('owner/repo'), { kind: 'github', slug: 'owner/repo' })
})

test('other hosts and junk are other/none', () => {
  assert.deepEqual(repoReference('https://gitlab.com/owner/repo'), { kind: 'other' })
  assert.deepEqual(repoReference('not a repo'), { kind: 'other' }) // unrecognized strings: no warning either
  assert.deepEqual(repoReference('a/b/c'), { kind: 'other' })
})
