/**
 * Source-repository check. The manifest `repository` field (string or
 * { type, url }) tells where the code lives; a missing repository, or a
 * GitHub one that 404s (private, deleted or renamed — indistinguishable
 * without a token), gets a yellow warning line.
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

/**
 * Check one repository reference. Only GitHub is probed
 * (api.github.com/repos/{slug}: 404 = private or gone). Network errors and
 * non-GitHub repositories are fail-open: no warning.
 */
export async function fetchRepoStatus(ref: RepoRef, userAgent: string): Promise<RepoStatus> {
  if (ref.kind === 'none') return 'missing'
  if (ref.kind !== 'github') return undefined
  try {
    const response = await fetch(`https://api.github.com/repos/${ref.slug}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 404) return 'private'
    return undefined
  } catch {
    return undefined
  }
}
