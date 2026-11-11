/**
 * Security report for updates blocked by findings in the candidate version:
 * plain Markdown opened as an untitled VS Code tab. Pure and synchronous so
 * it can be tested without the vscode module.
 */
import type { PendingUpdate } from './gallery/types.js'
import { strings } from './strings.js'

/** ids formatted as Markdown links to their OSV entries, comma-separated. */
function osvLinks(ids: readonly string[]): string {
  return ids.map((id) => `[${id}](https://osv.dev/vulnerability/${id})`).join(', ')
}

/**
 * Sections: installed version findings, candidate version findings, the
 * fixed/still/new analysis (only when the installed version has findings)
 * and vulnerable bundled dependencies. Empty sections collapse away.
 */
export function buildReport(update: PendingUpdate, generatedAt: Date): string {
  const installed = update.installedVulns ?? []
  const candidate = update.malicious ?? []
  const parts: string[] = [
    strings.reportTitle(update.displayName),
    '',
    strings.reportMeta(update.id, generatedAt.toISOString()),
    '',
    strings.reportInstalled(update.installedVersion),
    installed.length > 0 ? strings.reportFindings : strings.reportNoFindings,
  ]
  if (installed.length > 0) parts.push(osvLinks(installed))

  parts.push('', strings.reportCandidate(update.availableVersion))
  if (candidate.length > 0) {
    parts.push(strings.reportFindings, osvLinks(candidate))
  } else {
    parts.push(strings.reportNoFindings)
  }

  const fixed = installed.filter((id) => !candidate.includes(id))
  const still = installed.filter((id) => candidate.includes(id))
  const fresh = candidate.filter((id) => !installed.includes(id))
  if (installed.length > 0) {
    parts.push('', strings.reportAnalysis)
    if (fixed.length > 0) parts.push(strings.reportFixed(osvLinks(fixed)))
    if (still.length > 0) parts.push(strings.reportStill(osvLinks(still)))
    if (fresh.length > 0) parts.push(strings.reportNew(osvLinks(fresh)))
  }

  if (update.depVulns?.length) {
    parts.push('', strings.reportDeps)
    for (const dep of update.depVulns) {
      parts.push(`- ${dep.name} ${dep.version}: ${osvLinks(dep.ids)}`)
    }
  }

  if (candidate.length > 0) parts.push('', `---`, '', strings.reportBlockedNote)
  return `${parts.join('\n')}\n`
}
