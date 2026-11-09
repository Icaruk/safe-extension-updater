import * as vscode from 'vscode'
import { AutoUpdateGuard } from './autoUpdate.js'
import type { RepoStatus } from './gallery/repo.js'
import { type GallerySetting, resolveGallery } from './gallery/select.js'
import type { PendingUpdate } from './gallery/types.js'
import { collectSecurityIntel, type RemovedRow } from './security.js'
import { strings } from './strings.js'
import { Updater } from './updater.js'
import { asPendingUpdate, type UpdatesModel, UpdatesWebviewProvider } from './webview.js'

function readConfig() {
  const configuration = vscode.workspace.getConfiguration('extensionUpdater')
  const threshold = numberSetting(configuration, 'earlyReleaseProtectionHours', 24)
  const interval = numberSetting(configuration, 'refreshIntervalHours', 2)
  const galleryValue = configuration.get<unknown>('gallery')
  const gallery: GallerySetting = galleryValue === 'marketplace' || galleryValue === 'openvsx' ? galleryValue : 'auto'
  return { thresholdHours: threshold, refreshIntervalHours: interval, gallery }
}

function numberSetting(configuration: vscode.WorkspaceConfiguration, key: string, fallback: number): number {
  const value = configuration.get<unknown>(key)
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/**
 * Development-only sample rows covering every UI case (F5 launch):
 * plain update, updated-this-session, downgrade, active malware finding,
 * recent + past vulns, installed-version vuln ("Must update"),
 * private repository warning, bundled-dependency finding.
 * Ids are fake on purpose: clicking Update on them fails harmlessly.
 */
function mockUpdates(): readonly PendingUpdate[] {
  const hoursAgo = (hours: number): string => new Date(Date.now() - hours * 3_600_000).toISOString()
  return [
    {
      id: 'sample.demo',
      displayName: 'React checker',
      installedVersion: '1.0.0',
      availableVersion: '1.2.0',
      releasedAt: hoursAgo(72),
    },
    {
      id: 'sample.updated',
      displayName: 'Svelte checker',
      installedVersion: '3.0.0',
      availableVersion: '3.1.0',
      releasedAt: hoursAgo(72),
    },
    {
      id: 'sample.demo',
      displayName: 'DB manager',
      installedVersion: '0.5.0',
      availableVersion: '0.6.0',
      releasedAt: hoursAgo(72),
      pastVulns: 1,
    },
    {
      id: 'sample.shrinker',
      displayName: 'CSS shrinker',
      installedVersion: '0.9.0',
      availableVersion: '1.0.0',
      releasedAt: hoursAgo(8),
      pastVulns: 0,
    },
    {
      id: 'sample.demo',
      displayName: 'Astro linter',
      installedVersion: '2.1.0',
      availableVersion: '2.2.0',
      releasedAt: hoursAgo(8),
      pastVulns: 3,
      depVulns: [
        { name: 'leftpad', version: '3.2.5', ids: ['MAL-DEMO-003'] },
        { name: 'is-odd', version: '1.4.0', ids: ['MAL-DEMO-004'] },
      ],
    },
    {
      id: 'sample.demo',
      displayName: 'Icon generator',
      installedVersion: '1.4.0',
      availableVersion: '1.5.0',
      releasedAt: hoursAgo(1),
      malicious: ['MAL-DEMO-0001'],
      pastVulns: 3,
    },
    {
      id: 'sample.demo',
      displayName: 'JSON tools',
      installedVersion: '0.8.0',
      availableVersion: '0.9.0',
      releasedAt: hoursAgo(30),
      installedVulns: ['MAL-DEMO-0002'],
    },
  ]
}

export function activate(context: vscode.ExtensionContext): void {
  const manifestVersion = (context.extension.packageJSON as Record<string, unknown>)['version']
  const userAgent = `extension-updater/${typeof manifestVersion === 'string' ? manifestVersion : '0.0.0'}`

  // In-memory cache: avoid re-querying the gallery on every view open.
  let cache: {
    fetchedAt: number
    updates: readonly PendingUpdate[]
    removed: readonly RemovedRow[]
    repoWarnings: ReadonlyMap<string, RepoStatus>
  } = { fetchedAt: 0, updates: [], removed: [], repoWarnings: new Map() }
  /** ids installed this session; the running version only changes after reload.
   * Persisted: updating this extension itself restarts the extension host,
   * which would wipe in-memory state (and the Updated tag with it). */
  let waitingReload: readonly string[] = context.globalState.get<string[]>('waitingReload') ?? []
  const setWaitingReload = (ids: readonly string[]): void => {
    waitingReload = ids
    void context.globalState.update('waitingReload', ids)
  }
  let refreshing: Promise<void> | undefined
  let queryError: string | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  /** id with an install in flight; shown as a grey "Updating…" tag */
  let updatingId: string | undefined

  const model: UpdatesModel = {
    get updates() {
      return cache.updates
    },
    get pendingReload() {
      return waitingReload
    },
    get thresholdHours() {
      return readConfig().thresholdHours
    },
    get updatingId() {
      return updatingId
    },
    get removed() {
      return cache.removed
    },
    get repoWarnings() {
      return cache.repoWarnings
    },
  }
  /** View message priority: query errors only; auto-update state has its own view section. */
  const resolveMessage = (): string | undefined => queryError || undefined

  const resolveAutoUpdate = (): { state: 'enabled' | 'partial' | 'disabled'; needsReload: boolean } => ({
    state: guard.state,
    needsReload: guard.needsReload,
  })
  const webview = new UpdatesWebviewProvider(context.extensionUri, model, resolveMessage, resolveAutoUpdate)
  const updater = new Updater(() => resolveGallery(readConfig().gallery, vscode.env.appName, userAgent), vscode.version)
  const guard = new AutoUpdateGuard(context)

  // The webview view resolves lazily (only after its first open), so its badge
  // cannot appear at startup. This hidden tree view exists from activation and
  // carries the pending-update count on the activity-bar icon instead.
  const badgeView = vscode.window.createTreeView('extensionUpdater.badge', {
    treeDataProvider: {
      getChildren: (): never[] => [],
      getTreeItem: (element: never): vscode.TreeItem => ({ label: String(element) }),
    },
  })
  const syncBadge = (): void => {
    const count = cache.updates.length
    badgeView.badge = count > 0 ? { value: count, tooltip: strings.badgeTooltip(count) } : undefined
  }

  const schedule = (): void => {
    if (timer) clearInterval(timer)
    const hours = readConfig().refreshIntervalHours
    if (hours > 0) timer = setInterval(() => void refresh(false), hours * 3_600_000)
  }

  async function refresh(force: boolean): Promise<void> {
    const ttlMs = readConfig().refreshIntervalHours * 3_600_000
    const fresh = Date.now() - cache.fetchedAt < ttlMs
    if (!force && fresh) {
      webview.invalidate()
      return
    }
    if (refreshing) return refreshing
    refreshing = (async () => {
      webview.setSearching(true)
      try {
        const updates = await updater.collectPending()
        // OSV findings, repo warnings and removed extensions, all fail-open.
        const intel = await collectSecurityIntel(updates, updater.installed(), userAgent)
        cache = {
          fetchedAt: Date.now(),
          updates: intel.updates,
          removed: intel.removed,
          repoWarnings: intel.repoWarnings,
        }
        // F5 launch only: append the sample rows so every UI case is visible.
        if (context.extensionMode === vscode.ExtensionMode.Development) {
          cache = {
            ...cache,
            updates: [...cache.updates, ...mockUpdates()],
            repoWarnings: new Map([...cache.repoWarnings, ['sample.shrinker', 'private']]),
          }
          setWaitingReload([...new Set([...waitingReload, 'sample.updated'])])
        }
        syncBadge()
        // Prune ids that no longer have a pending row: after a window reload
        // the updated extensions are current again and their rows are gone.
        setWaitingReload(waitingReload.filter((id) => cache.updates.some((entry) => entry.id === id)))
        queryError = undefined
      } catch (error) {
        queryError = strings.queryError(String(error)) // keep showing the previous cache
      } finally {
        refreshing = undefined
        webview.setSearching(false)
        webview.invalidate()
      }
    })()
    return refreshing
  }

  guard.init(() => {
    webview.invalidate()
  })

  context.subscriptions.push(
    badgeView,
    vscode.window.registerWebviewViewProvider('extensionUpdater.updates', webview, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('extensionUpdater')) return
      if (event.affectsConfiguration('extensionUpdater.refreshIntervalHours')) schedule()
      if (event.affectsConfiguration('extensionUpdater.gallery')) void refresh(true)
      webview.invalidate() // threshold changes only need a re-render
    }),
    vscode.commands.registerCommand('extensionUpdater.refresh', () => void refresh(true)),
    vscode.commands.registerCommand('extensionUpdater.update', async (value: unknown) => {
      const update = asPendingUpdate(value)
      if (!update) return
      try {
        updatingId = update.id
        webview.invalidate()
        const outcome = await updater.updateOne(update, readConfig().thresholdHours)
        if (outcome === 'updated') {
          // No forced refresh: until the window reloads, VS Code still reports
          // the OLD running version, so a re-query would re-detect this same
          // pending update. Mark the row Updated instead; it disappears on the
          // first refresh after reload.
          setWaitingReload([...new Set([...waitingReload, update.id])])
        }
      } catch (error) {
        void vscode.window.showErrorMessage(strings.updateFailed(update.id, String(error)))
      } finally {
        updatingId = undefined
        webview.invalidate()
      }
    }),
    vscode.commands.registerCommand('extensionUpdater.uninstall', async (id: unknown) => {
      if (typeof id !== 'string') return
      try {
        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', id)
      } catch (error) {
        void vscode.window.showErrorMessage(strings.uninstallFailed(id, String(error)))
      }
    }),
    vscode.commands.registerCommand('extensionUpdater.updateAll', async () => {
      const updates = cache.updates
      if (updates.length === 0) {
        void vscode.window.showInformationMessage(strings.upToDate)
        return
      }
      try {
        const skip = new Set(waitingReload)
        const result = await updater.updateAll(
          cache.updates.filter((entry) => !skip.has(entry.id)),
          readConfig().thresholdHours,
          (id) => {
            updatingId = id
            webview.invalidate()
          },
        )
        updatingId = undefined
        setWaitingReload([...new Set([...waitingReload, ...result.updatedIds])])
        if (result.failures.length > 0) {
          void vscode.window.showErrorMessage(strings.updateAllSummary(result.updatedIds.length, result.failures))
        }
      } catch (error) {
        void vscode.window.showErrorMessage(String(error))
      }
      webview.invalidate()
    }),
    {
      dispose: () => {
        if (timer) clearInterval(timer)
      },
    },
  )

  schedule()
  void refresh(false)
}
