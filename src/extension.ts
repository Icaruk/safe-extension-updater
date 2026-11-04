import * as vscode from 'vscode'
import { AutoUpdateGuard } from './autoUpdate.js'
import { fetchOsvActive, fetchOsvReport } from './gallery/osv.js'
import { type GallerySetting, resolveGallery } from './gallery/select.js'
import type { PendingUpdate } from './gallery/types.js'
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
 * recent + past vulns, installed-version vuln ("Must update").
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
      id: 'sample.demo',
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
  let cache: { fetchedAt: number; updates: readonly PendingUpdate[] } = { fetchedAt: 0, updates: [] }
  /** ids installed this session; the running version only changes after reload */
  let waitingReload: readonly string[] = []
  let refreshing: Promise<void> | undefined
  let queryError: string | undefined
  let timer: ReturnType<typeof setInterval> | undefined

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
        // OSV checks, fail-open: a lookup error must not hide updates.
        // - available version → malware/past findings
        // - installed version → active vulns the update fixes ("Must update")
        const ids = updates.map((update) => update.id)
        const [report, installedVulns] = await Promise.all([
          fetchOsvReport(ids, new Map(updates.map((update) => [update.id, update.availableVersion])), userAgent).catch(
            () => ({ active: new Map(), pastCount: new Map() }),
          ),
          fetchOsvActive(ids, new Map(updates.map((update) => [update.id, update.installedVersion])), userAgent).catch(
            () => new Map(),
          ),
        ])
        cache = {
          fetchedAt: Date.now(),
          updates: updates.map((update) => ({
            ...update,
            malicious: report.active.get(update.id),
            pastVulns: report.pastCount.get(update.id),
            installedVulns: installedVulns.get(update.id),
          })),
        }
        // F5 launch only: append the sample rows so every UI case is visible.
        if (context.extensionMode === vscode.ExtensionMode.Development) {
          cache = { ...cache, updates: [...cache.updates, ...mockUpdates()] }
          waitingReload = [...new Set([...waitingReload, 'sample.updated'])]
        }
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
        const outcome = await updater.updateOne(update, readConfig().thresholdHours)
        if (outcome === 'updated') {
          // No forced refresh: until the window reloads, VS Code still reports
          // the OLD running version, so a re-query would re-detect this same
          // pending update. Mark the row Updated instead; it disappears on the
          // first refresh after reload.
          waitingReload = [...new Set([...waitingReload, update.id])]
        }
      } catch (error) {
        void vscode.window.showErrorMessage(strings.updateFailed(update.id, String(error)))
      }
      webview.invalidate()
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
        )
        waitingReload = [...new Set([...waitingReload, ...result.updatedIds])]
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
