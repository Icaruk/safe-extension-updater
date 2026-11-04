import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { autoUpdateState, optInsAutoUpdate } from './core/autoUpdateValue.js'
import { strings } from './strings.js'

/**
 * Tracks the native `extensions.autoUpdate` setting: warns on activation and on
 * every re-enable, and offers the persistent view banner through `onStateChange`.
 * The `extensionUpdater.disableAutoUpdate` command is registered here for the
 * webview "Fix" button.
 */
export class AutoUpdateGuard {
  private onStateChange?: (active: boolean) => void

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Last computed state; read by the view to prioritize banners. */
  private lastState?: 'enabled' | 'partial' | 'disabled'

  /** True after clearing opt-ins: VS Code still holds the old list in memory until a window reload. */
  needsReload = false

  /** Tri-state for the in-view section: enabled / partial / disabled. */
  get state(): 'enabled' | 'partial' | 'disabled' {
    const state = autoUpdateState(vscode.workspace.getConfiguration('extensions').get<unknown>('autoUpdate'))
    if (state !== 'disabled') return state
    // ponytail: per-extension opt-ins live only in VS Code's internal storage
    // (no API), read state.vscdb readonly via the sqlite3 CLI. Blocks ~20ms;
    // cache if view refreshes ever make that noticeable.
    if (this.optInsAutoUpdate()) return 'partial'
    return state
  }

  /** Any extension/publisher opted into auto-update while the setting is off? */
  private optInsAutoUpdate(): boolean {
    try {
      const raw = execFileSync(
        'sqlite3',
        ['-readonly', this.dbPath(), "SELECT value FROM ItemTable WHERE key='extensions.autoUpdate';"],
        { encoding: 'utf8', timeout: 2000 }, // never block view load on a DB lock
      )
      return optInsAutoUpdate(JSON.parse(raw))
    } catch {
      return false // missing sqlite3/db or parse failure → assume no opt-ins
    }
  }

  private dbPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, '..', 'state.vscdb')
  }

  init(onStateChange: (active: boolean) => void): void {
    this.onStateChange = onStateChange
    this.apply()
    this.context.subscriptions.push(
      // No affectsConfiguration filter: it has quirks with application-scoped
      // settings; apply() diffs the state and no-ops on unrelated changes.
      vscode.workspace.onDidChangeConfiguration(() => this.apply()),
      vscode.commands.registerCommand('extensionUpdater.disableAutoUpdate', () => this.disable()),
    )
  }

  private apply(): void {
    const state = this.state
    if (state === this.lastState) return
    const first = this.lastState === undefined
    const wasActive = !first && this.lastState !== 'disabled'
    this.lastState = state
    const active = state !== 'disabled'
    this.onStateChange?.(active)
    if (active && (first || !wasActive)) {
      void vscode.window.showWarningMessage(strings.autoUpdateWarning, strings.disableAutoUpdate).then((choice) => {
        if (choice === strings.disableAutoUpdate) void this.disable()
      })
    }
  }

  /**
   * Write `extensions.autoUpdate: false` to the tightest scope where the value
   * is currently defined: Workspace when a workspaceValue exists, Global
   * otherwise. When extensions were individually opted in while the setting
   * was off, clears VS Code's internal opt-in list too (state.vscdb; the
   * official command no-ops once the setting is off) and asks for a reload.
   */
  async disable(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('extensions')
    const inspection = configuration.inspect('autoUpdate')
    const target =
      inspection && inspection.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global
    await configuration.update('autoUpdate', false, target)
    if (this.optInsAutoUpdate()) {
      if (this.clearOptIns()) {
        this.needsReload = true
        void vscode.window.showInformationMessage(strings.optInsCleared, strings.reloadToTakeEffect).then((choice) => {
          if (choice === strings.reloadToTakeEffect) {
            void vscode.commands.executeCommand('workbench.action.reloadWindow')
          }
        })
      } else {
        void vscode.window.showErrorMessage(strings.optInsClearFailed)
      }
    }
    // Notify the view even when the setting did not change (already off):
    // the panel must learn needsReload / re-render its section.
    this.onStateChange?.(this.state !== 'disabled')
  }

  /** ponytail: VS Code exposes no API to reset its per-extension opt-in list;
   * clear it in state.vscdb directly. Live VS Code keeps its own in-memory
   * copy until reload, hence optInsCleared asks for one. */
  private clearOptIns(): boolean {
    try {
      execFileSync('sqlite3', [this.dbPath(), "UPDATE ItemTable SET value='[]' WHERE key='extensions.autoUpdate';"], {
        timeout: 2000,
      })
      return true
    } catch {
      return false
    }
  }
}
