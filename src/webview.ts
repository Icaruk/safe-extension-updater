import * as vscode from 'vscode'
import { isRecord } from './core/narrow.js'
import { isRecentRelease, relativeAge } from './core/release.js'
import type { RepoStatus } from './gallery/repo.js'
import type { PendingUpdate } from './gallery/types.js'
import type { RemovedRow } from './security.js'
import { strings } from './strings.js'

export interface UpdatesModel {
  /** current pending updates (cache contents) */
  readonly updates: readonly PendingUpdate[]
  /** ids installed this session, waiting for a window reload to take effect */
  readonly pendingReload: readonly string[]
  /** `extensionUpdater.earlyReleaseProtectionHours`, read live so config changes apply on refresh */
  readonly thresholdHours: number
  /** id with an install in flight right now; shown as a grey "Updating…" tag */
  readonly updatingId: string | undefined
  /** installed extensions on Microsoft's removed-packages list */
  readonly removed: readonly RemovedRow[]
  /** per-id repository warning for the listed updates */
  readonly repoWarnings: ReadonlyMap<string, RepoStatus>
}

/** PendingUpdate as rendered in the webview: ages resolved on the host side. */
interface WebUpdate {
  readonly id: string
  readonly displayName: string
  readonly installedVersion: string
  readonly availableVersion: string
  /** ISO-8601; kept so the object can round-trip back as a PendingUpdate */
  readonly releasedAt: string
  readonly iconUrl?: string
  readonly publisher: string
  readonly age: string
  readonly recent: boolean
  /** installed this session; waiting for reload to take effect */
  readonly updated: boolean
  /** install in flight right now */
  readonly updating: boolean
  readonly malicious?: readonly string[]
  readonly pastVulnsLabel?: string
  /** OSV ids affecting the installed version; the update fixes them */
  readonly installedVulns?: readonly string[]
  /** OSV findings in bundled npm dependencies */
  readonly depVulns?: readonly { readonly name: string; readonly version: string; readonly ids: readonly string[] }[]
  /** source-repository notice: yellow warning when the repo cannot be audited,
   * gray info line when it is simply outside GitHub */
  readonly repoNotice?: { readonly text: string; readonly muted: boolean }
}

/** RemovedRow as rendered in the webview. */
interface WebRemoved {
  readonly id: string
  readonly displayName: string
  readonly version: string
  readonly reason: string
}

/** Runtime narrow for update objects round-tripping through the webview as unknown. */
export function asPendingUpdate(value: unknown): PendingUpdate | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const id = record['id']
  const displayName = record['displayName']
  const installedVersion = record['installedVersion']
  const availableVersion = record['availableVersion']
  const releasedAt = record['releasedAt']
  if (
    typeof id !== 'string' ||
    typeof displayName !== 'string' ||
    typeof installedVersion !== 'string' ||
    typeof availableVersion !== 'string' ||
    typeof releasedAt !== 'string'
  ) {
    return undefined
  }
  return { id, displayName, installedVersion, availableVersion, releasedAt }
}

/**
 * Webview replacement for the native tree: rows styled after the built-in
 * Extensions view (icon, bold name, versions + publisher, inline Update).
 * The API cannot color label text nor break lines (VS Code escapes `\n`
 * since 1.73), so the native look requires a webview.
 */
