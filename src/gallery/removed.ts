/**
 * Microsoft's public list of extensions removed from the Marketplace
 * (github.com/microsoft/vsmarketplace/blob/main/RemovedPackages.md).
 * Covers marketplace-only incidents OSV does not know about
 * (e.g. the anthropic.claude-code 2.1.313 backdoor).
 */

import { fetchText } from './http.js'

const REMOVED_URL = 'https://raw.githubusercontent.com/microsoft/vsmarketplace/main/RemovedPackages.md'
const TIMEOUT_MS = 10_000

export interface RemovedEntry {
  /** removal date as printed in the list, e.g. "11/03/2026" */
  readonly date: string
  /** removal reason, e.g. "Malware", "Impersonation" */
  readonly type: string
}

/** Parse the markdown table rows; ids are lowercased like every gallery id. */
export function parseRemovedPackages(markdown: string): Map<string, RemovedEntry> {
  const entries = new Map<string, RemovedEntry>()
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/.exec(line)
    if (!match) continue
    const [id, date, type] = match.slice(1) as [string, string, string]
    // Skip the header and separator rows of the markdown table.
    if (id === 'Extension Identifier' || id.startsWith('-')) continue
    entries.set(id.toLowerCase(), { date, type })
  }
  return entries
}

export async function fetchRemovedPackages(userAgent: string): Promise<Map<string, RemovedEntry>> {
  return parseRemovedPackages(
    await fetchText(
      REMOVED_URL,
      {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
      'Removed-packages fetch failed',
    ),
  )
}
