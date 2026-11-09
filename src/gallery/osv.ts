/**
 * OSV.dev lookup for editor extensions. Verified live 2026-11-04/11-09:
 * - ecosystem `VSCode` holds OpenSSF Malicious-Packages `MAL-*` entries; a
 *   plain `VSCode` query also returns open-vsx-qualified ones.
 * - MAL entries pin exact `versions` lists, so querying WITH the candidate
 *   version yields only entries affecting it (active); querying without a
 *   version yields every entry ever filed (all). past = all − active.
 * - advisories filed against the source repository are GIT-range records
 *   with no package field: they only match `{"commit": "<sha>"}` queries
 *   (ecosystem "GitHub" does not exist in OSV). Every extension is queried
 *   under both identities, Marketplace id and repo tag commits, and the
 *   findings are merged and deduplicated by OSV id.
 * - Marketplace-only incidents (e.g. the Cursor `anthropic.claude-code`
 *   2.1.313 backdoor) are NOT covered by OSV.
 */

import { asString, isRecord } from '../core/narrow.js'
import { fetchJson } from './http.js'

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch'
const TIMEOUT_MS = 10_000
const BATCH_SIZE = 100

/** Ecosystems we query: `VSCode` for the extension itself, `npm` for bundled dependencies. */
export type OsvEcosystem = 'VSCode' | 'npm'

export interface OsvReport {
  /** entries affecting the candidate version, per extension id */
  readonly active: ReadonlyMap<string, readonly string[]>
  /** filed entries that do NOT affect the candidate version */
  readonly pastCount: ReadonlyMap<string, number>
}

/** Per-query OSV ids; undefined when that query returned nothing. */
export function parseOsvBatch(payload: unknown): (readonly string[] | undefined)[] {
  if (typeof payload !== 'object' || payload === null) return []
  const results = (payload as Record<string, unknown>)['results']
  if (!Array.isArray(results)) return []
  return results.map((entry) => {
    if (!isRecord(entry)) return undefined
    const vulns = entry['vulns']
    if (!Array.isArray(vulns)) return undefined
    const ids = vulns
      .map((vuln) => (isRecord(vuln) ? asString(vuln['id']) : undefined))
      .filter((id): id is string => id !== undefined)
    return ids.length > 0 ? ids : undefined
  })
}

/**
 * Union of finding lists per extension id, deduplicated by OSV id. This
 * is how the two identities merge: slots with undefined (a failed or
 * empty identity) contribute nothing, and ids found by both appear once.
 */
export function foldFindings(
  pairs: readonly { readonly extId: string; readonly ids: readonly string[] | undefined }[],
): ReadonlyMap<string, readonly string[]> {
  const folded = new Map<string, readonly string[]>()
  for (const { extId, ids } of pairs) {
    const union = new Set(folded.get(extId))
    for (const id of ids ?? []) union.add(id)
    if (union.size > 0) folded.set(extId, [...union])
  }
  return folded
}

/** Split a batch into POSTable chunks; OSV caps querybatch at 100 entries. */
export function chunk<T>(items: readonly T[], size = BATCH_SIZE): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

async function queryBatch(queries: readonly unknown[], userAgent: string): Promise<(readonly string[] | undefined)[]> {
  const batches = await Promise.all(
    chunk(queries).map((part) =>
      fetchJson(
        OSV_BATCH_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': userAgent },
          body: JSON.stringify({ queries: part }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
        'OSV query failed',
      ),
    ),
  )
  return batches.flatMap(parseOsvBatch)
}

/** One batch slot: which extension a query belongs to, whatever identity it targets. */
type Slot = { readonly extId: string; readonly query: unknown }

/** Commit-identity slots: one `{"commit": sha}` query per repo tag sha. */
function commitSlots(ids: readonly string[], commits: ReadonlyMap<string, readonly string[]>): Slot[] {
  return ids.flatMap((id) => (commits.get(id) ?? []).map((sha) => ({ extId: id, query: { commit: sha } as const })))
}

/** Pair batch slots with their query results, keeping the extension each belongs to. */
function zip(slots: readonly Slot[], results: (readonly string[] | undefined)[]) {
  return slots.map((slot, index) => ({ extId: slot.extId, ids: results[index] }))
}

/**
 * Active OSV entries for explicit name+version pairs; result array is
 * parallel to the entries, undefined = no finding.
 */
export async function fetchOsvActiveEntries(
  ecosystem: OsvEcosystem,
  entries: readonly { readonly name: string; readonly version: string | undefined }[],
  userAgent: string,
): Promise<(readonly string[] | undefined)[]> {
  if (entries.length === 0) return []
  return queryBatch(
    entries.map((entry) => ({ package: { name: entry.name, ecosystem }, version: entry.version })),
    userAgent,
  )
}

/**
 * Two batch calls (all entries + version-filtered), each including the
 * repo-identity commit slots, then folded per extension. past = union of
 * everything ever filed − union affecting the candidate.
 */
export async function fetchOsvReport(
  ids: readonly string[],
  versions: ReadonlyMap<string, string>,
  userAgent: string,
  historyCommits: ReadonlyMap<string, readonly string[]> = new Map(),
  candidateCommits: ReadonlyMap<string, readonly string[]> = new Map(),
): Promise<OsvReport> {
  if (ids.length === 0) return { active: new Map(), pastCount: new Map() }
  const pkgAll: Slot[] = ids.map((id) => ({ extId: id, query: { package: { name: id, ecosystem: 'VSCode' } } }))
  const history = commitSlots(ids, historyCommits)
  const candidate = commitSlots(ids, candidateCommits)
  const pkgActive: Slot[] = ids.map((id) => ({
    extId: id,
    query: { package: { name: id, ecosystem: 'VSCode' }, version: versions.get(id) },
  }))
  const [all, active] = await Promise.all([
    queryBatch(
      [...pkgAll, ...history].map((slot) => slot.query),
      userAgent,
    ),
    queryBatch(
      [...pkgActive, ...candidate].map((slot) => slot.query),
      userAgent,
    ),
  ])
  const activeMap = foldFindings(zip([...pkgActive, ...candidate], active))
  const everyMap = foldFindings(zip([...pkgAll, ...history], all))
  const pastCount = new Map<string, number>()
  for (const [id, every] of everyMap) {
    const now = new Set(activeMap.get(id) ?? [])
    const past = every.filter((osvId) => !now.has(osvId)).length
    if (past > 0) pastCount.set(id, past)
  }
  return { active: activeMap, pastCount }
}

/**
 * Active entries for one version map (e.g. INSTALLED versions), including
 * the repo-identity commit slots: these say "must update".
 */
export async function fetchOsvActive(
  ids: readonly string[],
  versions: ReadonlyMap<string, string>,
  userAgent: string,
  installedCommits: ReadonlyMap<string, readonly string[]> = new Map(),
): Promise<ReadonlyMap<string, readonly string[]>> {
  const pkg: Slot[] = ids.map((id) => ({
    extId: id,
    query: { package: { name: id, ecosystem: 'VSCode' }, version: versions.get(id) },
  }))
  const commits = commitSlots(ids, installedCommits)
  if (pkg.length === 0 && commits.length === 0) return new Map()
  const results = await queryBatch(
    [...pkg, ...commits].map((slot) => slot.query),
    userAgent,
  )
  return foldFindings(zip([...pkg, ...commits], results))
}
