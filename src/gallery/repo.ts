/**
 * Source-repository identity. The manifest `repository` field (string or
 * { type, url }) tells where the code lives; its git tags are read over
 * git-over-HTTP (same data as `git ls-remote --tags`, no GitHub API
 * quota). A missing repository, or a GitHub one that stops answering
 * (private, deleted or renamed: indistinguishable without a token), gets
 * a yellow warning line.
 */

import { asString, isRecord } from '../core/narrow.js'

export type RepoRef =
  | { readonly kind: 'none' }
  | { readonly kind: 'github'; readonly slug: string }
  | { readonly kind: 'other' }

/** Narrow the raw manifest `repository` field into a GitHub slug, other, or none. */
export function repoReference(raw: unknown): RepoRef {
  const url = typeof raw === 'string' ? raw : isRecord(raw) ? asString(raw['url']) : undefined
  if (!url) return { kind: 'none' }
  const github = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(url)
  if (github) return { kind: 'github', slug: `${github[1]}/${github[2]}` }
  // npm shorthand, e.g. "owner/repo"
  const shorthand = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(url)
  if (shorthand) return { kind: 'github', slug: `${shorthand[1]}/${shorthand[2]}` }
  return { kind: 'other' }
}

/** Warning status for a repository reference; undefined = no warning. */
export type RepoStatus = 'missing' | 'private' | undefined

/** Tags of a repository: tag name → commit sha (peeled shas win). */
export type RepoTags = {
  readonly status: RepoStatus
  readonly tags: ReadonlyMap<string, string>
}

/**
 * Parse a git-upload-pack info/refs payload into tag name → commit sha.
 * Pkt-line format: 4 hex chars of line length (itself included), `0000`
 * = flush. The first ref line may carry capabilities after a NUL. A
 * `refs/tags/<name>^{}` line peels an annotated tag: it holds the real
 * commit and overwrites the tag-object sha. Garbage yields an empty map.
 */
export function parseInfoRefs(payload: string): ReadonlyMap<string, string> {
  const tags = new Map<string, string>()
  for (let offset = 0; offset + 4 <= payload.length; ) {
    const header = payload.slice(offset, offset + 4)
    if (header === '0000') {
      offset += 4
      continue
    }
    const length = Number.parseInt(header, 16)
    if (!/^[0-9a-f]{4}$/.test(header) || length < 4 || offset + length > payload.length) break
    const line = payload.slice(offset + 4, offset + length)
    offset += length
    if (line.startsWith('#')) continue // "# service=git-upload-pack"
    const ref = (line.split('\0')[0] ?? '').trimEnd() // drop capabilities and newline
    const match = /^([0-9a-f]{40,64}) refs\/tags\/(.+?)(\^\{\})?$/.exec(ref)
    if (!match?.[1] || !match[2]) continue // HEAD, refs/heads/* and friends
    const sha = match[1]
    const name = match[2]
    if (match[3])
      tags.set(name, sha) // peeled: the real commit, wins
    else if (!tags.has(name)) tags.set(name, sha)
  }
  return tags
}

/**
 * Read a repository's tags from `github.com/{owner}/{repo}.git`. HTTP
 * non-200 means private, gone or renamed: report 'private'. Network and
 * timeout errors reject; callers warn and fail open.
 */
export async function fetchRepoTags(slug: string, userAgent: string): Promise<RepoTags> {
  const response = await fetch(`https://github.com/${slug}.git/info/refs?service=git-upload-pack`, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return { status: 'private', tags: new Map() }
  return { status: undefined, tags: parseInfoRefs(await response.text()) }
}

/**
 * Commit shas for one version's tags. Repositories keep separate `1.2.3`
 * and `v1.2.3` tags (often different commits): both are collected.
 * undefined when the version has no tag.
 */
export function tagShas(tags: ReadonlyMap<string, string>, version: string | undefined): readonly string[] | undefined {
  if (!version) return undefined
  const shas = [tags.get(version), tags.get(`v${version}`)].filter((sha): sha is string => sha !== undefined)
  return shas.length > 0 ? [...new Set(shas)] : undefined
}