export class UpdatesWebviewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private searching = false

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly model: UpdatesModel,
    private readonly resolveBanner: () => string | undefined,
    private readonly resolveAutoUpdate: () => {
      state: 'enabled' | 'partial' | 'disabled'
      needsReload: boolean
    },
  ) {}

  /** Set while the gallery query is in flight; shown as a muted status line. */
  setSearching(searching: boolean): void {
    this.searching = searching
    this.post()
  }

  /** Push the current model + banner into the webview (no-op while unresolved). */
  invalidate(): void {
    this.post()
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    // html BEFORE options: main-side webviews start with html '' and
    // contentOptions {}, so setting options first re-pushes EMPTY html once and
    // the iframe fires no-csp-found (dev-mode warning). With html stored first,
    // the options push carries our CSP html instead.
    view.webview.html = renderHtml(view.webview, this.extensionUri)
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] }
    view.onDidDispose(() => {
      this.view = undefined
    })
    // The auto-update opt-in list lives in VS Code's internal storage: no event
    // fires when the user toggles it elsewhere, so re-query on every activation.
    view.onDidChangeVisibility(() => {
      if (view.visible) this.post()
    })
    view.webview.onDidReceiveMessage((message: unknown) => {
      if (!isRecord(message)) return
      if (message['type'] === 'ready') this.post()
      if (message['type'] === 'fixAutoUpdate') {
        void vscode.commands.executeCommand('extensionUpdater.disableAutoUpdate')
      }
      if (message['type'] === 'reload') {
        void vscode.commands.executeCommand('workbench.action.reloadWindow')
      }
      if (message['type'] === 'refresh') {
        void vscode.commands.executeCommand('extensionUpdater.refresh')
      }
      if (message['type'] === 'updateAll') {
        void vscode.commands.executeCommand('extensionUpdater.updateAll')
      }
      if (message['type'] === 'uninstall') {
        void vscode.commands.executeCommand('extensionUpdater.uninstall', message['id'])
      }
      if (message['type'] === 'update') {
        const update = asPendingUpdate(message['update'])
        if (update) void vscode.commands.executeCommand('extensionUpdater.update', update)
      }
    })
    // If 'ready' already fired, the handler above re-posts; otherwise this wins the race.
    this.post()
  }

  private post(): void {
    const view = this.view
    if (!view) return
    // Activity-bar badge mirrors the native Extensions icon: pending-update count.
    const count = this.model.updates.length
    view.badge = count > 0 ? { value: count, tooltip: strings.badgeTooltip(count) } : undefined
    const now = new Date()
    const autoUpdate = this.resolveAutoUpdate()
    const waiting = new Set(this.model.pendingReload)
    const updates: WebUpdate[] = this.model.updates.map((update) => ({
      id: update.id,
      displayName: update.displayName,
      installedVersion: update.installedVersion,
      availableVersion: update.availableVersion,
      releasedAt: update.releasedAt,
      iconUrl: update.iconUrl,
      // marketplace publisher names cannot contain dots
      publisher: update.id.split('.')[0] ?? '',
      age: relativeAge(update.releasedAt, now),
      recent: isRecentRelease(update.releasedAt, now, this.model.thresholdHours),
      updated: waiting.has(update.id),
      updating: update.id === this.model.updatingId,
      malicious: update.malicious,
      pastVulnsLabel: update.pastVulns ? strings.pastVulns(update.pastVulns) : undefined,
      installedVulns: update.installedVulns,
      depVulns: update.depVulns,
      repoNotice: repoNoticeLabel(this.model.repoWarnings.get(update.id)),
    }))
    const removed: WebRemoved[] = this.model.removed.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      version: row.version,
      reason: strings.removedReason(row.entry.date, row.entry.type),
    }))
    void view.webview.postMessage({
      type: 'state',
      updates,
      removed,
      banner: this.resolveBanner(),
      reloadBanner:
        this.model.pendingReload.length > 0 ? strings.reloadBanner(this.model.pendingReload.length) : undefined,
      searching: this.searching,
      autoUpdate: autoUpdate.state,
      needsReload: autoUpdate.needsReload,
      labels: {
        empty: strings.upToDate,
        searching: strings.searching,
        update: strings.updateButton,
        updateAll: strings.updateAllLabel,
        checkUpdates: strings.checkUpdatesLabel,
        pendingUpdates: strings.pendingUpdates,
        maliciousFindings: strings.maliciousFindings,
        maliciousButton: strings.maliciousButton,
        mustUpdate: strings.mustUpdateButton,
        updated: strings.updatedButton,
        updating: strings.updatingButton,
        reloadVscode: strings.reloadVscode,
        installedVulns: strings.installedVulns,
        depVulns: strings.depVulns,
        removedTitle: strings.removedTitle,
        uninstall: strings.uninstallButton,
        fix: strings.fixAutoUpdate,
        reload: strings.reloadToTakeEffect,
        autoUpdateText: {
          enabled: strings.autoUpdateEnabled,
          partial: strings.autoUpdatePartial,
          disabled: strings.autoUpdateDisabled,
        },
      },
    })
  }
}

function repoNoticeLabel(status: RepoStatus): { readonly text: string; readonly muted: boolean } | undefined {
  if (status === 'missing') return { text: strings.repoMissing, muted: false }
  if (status === 'private') return { text: strings.repoPrivate, muted: false }
  if (status === 'outside-github') return { text: strings.repoOutsideGithub, muted: true }
  return undefined
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  // gallery icons come from https CDNs; styles/scripts are extension files (official sample pattern)
  const csp = `default-src 'none'; img-src https: ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';`
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'updates.css'))
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'updates.js'))
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link href="${styleUri}" rel="stylesheet">
</head>
<body>
<div id="auto-update"></div>
<div id="banner"></div>
<div id="actions-group"></div>
<div id="reload-banner"></div>
<div id="pending-title"></div>
<div id="status"></div>
<div id="list"></div>
<div id="removed"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}
