/**
 * Security intel for pending updates: dual-identity OSV findings (Marketplace
 * id + repo git tag commits), repository warnings and Marketplace-removed
 * extensions. Pure orchestration over the gallery clients, no vscode
 * dependency, every lookup fail-open (see test/security.test.ts).
 */
import type { InstalledExtension } from './core/release.js'
import { collectDependencyVersions, type PinnedDependency } from './gallery/deps.js'
import { fetchOsvActive, fetchOsvActiveEntries, fetchOsvReport } from './gallery/osv.js'
import { fetchRemovedPackages, type RemovedEntry } from './gallery/removed.js'
import { fetchRepoTags, type RepoStatus, type RepoTags, repoReference, tagShas } from './gallery/repo.js'
import type { PendingUpdate } from './gallery/types.js'

export interface RemovedRow {
  readonly id: string
  readonly displayName: string
  readonly version: string
  readonly entry: RemovedEntry
}

export interface SecurityIntel {
  /** pending updates enriched with malicious/pastVulns/installedVulns/depVulns */
  readonly updates: readonly PendingUpdate[]
  readonly removed: readonly RemovedRow[]
  readonly repoWarnings: ReadonlyMap<string, RepoStatus>
}

export async function collectSecurityIntel(
  updates: readonly PendingUpdate[],
  installed: readonly (InstalledExtension & { readonly extensionPath: string })[],
  userAgent: string,
): Promise<SecurityIntel> {
  const repoBy = new Map(installed.map((ext) => [ext.id, repoReference(ext.repository)]))
  // Dual identity per pending update: Marketplace id AND git tags of the
  // source repository (OSV registers many advisories by commit range only).
  // Both are queried in parallel with the same weight; a repo whose tags
  // cannot be read (private, renamed, offline) only drops that identity.
  const tagsBy = new Map<string, RepoTags>()
  await Promise.all(
    updates.map(async (update) => {
      const ref = repoBy.get(update.id)
      if (ref?.kind !== 'github') return
      try {
        tagsBy.set(update.id, await fetchRepoTags(ref.slug, userAgent))
      } catch (error) {
        console.warn(`extension-updater: git tags for ${ref.slug} failed`, error)
        tagsBy.set(update.id, { status: undefined, tags: new Map() })
      }
    }),
  )

  // OSV checks, fail-open: a lookup error must not hide updates.
  // - available version → malware/past findings
  // - installed version → active vulns the update fixes ("Must update")
  const ids = updates.map((update) => update.id)
  const historyCommits = new Map<string, readonly string[]>()
  const candidateCommits = new Map<string, readonly string[]>()
  const installedCommits = new Map<string, readonly string[]>()
  const repoWarnings = new Map<string, RepoStatus>()
  for (const update of updates) {
    const ref = repoBy.get(update.id)
    const repoTags = ref?.kind === 'github' ? tagsBy.get(update.id) : undefined
    if (ref?.kind === 'github' && repoTags) {
      if (repoTags.status) repoWarnings.set(update.id, repoTags.status)
      historyCommits.set(update.id, [...new Set(repoTags.tags.values())])
      const candidate = tagShas(repoTags.tags, update.availableVersion)
      if (candidate) candidateCommits.set(update.id, candidate)
      const installedSha = tagShas(repoTags.tags, update.installedVersion)
      if (installedSha) installedCommits.set(update.id, installedSha)
    } else {
      repoWarnings.set(update.id, 'missing')
    }
  }

  const [report, installedVulns, removedList] = await Promise.all([
    fetchOsvReport(
      ids,
      new Map(updates.map((update) => [update.id, update.availableVersion])),
      userAgent,
      historyCommits,
      candidateCommits,
    ).catch(() => ({ active: new Map(), pastCount: new Map() })),
    fetchOsvActive(
      ids,
      new Map(updates.map((update) => [update.id, update.installedVersion])),
      userAgent,
      installedCommits,
    ).catch(() => new Map()),
    // Microsoft's removed-extensions list, fail-open as well.
    fetchRemovedPackages(userAgent).catch(() => new Map<string, RemovedEntry>()),
  ])

  const removed: RemovedRow[] = []
  for (const ext of installed) {
    const entry = removedList.get(ext.id)
    if (entry) removed.push({ id: ext.id, displayName: ext.displayName, version: ext.version, entry })
  }
  // Bundled npm dependencies of the listed updates, checked against OSV
  // (ecosystem npm). Only deps with an exact bundled version are queried;
  // everything here is fail-open.
  const depsByExt = new Map<string, Map<string, PinnedDependency>>()
  await Promise.all(
    updates.map(async (update) => {
      const path = installed.find((ext) => ext.id === update.id)?.extensionPath
      if (!path) return
      try {
        depsByExt.set(update.id, await collectDependencyVersions(path))
      } catch {
        // no readable package.json: nothing to check
      }
    }),
  )

  const depQueries = new Map<string, { name: string; version: string }>() // name@version
  for (const deps of depsByExt.values()) {
    for (const dep of deps.values()) depQueries.set(`${dep.name}@${dep.version}`, dep)
  }

  const depFindings = await fetchOsvActiveEntries('npm', [...depQueries.values()], userAgent).catch(
    () => [] as (readonly string[] | undefined)[],
  )

  const activeDeps = new Map([...depQueries.keys()].map((key, index) => [key, depFindings[index] ?? []]))

  return {
    updates: updates.map((update) => ({
      ...update,
      malicious: report.active.get(update.id),
      pastVulns: report.pastCount.get(update.id),
      installedVulns: installedVulns.get(update.id),
      depVulns: [...(depsByExt.get(update.id) ?? new Map<string, PinnedDependency>()).values()]
        .map((dep) => ({ ...dep, ids: activeDeps.get(`${dep.name}@${dep.version}`) ?? [] }))
        .filter((dep) => dep.ids.length > 0),
    })),
    removed,
    repoWarnings,
  }
}
