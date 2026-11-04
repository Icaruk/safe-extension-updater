/**
 * OSV.dev lookup for editor extensions. Verified live 2026-11-04:
 * - ecosystem `VSCode` holds OpenSSF Malicious-Packages `MAL-*` entries; a
 *   plain `VSCode` query also returns open-vsx-qualified ones.
 * - MAL entries pin exact `versions` lists, so querying WITH the candidate
 *   version yields only entries affecting it (active); querying without a
 *   version yields every entry ever filed (all). past = all − active.
 * - Marketplace-only incidents (e.g. the Cursor `anthropic.claude-code`
 *   2.1.313 backdoor) are NOT covered by OSV.
 */

import { asString, isRecord } from '../core/narrow.js'
import { fetchJson } from './http.js'

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch'
const TIMEOUT_MS = 10_000

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

/** active ⊆ all per id: past = filed entries minus entries affecting the version. */
export function buildOsvReport(
  ids: readonly string[],
  all: (readonly string[] | undefined)[],
  active: (readonly string[] | undefined)[],
): OsvReport {
  const activeMap = new Map<string, readonly string[]>()
  const pastCount = new Map<string, number>()
  ids.forEach((id, index) => {
    const every = all[index] ?? []
    const now = new Set(active[index] ?? [])
    if (now.size > 0) activeMap.set(id, [...now])
    const past = every.filter((osvId) => !now.has(osvId)).length
    if (past > 0) pastCount.set(id, past)
  })
  return { active: activeMap, pastCount }
}

async function queryBatch(queries: unknown, userAgent: string): Promise<(readonly string[] | undefined)[]> {
  const body = await fetchJson(
    OSV_BATCH_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': userAgent },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
    'OSV query failed',
  )
  return parseOsvBatch(body)
}

/** Two batch calls (all entries + version-filtered); missing ids stay out. */
export async function fetchOsvReport(
  ids: readonly string[],
  versions: ReadonlyMap<string, string>,
  userAgent: string,
): Promise<OsvReport> {
  if (ids.length === 0) return { active: new Map(), pastCount: new Map() }
  const pkg = (id: string) => ({ package: { name: id, ecosystem: 'VSCode' } })
  const [all, active] = await Promise.all([
    queryBatch(ids.map(pkg), userAgent),
    queryBatch(
      ids.map((id) => ({ ...pkg(id), version: versions.get(id) })),
      userAgent,
    ),
  ])
  return buildOsvReport(ids, all, active)
}

/** Active entries for one version map (e.g. INSTALLED versions): these say "must update". */
export async function fetchOsvActive(
  ids: readonly string[],
  versions: ReadonlyMap<string, string>,
  userAgent: string,
): Promise<ReadonlyMap<string, readonly string[]>> {
  if (ids.length === 0) return new Map()
  const active = await queryBatch(
    ids.map((id) => ({ package: { name: id, ecosystem: 'VSCode' }, version: versions.get(id) })),
    userAgent,
  )
  return buildOsvReport(ids, active, active).active
}
