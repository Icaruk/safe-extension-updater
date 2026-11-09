import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseInfoRefs, repoReference, tagShas } from '../src/gallery/repo.js'

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

const infoRefs = readFileSync(new URL('./fixtures/git-info-refs.txt', import.meta.url), 'utf8')

test('parseInfoRefs maps tags from a live payload, peeled shas win', () => {
  const tags = parseInfoRefs(infoRefs)
  assert.ok(tags.size > 80)
  assert.equal(tags.get('0.8.18'), '31bc248f1cde8dada598b3cb345e68528c5446c9')
  // annotated tag v0.7.6: the peeled ^{} line holds the real commit
  assert.equal(tags.get('v0.7.6'), '233d7e11126f7c8427dc74bb78e578ba887a9e3e')
})

test('parseInfoRefs tolerates garbage without throwing', () => {
  assert.deepEqual(parseInfoRefs(''), new Map())
  assert.deepEqual(parseInfoRefs('not a pkt-line stream'), new Map())
  assert.deepEqual(parseInfoRefs('zzzz junk'), new Map())
  assert.deepEqual(parseInfoRefs('0014truncated'), new Map()) // length beyond payload
})

test('tagShas collects the version tag and its v-prefixed twin', () => {
  const tags = new Map([
    ['1.2.3', 'a'.repeat(40)],
    ['v1.2.3', 'b'.repeat(40)],
    ['v2.0.0', 'c'.repeat(40)],
  ])
  assert.deepEqual(tagShas(tags, '1.2.3'), ['a'.repeat(40), 'b'.repeat(40)])
  assert.deepEqual(tagShas(tags, '2.0.0'), ['c'.repeat(40)])
  assert.equal(tagShas(tags, '9.9.9'), undefined)
  assert.equal(tagShas(tags, undefined), undefined)
})
